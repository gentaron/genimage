import {
  fetchWithTimeout,
  ProviderError,
  type GeneratedImage,
  type ImageProvider,
  type ProviderContext,
  type ProviderResult,
} from "./types";

/**
 * Hugging Face Inference — free tier with an account token.
 *
 * Serves the checkpoint itself when the catalog entry declares a repo id, which
 * makes it the best free option for SDXL and FLUX. LoRA weights are still not
 * applied: the serverless endpoints load the base repo only.
 */

const BASE_URL = (process.env.HF_ROUTER_URL ?? "https://router.huggingface.co/hf-inference/models").replace(
  /\/+$/,
  "",
);
const TOKEN = process.env.HF_TOKEN ?? process.env.HUGGING_FACE_HUB_TOKEN ?? "";
const FALLBACK_MODEL = process.env.HF_MODEL ?? "stabilityai/stable-diffusion-xl-base-1.0";

export const huggingfaceProvider: ImageProvider = {
  id: "huggingface",
  label: "Hugging Face",
  summary: "Free tier with an account token. Serves SDXL and FLUX repos; LoRA weights are not applied.",
  requiresKey: true,
  capabilities: {
    textToImage: true,
    imageToImage: false,
    upscale: false,
    loras: false,
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
      return { available: false, detail: "Set HF_TOKEN to enable (free account token works)." };
    }
    try {
      const res = await fetchWithTimeout(
        "https://huggingface.co/api/whoami-v2",
        { headers: { authorization: `Bearer ${TOKEN}` }, timeoutMs: 4000 },
        signal,
      );
      if (!res.ok) return { available: false, detail: `Token rejected (HTTP ${res.status}).` };
      const who = (await res.json()) as { name?: string };
      return { available: true, detail: `authenticated as ${who.name ?? "unknown"}` };
    } catch (error) {
      return { available: false, detail: `Unreachable (${(error as Error).message})` };
    }
  },

  async generate(ctx: ProviderContext): Promise<ProviderResult> {
    if (!TOKEN) throw new ProviderError("HF_TOKEN is not set.");

    const { request: r } = ctx;
    const warnings: string[] = [];
    const model = ctx.checkpoint.huggingFaceId ?? FALLBACK_MODEL;
    if (!ctx.checkpoint.huggingFaceId) {
      warnings.push(
        `"${ctx.checkpoint.name}" is not published on the Hub, so ${model} rendered this instead.`,
      );
    }
    if (ctx.loras.length > 0) {
      warnings.push("Serverless inference loads the base repo only — LoRA weights were not applied.");
    }
    if (r.mode !== "generate") warnings.push(`${r.mode} mode is not supported by this provider.`);

    const images: GeneratedImage[] = [];
    for (let i = 0; i < r.batchSize; i++) {
      if (ctx.signal.aborted) throw new ProviderError("Cancelled.");

      const body = {
        inputs: r.finalPrompt,
        parameters: {
          negative_prompt: r.finalNegativePrompt || undefined,
          width: r.width,
          height: r.height,
          num_inference_steps: r.steps,
          guidance_scale: r.cfg,
          seed: r.seed + i,
        },
      };

      // A cold model answers 503 with an ETA; retry a couple of times.
      let res: Response | null = null;
      for (let attempt = 0; attempt < 3; attempt++) {
        res = await fetchWithTimeout(
          `${BASE_URL}/${model}`,
          {
            method: "POST",
            headers: {
              authorization: `Bearer ${TOKEN}`,
              "content-type": "application/json",
              accept: "image/png",
            },
            body: JSON.stringify(body),
            timeoutMs: 180_000,
          },
          ctx.signal,
        );
        if (res.status !== 503) break;
        warnings.push(`${model} is warming up on the free tier; retrying.`);
        await new Promise((r2) => setTimeout(r2, 8000 * (attempt + 1)));
      }

      if (!res || !res.ok) {
        const detail = res ? `${res.status} ${(await res.text()).slice(0, 300)}` : "no response";
        throw new ProviderError(`Hugging Face inference failed: ${detail}`, res?.status === 503);
      }

      const contentType = res.headers.get("content-type") ?? "image/png";
      if (!contentType.startsWith("image/")) {
        throw new ProviderError(`Hugging Face returned ${contentType} instead of an image.`);
      }

      images.push({
        bytes: new Uint8Array(await res.arrayBuffer()),
        mimeType: contentType.split(";")[0],
        seed: r.seed + i,
        width: r.width,
        height: r.height,
      });
      ctx.onProgress((i + 1) / r.batchSize);
    }

    return { images, warnings };
  },
};
