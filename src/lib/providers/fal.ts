import { weightsFor } from "../catalog";
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
 * fal.ai — a hosted GPU that loads arbitrary LoRA weights from a URL.
 *
 * This is the cloud answer to "I want my LoRA stack but I do not want to run
 * ComfyUI". It is not free: fal bills per second of GPU time (new accounts get
 * a small credit). Nothing else in this file pretends otherwise.
 *
 * Uses fal's queue protocol, so `start` returns as soon as the job is accepted
 * and the browser polls from there — no long-running request, which is what
 * makes it viable on a serverless host.
 */

const QUEUE_URL = (process.env.FAL_QUEUE_URL ?? "https://queue.fal.run").replace(/\/+$/, "");
const KEY = process.env.FAL_KEY ?? "";
/** Any fal app that accepts `loras: [{ path, scale }]`. */
const APP = process.env.FAL_MODEL ?? "fal-ai/lora";

interface FalHandle {
  app: string;
  requestId: string;
  width: number;
  height: number;
  seed: number;
}

function authHeaders(): Record<string, string> {
  return { authorization: `Key ${KEY}`, "content-type": "application/json" };
}

/** fal returns `{ images: [{ url, width, height }], seed }`. */
function toImages(payload: unknown, handle: FalHandle): GeneratedImage[] {
  const body = payload as {
    images?: { url?: string; width?: number; height?: number }[];
    image?: { url?: string };
    seed?: number;
  };
  const list = body.images ?? (body.image ? [body.image] : []);
  return list
    .filter((image): image is { url: string; width?: number; height?: number } => Boolean(image?.url))
    .map((image, index) => ({
      source: { kind: "url" as const, url: image.url },
      seed: Number(body.seed ?? handle.seed) + index,
      width: image.width ?? handle.width,
      height: image.height ?? handle.height,
    }));
}

export const falProvider: ImageProvider = {
  id: "fal",
  label: "fal.ai",
  summary: "Paid hosted GPU. Loads your checkpoint and LoRA weights from URLs — the cloud LoRA path.",
  requiresKey: true,
  capabilities: {
    textToImage: true,
    imageToImage: true,
    upscale: false,
    loras: true,
    negativePrompt: true,
    seed: true,
    customSampler: false,
    batch: true,
    maxPixels: 1536 * 1536,
  },

  isConfigured() {
    return Boolean(KEY);
  },

  async health() {
    if (!KEY) return { available: false, detail: "Set FAL_KEY to enable (paid, per-second billing)." };
    // fal has no cheap unauthenticated ping, and a real call costs money, so
    // report configuration rather than pretending to have reached the GPU.
    return { available: true, detail: `key configured · app "${APP}"` };
  },

  async start(ctx: ProviderContext): Promise<StartResult> {
    if (!KEY) throw new ProviderError("FAL_KEY is not set.");
    const { request: r } = ctx;
    const warnings: string[] = [];

    const loras: { path: string; scale: number }[] = [];
    for (const { lora, strength } of ctx.loras) {
      const url = weightsFor(lora);
      if (!url) {
        warnings.push(
          `${lora.name} was skipped: fal loads LoRAs over HTTP and no weights URL is configured for it. ` +
            "Add one to GENIMAGE_WEIGHTS.",
        );
        continue;
      }
      loras.push({ path: url, scale: strength });
    }

    const modelName = weightsFor(ctx.checkpoint) ?? ctx.checkpoint.huggingFaceId;
    if (!modelName) {
      warnings.push(
        `No weights URL is configured for "${ctx.checkpoint.name}", so fal used its default base model.`,
      );
    }

    const body: Record<string, unknown> = {
      prompt: r.finalPrompt,
      negative_prompt: r.finalNegativePrompt || undefined,
      image_size: { width: r.width, height: r.height },
      num_inference_steps: r.steps,
      guidance_scale: r.cfg,
      num_images: r.batchSize,
      seed: r.seed,
      enable_safety_checker: process.env.FAL_SAFETY_CHECKER !== "0",
      ...(modelName ? { model_name: modelName } : {}),
      ...(loras.length > 0 ? { loras } : {}),
    };

    if (r.mode !== "generate" && ctx.referenceImage) {
      // fal accepts a data URI wherever it accepts an image URL, which avoids
      // needing our own publicly reachable upload endpoint.
      const base64 = ctx.referenceImage.bytes.toString("base64");
      body.image_url = `data:${ctx.referenceImage.mimeType};base64,${base64}`;
      body.strength = r.denoise;
    } else if (r.mode !== "generate") {
      warnings.push(`${r.mode} mode needs a reference image; ran a plain text-to-image instead.`);
    }

    const res = await fetchWithTimeout(
      `${QUEUE_URL}/${APP}`,
      { method: "POST", headers: authHeaders(), body: JSON.stringify(body), timeoutMs: 20_000 },
      ctx.signal,
    );

    if (!res.ok) {
      throw new ProviderError(
        `fal rejected the request (HTTP ${res.status}): ${(await res.text()).slice(0, 400)}`,
        res.status >= 500,
      );
    }

    const queued = (await res.json()) as { request_id?: string };
    if (!queued.request_id) throw new ProviderError("fal did not return a request id.");

    const handle: FalHandle = {
      app: APP,
      requestId: queued.request_id,
      width: r.width,
      height: r.height,
      seed: r.seed,
    };
    return { status: "pending", handle, warnings };
  },

  async cancel(rawHandle: unknown, signal: AbortSignal): Promise<void> {
    const handle = rawHandle as FalHandle;
    if (!KEY || !handle?.requestId) return;
    await fetchWithTimeout(
      `${QUEUE_URL}/${handle.app}/requests/${encodeURIComponent(handle.requestId)}/cancel`,
      { method: "PUT", headers: authHeaders(), timeoutMs: 10_000 },
      signal,
    );
  },

  async poll(rawHandle: unknown, ctx: ProviderContext): Promise<PollResult> {
    if (!KEY) return { status: "failed", error: "FAL_KEY is not set." };
    const handle = rawHandle as FalHandle;
    if (!handle?.requestId) return { status: "failed", error: "Missing the fal request handle." };

    const base = `${QUEUE_URL}/${handle.app}/requests/${encodeURIComponent(handle.requestId)}`;

    const statusRes = await fetchWithTimeout(
      `${base}/status`,
      { headers: authHeaders(), timeoutMs: 15_000 },
      ctx.signal,
    );
    if (!statusRes.ok) {
      return {
        status: "failed",
        error: `fal status check failed (HTTP ${statusRes.status}): ${(await statusRes.text()).slice(0, 300)}`,
      };
    }

    const status = (await statusRes.json()) as { status?: string; queue_position?: number };

    if (status.status === "IN_QUEUE") {
      return { status: "pending", progress: 0.05 };
    }
    if (status.status === "IN_PROGRESS") {
      return { status: "pending", progress: 0.5 };
    }
    if (status.status !== "COMPLETED" && status.status !== "OK") {
      return { status: "failed", error: `fal reported status "${status.status ?? "unknown"}".` };
    }

    const resultRes = await fetchWithTimeout(
      base,
      { headers: authHeaders(), timeoutMs: 20_000 },
      ctx.signal,
    );
    if (!resultRes.ok) {
      return {
        status: "failed",
        error: `fal result fetch failed (HTTP ${resultRes.status}): ${(await resultRes.text()).slice(0, 300)}`,
      };
    }

    const images = toImages(await resultRes.json(), handle);
    if (images.length === 0) return { status: "failed", error: "fal returned no images." };
    return { status: "done", images };
  },
};
