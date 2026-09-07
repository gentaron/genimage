import {
  fetchWithTimeout,
  ProviderError,
  type GeneratedImage,
  type ImageProvider,
  type ProviderContext,
  type ProviderResult,
} from "./types";

/**
 * Pollinations — free, keyless text-to-image. The zero-setup default so the
 * studio produces real images before anyone installs a GPU stack.
 *
 * It runs its own hosted models, so the checkpoint and LoRA selection cannot be
 * honoured; trigger words still reach the prompt and we say so in a warning.
 */

const BASE_URL = (process.env.POLLINATIONS_URL ?? "https://image.pollinations.ai").replace(/\/+$/, "");
const TOKEN = process.env.POLLINATIONS_TOKEN ?? "";
const MODEL = process.env.POLLINATIONS_MODEL ?? "flux";

/** Pollinations caps the long edge; scale down proportionally rather than crop. */
function clampSize(width: number, height: number): [number, number] {
  const max = 1280;
  const longest = Math.max(width, height);
  if (longest <= max) return [width, height];
  const scale = max / longest;
  const round8 = (n: number) => Math.max(64, Math.round((n * scale) / 8) * 8);
  return [round8(width), round8(height)];
}

export const pollinationsProvider: ImageProvider = {
  id: "pollinations",
  label: "Pollinations",
  summary: "Free and keyless. Hosted FLUX-class models; your checkpoint and LoRA weights do not apply.",
  requiresKey: false,
  capabilities: {
    textToImage: true,
    imageToImage: false,
    upscale: false,
    loras: false,
    negativePrompt: true,
    seed: true,
    customSampler: false,
    batch: true,
    maxPixels: 1280 * 1280,
  },

  isConfigured() {
    return true;
  },

  async health(signal) {
    try {
      const res = await fetchWithTimeout(`${BASE_URL}/models`, { timeoutMs: 4000 }, signal);
      if (!res.ok) return { available: false, detail: `HTTP ${res.status}` };
      return { available: true, detail: `free tier · model "${MODEL}"` };
    } catch (error) {
      return { available: false, detail: `Unreachable (${(error as Error).message})` };
    }
  },

  async generate(ctx: ProviderContext): Promise<ProviderResult> {
    const { request: r } = ctx;
    const warnings: string[] = [
      `Pollinations runs its own hosted model, so "${ctx.checkpoint.name}" was not used.`,
    ];
    if (ctx.loras.length > 0) {
      warnings.push(
        `LoRA weights are not applied here — only the trigger words (${ctx.loras
          .flatMap((l) => l.lora.triggerWords)
          .join(", ") || "none"}) reached the prompt. Use ComfyUI for the real stack.`,
      );
    }
    if (r.mode !== "generate") warnings.push(`${r.mode} mode is not supported by this provider.`);

    const [width, height] = clampSize(r.width, r.height);
    if (width !== r.width) warnings.push(`Resolution was reduced to ${width}×${height} to fit the free tier.`);

    const images: GeneratedImage[] = [];
    for (let i = 0; i < r.batchSize; i++) {
      if (ctx.signal.aborted) throw new ProviderError("Cancelled.");

      const params = new URLSearchParams({
        width: String(width),
        height: String(height),
        seed: String(r.seed + i),
        model: MODEL,
        nologo: "true",
        private: "true",
        referrer: "genimage-studio",
      });
      if (r.finalNegativePrompt) params.set("negative", r.finalNegativePrompt);

      const url = `${BASE_URL}/prompt/${encodeURIComponent(r.finalPrompt)}?${params}`;
      const res = await fetchWithTimeout(
        url,
        {
          timeoutMs: 120_000,
          headers: TOKEN ? { authorization: `Bearer ${TOKEN}` } : undefined,
        },
        ctx.signal,
      );

      if (!res.ok) {
        throw new ProviderError(
          `Pollinations returned HTTP ${res.status}. The free tier rate-limits bursts — try again in a moment.`,
          res.status === 429 || res.status >= 500,
        );
      }

      const contentType = res.headers.get("content-type") ?? "";
      if (!contentType.startsWith("image/")) {
        throw new ProviderError(`Pollinations returned ${contentType || "an unknown type"} instead of an image.`);
      }

      images.push({
        bytes: new Uint8Array(await res.arrayBuffer()),
        mimeType: contentType.split(";")[0],
        seed: r.seed + i,
        width,
        height,
      });
      ctx.onProgress((i + 1) / r.batchSize);
    }

    return { images, warnings };
  },
};
