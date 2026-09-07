import crypto from "node:crypto";
import { buildWorkflow } from "../workflow";
import {
  fetchWithTimeout,
  ProviderError,
  type GeneratedImage,
  type ImageProvider,
  type ProviderContext,
  type ProviderResult,
} from "./types";

/**
 * ComfyUI backend — the only provider that genuinely loads the LoRA stack.
 *
 * Point `COMFYUI_URL` at a running instance whose `models/checkpoints` and
 * `models/loras` folders contain the filenames declared in the catalog.
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

/**
 * Subscribes to ComfyUI's websocket for real sampler progress. Failure is
 * non-fatal: the caller still polls `/history`, it just loses the fine-grained
 * progress bar.
 */
function attachProgress(
  clientId: string,
  promptId: string,
  onProgress: (p: number) => void,
): () => void {
  let socket: WebSocket | null = null;
  try {
    const wsUrl = `${BASE_URL.replace(/^http/, "ws")}/ws?clientId=${encodeURIComponent(clientId)}`;
    socket = new WebSocket(wsUrl);
    socket.addEventListener("message", (event) => {
      if (typeof event.data !== "string") return;
      try {
        const msg = JSON.parse(event.data) as {
          type: string;
          data?: { prompt_id?: string; value?: number; max?: number };
        };
        if (msg.data?.prompt_id && msg.data.prompt_id !== promptId) return;
        if (msg.type === "progress" && msg.data?.max) {
          onProgress(Math.min(0.99, (msg.data.value ?? 0) / msg.data.max));
        } else if (msg.type === "executing" && msg.data?.prompt_id === promptId) {
          onProgress(0.05);
        }
      } catch {
        // Malformed frame — ignore and keep listening.
      }
    });
    socket.addEventListener("error", () => {});
  } catch {
    socket = null;
  }
  return () => {
    try {
      socket?.close();
    } catch {
      /* already closed */
    }
  };
}

export const comfyuiProvider: ImageProvider = {
  id: "comfyui",
  label: "ComfyUI",
  summary: "Self-hosted. Full LoRA stack, samplers, img2img and hires fix — the intended backend.",
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
      const stats = (await res.json()) as {
        devices?: { name?: string; vram_total?: number }[];
      };
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

  async generate(ctx: ProviderContext): Promise<ProviderResult> {
    const warnings: string[] = [];
    const clientId = crypto.randomUUID();

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

    const { graph, outputNodeId } = buildWorkflow(ctx, uploadedName);

    const queued = await fetchWithTimeout(
      `${BASE_URL}/prompt`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ prompt: graph, client_id: clientId }),
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

    const { prompt_id: promptId } = (await queued.json()) as { prompt_id: string };
    const detachProgress = attachProgress(clientId, promptId, ctx.onProgress);

    try {
      const deadline = Date.now() + Number(process.env.COMFYUI_TIMEOUT_MS ?? 600_000);
      let entry: HistoryEntry | undefined;

      while (Date.now() < deadline) {
        if (ctx.signal.aborted) throw new ProviderError("Cancelled.");
        const res = await fetchWithTimeout(
          `${BASE_URL}/history/${promptId}`,
          { timeoutMs: 15_000 },
          ctx.signal,
        );
        if (res.ok) {
          const history = (await res.json()) as Record<string, HistoryEntry>;
          entry = history[promptId];
          if (entry?.status?.completed || entry?.outputs) break;
          if (entry?.status?.status_str === "error") {
            throw new ProviderError(
              `ComfyUI execution failed: ${JSON.stringify(entry.status.messages ?? []).slice(0, 500)}`,
            );
          }
        }
        await new Promise((r) => setTimeout(r, 900));
      }

      if (!entry) throw new ProviderError("ComfyUI did not finish before the timeout.", true);

      const outputs = entry.outputs[outputNodeId]?.images ?? Object.values(entry.outputs).flatMap((o) => o.images ?? []);
      if (outputs.length === 0) throw new ProviderError("ComfyUI produced no images.");

      const images: GeneratedImage[] = [];
      for (const [index, ref] of outputs.entries()) {
        const url =
          `${BASE_URL}/view?filename=${encodeURIComponent(ref.filename)}` +
          `&subfolder=${encodeURIComponent(ref.subfolder ?? "")}&type=${encodeURIComponent(ref.type ?? "output")}`;
        const res = await fetchWithTimeout(url, { timeoutMs: 60_000 }, ctx.signal);
        if (!res.ok) throw new ProviderError(`Could not download ${ref.filename} (HTTP ${res.status}).`);
        images.push({
          bytes: new Uint8Array(await res.arrayBuffer()),
          mimeType: res.headers.get("content-type") ?? "image/png",
          // ComfyUI increments the seed per batch item.
          seed: ctx.request.seed + index,
          width: ctx.request.width,
          height: ctx.request.height,
        });
      }

      ctx.onProgress(1);
      return { images, warnings };
    } finally {
      detachProgress();
    }
  },
};
