import crypto from "node:crypto";
import { buildWorkflow } from "../workflow";
import {
  fetchWithTimeout,
  ProviderError,
  type GeneratedImage,
  type ImageProvider,
  type PollResult,
  type ProviderContext,
  type StartResult,
} from "./types";

/**
 * ComfyUI backend — full local control of the LoRA stack, samplers and hires fix.
 *
 * Point `COMFYUI_URL` at a running instance whose `models/checkpoints` and
 * `models/loras` folders contain the filenames declared in the catalog. This is
 * a self-hosted backend: a serverless deployment cannot reach a ComfyUI running
 * on someone's laptop, so it only shows as available when the URL resolves.
 *
 * ComfyUI's own API is already submit-then-poll (`/prompt` then `/history`),
 * which maps directly onto this interface.
 */

const BASE_URL = (process.env.COMFYUI_URL ?? "http://127.0.0.1:8188").replace(/\/+$/, "");

interface HistoryEntry {
  outputs: Record<string, { images?: { filename: string; subfolder: string; type: string }[] }>;
  status?: { completed?: boolean; status_str?: string; messages?: unknown[] };
}

async function uploadReference(
  bytes: Buffer,
  mimeType: string,
  signal: AbortSignal,
): Promise<string> {
  const ext = mimeType === "image/jpeg" ? "jpg" : mimeType === "image/webp" ? "webp" : "png";
  const name = `genimage_ref_${crypto.randomBytes(6).toString("hex")}.${ext}`;
  const form = new FormData();
  form.append("image", new Blob([new Uint8Array(bytes)], { type: mimeType }), name);
  form.append("overwrite", "true");
  form.append("type", "input");

  const res = await fetchWithTimeout(
    `${BASE_URL}/upload/image`,
    { method: "POST", body: form, timeoutMs: 60_000 },
    signal,
  );
  if (!res.ok) {
    throw new ProviderError(`ComfyUI rejected the reference image (HTTP ${res.status}).`);
  }
  const json = (await res.json()) as { name?: string; subfolder?: string };
  if (!json.name) throw new ProviderError("ComfyUI did not return an uploaded filename.");
  return json.subfolder ? `${json.subfolder}/${json.name}` : json.name;
}

interface ComfyHandle {
  promptId: string;
  width: number;
  height: number;
  seed: number;
}

