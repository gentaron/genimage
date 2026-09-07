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
 * Replicate — hosted GPU, paid per second, with LoRA support.
 *
 * Second cloud option alongside fal. Which model you point it at decides what
 * the input schema looks like, so `REPLICATE_MODEL` selects the model and the
 * LoRA fields follow the common `lora_urls` / `lora_scales` convention used by
 * the SDXL LoRA models on Replicate.
 *
 * Predictions are asynchronous by design here: `start` creates one and returns,
 * the browser polls. No long-running request, so it fits a serverless budget.
 */

const API_URL = (process.env.REPLICATE_API_URL ?? "https://api.replicate.com/v1").replace(/\/+$/, "");
const TOKEN = process.env.REPLICATE_API_TOKEN ?? "";
/** Either `owner/name` or `owner/name:version`. */
const MODEL = process.env.REPLICATE_MODEL ?? "lucataco/sdxl-lora";

interface ReplicateHandle {
  id: string;
  width: number;
  height: number;
  seed: number;
}

function authHeaders(): Record<string, string> {
  return { authorization: `Bearer ${TOKEN}`, "content-type": "application/json" };
}

function outputToImages(output: unknown, handle: ReplicateHandle): GeneratedImage[] {
  // Replicate models return a URL, a list of URLs, or `{ output: [...] }`.
  const urls: string[] = Array.isArray(output)
    ? output.filter((entry): entry is string => typeof entry === "string")
    : typeof output === "string"
      ? [output]
      : [];

  return urls.map((url, index) => ({
    source: { kind: "url" as const, url },
    seed: handle.seed + index,
    width: handle.width,
    height: handle.height,
  }));
}

export const replicateProvider: ImageProvider = {
  id: "replicate",
  label: "Replicate",
  summary: "Paid hosted GPU. Runs SDXL LoRA models by URL; a second cloud option alongside fal.",
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
    return Boolean(TOKEN);
  },

  async health(signal) {
    if (!TOKEN) {
      return { available: false, detail: "Set REPLICATE_API_TOKEN to enable (paid, per-second billing)." };
    }
    try {
      const res = await fetchWithTimeout(
        `${API_URL}/account`,
        { headers: authHeaders(), timeoutMs: 5000 },
        signal,
      );
      if (!res.ok) return { available: false, detail: `Token rejected (HTTP ${res.status}).` };
      const account = (await res.json()) as { username?: string };
      return { available: true, detail: `${account.username ?? "authenticated"} · model "${MODEL}"` };
    } catch (error) {
      return { available: false, detail: `Unreachable (${(error as Error).message})` };
    }
  },

  async start(ctx: ProviderContext): Promise<StartResult> {
    if (!TOKEN) throw new ProviderError("REPLICATE_API_TOKEN is not set.");
    const { request: r } = ctx;
    const warnings: string[] = [];

    const loraUrls: string[] = [];
    const loraScales: number[] = [];
    for (const { lora, strength } of ctx.loras) {
      const url = weightsFor(lora);
      if (!url) {
        warnings.push(
          `${lora.name} was skipped: Replicate loads LoRAs over HTTP and no weights URL is configured ` +
            "for it. Add one to GENIMAGE_WEIGHTS.",
        );
        continue;
      }
      loraUrls.push(url);
      loraScales.push(strength);
    }

    const input: Record<string, unknown> = {
      prompt: r.finalPrompt,
      negative_prompt: r.finalNegativePrompt || undefined,
      width: r.width,
      height: r.height,
      num_inference_steps: r.steps,
      guidance_scale: r.cfg,
      num_outputs: r.batchSize,
      seed: r.seed,
      ...(loraUrls.length > 0
        ? { lora_urls: loraUrls.join("|"), lora_scales: loraScales.join("|") }
        : {}),
    };

    if (r.mode !== "generate" && ctx.referenceImage) {
      input.image = `data:${ctx.referenceImage.mimeType};base64,${ctx.referenceImage.bytes.toString("base64")}`;
      input.prompt_strength = r.denoise;
    } else if (r.mode !== "generate") {
      warnings.push(`${r.mode} mode needs a reference image; ran a plain text-to-image instead.`);
    }

    // A pinned `owner/name:version` posts to /predictions; a bare `owner/name`
    // posts to that model's own endpoint and runs its default version.
    const [modelPath, version] = MODEL.split(":");
    const endpoint = version ? `${API_URL}/predictions` : `${API_URL}/models/${modelPath}/predictions`;
    const body = version ? { version, input } : { input };

    const res = await fetchWithTimeout(
      endpoint,
      { method: "POST", headers: authHeaders(), body: JSON.stringify(body), timeoutMs: 20_000 },
      ctx.signal,
    );

    if (!res.ok) {
      throw new ProviderError(
        `Replicate rejected the request (HTTP ${res.status}): ${(await res.text()).slice(0, 400)}`,
        res.status >= 500,
      );
    }

    const prediction = (await res.json()) as { id?: string; status?: string; output?: unknown };
    if (!prediction.id) throw new ProviderError("Replicate did not return a prediction id.");

    const handle: ReplicateHandle = {
      id: prediction.id,
      width: r.width,
      height: r.height,
      seed: r.seed,
    };

    // Rarely a cached prediction is already finished.
    if (prediction.status === "succeeded") {
      const images = outputToImages(prediction.output, handle);
      if (images.length > 0) return { status: "done", images, warnings };
    }

    return { status: "pending", handle, warnings };
  },

  async cancel(rawHandle: unknown, signal: AbortSignal): Promise<void> {
    const handle = rawHandle as ReplicateHandle;
    if (!TOKEN || !handle?.id) return;
    await fetchWithTimeout(
      `${API_URL}/predictions/${encodeURIComponent(handle.id)}/cancel`,
      { method: "POST", headers: authHeaders(), timeoutMs: 10_000 },
      signal,
    );
  },

  async poll(rawHandle: unknown, ctx: ProviderContext): Promise<PollResult> {
    if (!TOKEN) return { status: "failed", error: "REPLICATE_API_TOKEN is not set." };
    const handle = rawHandle as ReplicateHandle;
    if (!handle?.id) return { status: "failed", error: "Missing the Replicate prediction handle." };

    const res = await fetchWithTimeout(
      `${API_URL}/predictions/${encodeURIComponent(handle.id)}`,
      { headers: authHeaders(), timeoutMs: 15_000 },
      ctx.signal,
    );
    if (!res.ok) {
      return {
        status: "failed",
        error: `Replicate status check failed (HTTP ${res.status}): ${(await res.text()).slice(0, 300)}`,
      };
    }

    const prediction = (await res.json()) as {
      status?: string;
      output?: unknown;
      error?: string;
      logs?: string;
    };

    if (prediction.status === "succeeded") {
      const images = outputToImages(prediction.output, handle);
      if (images.length === 0) return { status: "failed", error: "Replicate returned no images." };
      return { status: "done", images };
    }
    if (prediction.status === "failed" || prediction.status === "canceled") {
      return {
        status: "failed",
        error: prediction.error || `Replicate prediction ${prediction.status}.`,
      };
    }

    return { status: "pending", progress: prediction.status === "processing" ? 0.5 : 0.05 };
  },
};
