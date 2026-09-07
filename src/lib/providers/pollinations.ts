import {
  fetchWithTimeout,
  type GeneratedImage,
  type ImageProvider,
  type ProviderContext,
  type StartResult,
} from "./types";

/**
 * Pollinations — free, keyless text-to-image.
 *
 * The generation *is* the URL: the browser requests the image and the render
 * happens on their side. Nothing is fetched, stored or proxied here, which is
 * why this backend works unchanged on a serverless host with a read-only
 * filesystem and a ten-second request budget.
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

  async start(ctx: ProviderContext): Promise<StartResult> {
    const { request: r } = ctx;
    const warnings: string[] = [
      `Pollinations runs its own hosted model, so "${ctx.checkpoint.name}" was not used.`,
    ];
    if (ctx.loras.length > 0) {
      const triggers = ctx.loras.flatMap((l) => l.lora.triggerWords).join(", ");
      warnings.push(
        `LoRA weights are not applied here — only the trigger words (${triggers || "none"}) reached ` +
          "the prompt. Use fal.ai, Replicate or ComfyUI for the real stack.",
      );
    }
    if (r.mode !== "generate") warnings.push(`${r.mode} mode is not supported by this provider.`);

    const [width, height] = clampSize(r.width, r.height);
    if (width !== r.width) warnings.push(`Resolution was reduced to ${width}×${height} to fit the free tier.`);

    const images: GeneratedImage[] = [];
    for (let i = 0; i < r.batchSize; i++) {
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
      // A token raises the rate limit. It is only ever placed on a URL when the
      // operator opted in, since the browser will see it.
      if (TOKEN && process.env.POLLINATIONS_TOKEN_IN_URL === "1") params.set("token", TOKEN);

      images.push({
        source: { kind: "url", url: `${BASE_URL}/prompt/${encodeURIComponent(r.finalPrompt)}?${params}` },
        seed: r.seed + i,
        width,
        height,
      });
    }

    return { status: "done", images, warnings };
  },
};