export const comfyuiProvider: ImageProvider = {
  id: "comfyui",
  label: "ComfyUI",
  summary: "Self-hosted. Full LoRA stack, samplers, img2img and hires fix — free, but needs your own GPU.",
  requiresKey: false,
  capabilities: {
    textToImage: true,
    imageToImage: true,
    upscale: true,
    loras: true,
    negativePrompt: true,
    seed: true,
    customSampler: true,
    batch: true,
    maxPixels: 4096 * 4096,
  },

  isConfigured() {
    return Boolean(BASE_URL);
  },

  async health(signal) {
    try {
      const res = await fetchWithTimeout(`${BASE_URL}/system_stats`, { timeoutMs: 2500 }, signal);
      if (!res.ok) return { available: false, detail: `HTTP ${res.status} from ${BASE_URL}` };
      const stats = (await res.json()) as { devices?: { name?: string; vram_total?: number }[] };
      const device = stats.devices?.[0];
      const vram = device?.vram_total ? ` · ${Math.round(device.vram_total / 1024 ** 3)} GB VRAM` : "";
      return { available: true, detail: `${device?.name ?? "connected"}${vram}` };
    } catch (error) {
      return {
        available: false,
        detail: `Not reachable at ${BASE_URL} (${(error as Error).message})`,
      };
    }
  },

  async start(ctx: ProviderContext): Promise<StartResult> {
    const warnings: string[] = [];

    let uploadedName: string | null = null;
    if (ctx.referenceImage) {
      uploadedName = await uploadReference(
        ctx.referenceImage.bytes,
        ctx.referenceImage.mimeType,
        ctx.signal,
      );
    } else if (ctx.request.mode !== "generate") {
      warnings.push(`${ctx.request.mode} mode needs a reference image; ran a plain text-to-image instead.`);
    }

    const { graph } = buildWorkflow(ctx, uploadedName);

    const queued = await fetchWithTimeout(
      `${BASE_URL}/prompt`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ prompt: graph, client_id: crypto.randomUUID() }),
        timeoutMs: 30_000,
      },
      ctx.signal,
    );

    if (!queued.ok) {
      const body = await queued.text();
      // ComfyUI returns a structured validation error naming the offending node.
      let detail = body.slice(0, 600);
      try {
        const parsed = JSON.parse(body) as { error?: { message?: string }; node_errors?: unknown };
        if (parsed.error?.message) {
          detail = parsed.error.message;
          if (parsed.node_errors) detail += ` — ${JSON.stringify(parsed.node_errors).slice(0, 400)}`;
        }
      } catch {
        /* keep the raw body */
      }
      throw new ProviderError(`ComfyUI rejected the workflow: ${detail}`);
    }

    const { prompt_id: promptId } = (await queued.json()) as { prompt_id?: string };
    if (!promptId) throw new ProviderError("ComfyUI did not return a prompt id.");

    const handle: ComfyHandle = {
      promptId,
      width: ctx.request.width,
      height: ctx.request.height,
      seed: ctx.request.seed,
    };
    return { status: "pending", handle, warnings };
  },

  async poll(rawHandle: unknown, ctx: ProviderContext): Promise<PollResult> {
    const handle = rawHandle as ComfyHandle;
    if (!handle?.promptId) return { status: "failed", error: "Missing the ComfyUI prompt handle." };

    const res = await fetchWithTimeout(
      `${BASE_URL}/history/${encodeURIComponent(handle.promptId)}`,
      { timeoutMs: 15_000 },
      ctx.signal,
    );
    if (!res.ok) {
      return { status: "failed", error: `ComfyUI history check failed (HTTP ${res.status}).` };
    }

    const history = (await res.json()) as Record<string, HistoryEntry>;
    const entry = history[handle.promptId];
    // An empty history means it is still queued or running.
    if (!entry) return { status: "pending", progress: 0.1 };

    if (entry.status?.status_str === "error") {
      return {
        status: "failed",
        error: `ComfyUI execution failed: ${JSON.stringify(entry.status.messages ?? []).slice(0, 500)}`,
      };
    }

    const outputs = Object.values(entry.outputs ?? {}).flatMap((output) => output.images ?? []);
    if (outputs.length === 0) {
      return entry.status?.completed
        ? { status: "failed", error: "ComfyUI finished without producing images." }
        : { status: "pending", progress: 0.5 };
    }

    // ComfyUI serves outputs from its own host, which the browser generally
    // cannot reach, so the bytes are pulled through and stored by the caller.
    const images: GeneratedImage[] = [];
    for (const [index, ref] of outputs.entries()) {
      const url =
        `${BASE_URL}/view?filename=${encodeURIComponent(ref.filename)}` +
        `&subfolder=${encodeURIComponent(ref.subfolder ?? "")}&type=${encodeURIComponent(ref.type ?? "output")}`;
      const image = await fetchWithTimeout(url, { timeoutMs: 60_000 }, ctx.signal);
      if (!image.ok) {
        return { status: "failed", error: `Could not download ${ref.filename} (HTTP ${image.status}).` };
      }
      images.push({
        source: {
          kind: "bytes",
          bytes: new Uint8Array(await image.arrayBuffer()),
          mimeType: image.headers.get("content-type")?.split(";")[0] ?? "image/png",
        },
        // ComfyUI increments the seed per batch item.
        seed: handle.seed + index,
        width: handle.width,
        height: handle.height,
      });
    }

    return { status: "done", images };
  },
};
