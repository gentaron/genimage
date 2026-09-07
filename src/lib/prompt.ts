import type { Checkpoint, Lora } from "./catalog";
import type { GenerationRequest } from "./types";

/* ------------------------------------------------------------------ */
/* Boosters                                                            */
/* ------------------------------------------------------------------ */

export interface Booster {
  id: string;
  label: string;
  group: "quality" | "lighting" | "camera" | "render" | "negative";
  /** Appended to the positive prompt. */
  positive?: string;
  /** Appended to the negative prompt. */
  negative?: string;
  hint: string;
}

export const BOOSTERS: Booster[] = [
  {
    id: "quality-max",
    label: "Quality Max",
    group: "quality",
    positive: "masterpiece, best quality, very aesthetic, absurdres, ultra-detailed",
    hint: "The Illustrious/NoobAI quality ladder, all the way up.",
  },
  {
    id: "detail-boost",
    label: "Detail Boost",
    group: "quality",
    positive: "intricate details, detailed skin texture, detailed eyes, fine fabric texture",
    hint: "Pushes micro-detail into skin, eyes and cloth.",
  },
  {
    id: "cinematic-light",
    label: "Cinematic Light",
    group: "lighting",
    positive: "cinematic lighting, dramatic rim light, volumetric lighting, high contrast",
    hint: "Strong key light with a rim separation pass.",
  },
  {
    id: "soft-light",
    label: "Soft Light",
    group: "lighting",
    positive: "soft lighting, diffused light, gentle shadows, backlighting",
    hint: "Low-contrast, even illumination.",
  },
  {
    id: "golden-hour",
    label: "Golden Hour",
    group: "lighting",
    positive: "golden hour, warm sunlight, sun flare, long shadows",
    hint: "Late afternoon warmth.",
  },
  {
    id: "portrait-lens",
    label: "Portrait Lens",
    group: "camera",
    positive: "upper body, shallow depth of field, bokeh, 85mm lens",
    hint: "Tight framing with a fast-lens falloff.",
  },
  {
    id: "wide-shot",
    label: "Wide Shot",
    group: "camera",
    positive: "full body, wide shot, dynamic angle, detailed background",
    hint: "Whole figure plus environment.",
  },
  {
    id: "from-above",
    label: "From Above",
    group: "camera",
    positive: "from above, looking at viewer, dutch angle",
    hint: "High camera looking down.",
  },
  {
    id: "anime-sharp",
    label: "Anime Sharp",
    group: "render",
    positive: "anime screencap, clean lineart, cel shading, vivid colors",
    hint: "Flat cel-shaded finish with crisp lines.",
  },
  {
    id: "painterly",
    label: "Painterly",
    group: "render",
    positive: "painterly, impasto brush strokes, textured canvas, traditional media",
    hint: "Visible brushwork instead of clean vector edges.",
  },
  {
    id: "photoreal",
    label: "Photoreal",
    group: "render",
    positive: "photorealistic, raw photo, film grain, natural skin texture, 8k uhd",
    hint: "Pushes an anime checkpoint toward photography — expect a fight.",
  },
  {
    id: "fix-hands",
    label: "Fix Hands",
    group: "negative",
    negative: "bad hands, mutated hands, extra fingers, fewer fingers, fused fingers, malformed limbs",
    hint: "Loads the usual anatomy terms into the negative prompt.",
  },
  {
    id: "no-text",
    label: "No Text",
    group: "negative",
    negative: "text, watermark, signature, username, logo, artist name, patreon logo",
    hint: "Suppresses captions and watermarks.",
  },
  {
    id: "clean-bg",
    label: "Clean Background",
    group: "negative",
    positive: "simple background, white background",
    negative: "cluttered background, busy background",
    hint: "Isolates the subject.",
  },
];

export function getBooster(id: string): Booster | undefined {
  return BOOSTERS.find((b) => b.id === id);
}

/* ------------------------------------------------------------------ */
/* Prompt assembly                                                     */
/* ------------------------------------------------------------------ */

/** Splits on commas, trims, and drops repeats while keeping the first ordering. */
export function dedupeTags(input: string): string {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of input.split(",")) {
    const tag = raw.trim().replace(/\s+/g, " ");
    if (!tag) continue;
    const key = tag.toLowerCase().replace(/[()\[\]{}]/g, "").replace(/:[\d.]+$/, "");
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(tag);
  }
  return out.join(", ");
}

export function joinTags(...parts: (string | undefined | null)[]): string {
  return dedupeTags(parts.filter((p) => p && p.trim()).join(", "));
}

/**
 * Builds the exact strings handed to the sampler: user prompt, then LoRA trigger
 * words, then the checkpoint's quality block.
 */
export function buildPrompts(
  request: Pick<GenerationRequest, "prompt" | "negativePrompt" | "appendQualityTags">,
  checkpoint: Checkpoint,
  loras: Lora[],
): { positive: string; negative: string } {
  const triggers = loras.flatMap((l) => l.triggerWords);
  const positive = joinTags(
    request.prompt,
    triggers.join(", "),
    request.appendQualityTags ? checkpoint.qualityTags : null,
  );
  const negative = joinTags(request.negativePrompt || checkpoint.negativeDefault);
  return { positive, negative };
}

/* ------------------------------------------------------------------ */
/* Cost & wait estimates                                               */
/* ------------------------------------------------------------------ */

/**
 * Display-only credit model, shaped like the hosted services: cost scales with
 * megapixels, steps and batch size. Nothing is charged; it exists so operators
 * can reason about GPU seconds.
 */
export function estimateCost(opts: {
  width: number;
  height: number;
  steps: number;
  batchSize: number;
  loraCount: number;
  highPriority: boolean;
  upscale?: number;
}): number {
  const megapixels = (opts.width * opts.height) / 1_000_000;
  const base = 100 * megapixels * (opts.steps / 28);
  const loraSurcharge = 1 + opts.loraCount * 0.05;
  const upscale = opts.upscale && opts.upscale > 1 ? opts.upscale ** 2 : 1;
  const priority = opts.highPriority ? 1.5 : 1;
  const total = base * loraSurcharge * upscale * priority * opts.batchSize;
  return Math.max(1, Math.round(total / 10) * 10);
}

/** Rough seconds-to-first-image, assuming a mid-range consumer GPU. */
export function estimateWait(opts: {
  width: number;
  height: number;
  steps: number;
  batchSize: number;
  highPriority: boolean;
  providerFactor?: number;
}): number {
  const megapixels = (opts.width * opts.height) / 1_000_000;
  const perStep = 0.11 * megapixels;
  const compute = perStep * opts.steps * opts.batchSize;
  const queue = opts.highPriority ? 0.5 : 3;
  return Math.max(1, Math.round((compute + queue) * (opts.providerFactor ?? 1)));
}
