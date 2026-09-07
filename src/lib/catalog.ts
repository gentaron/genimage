/**
 * Model catalog.
 *
 * Everything the studio can render with is declared here. The entries carry both
 * the "storefront" metadata shown in the sidebar and the plumbing each provider
 * needs (ComfyUI filenames, Hugging Face repo ids, sampler defaults).
 *
 * Filenames can be overridden without touching code — see `loadCatalog()`.
 */

export type BaseModel =
  | "Illustrious"
  | "NoobAI-XL"
  | "SDXL"
  | "Pony"
  | "SD1.5"
  | "FLUX";

export interface SamplerDefaults {
  steps: number;
  cfg: number;
  sampler: string;
  scheduler: string;
}

export interface AcceleratorProfile {
  /** Step count this LoRA is distilled for. */
  steps: number;
  /** Distilled models collapse without a near-1.0 guidance scale. */
  cfg: number;
  sampler: string;
  scheduler: string;
  note: string;
}

export interface Checkpoint {
  id: string;
  name: string;
  version: string;
  baseModel: BaseModel;
  /** Filename inside ComfyUI's `models/checkpoints`. */
  file: string;
  /** Fallback repo for the Hugging Face provider. */
  huggingFaceId?: string;
  homepage?: string;
  clipSkip: number;
  defaults: SamplerDefaults;
  /** Appended to every prompt unless the user turns quality tags off. */
  qualityTags: string;
  negativeDefault: string;
  /** Two-stop gradient used for the placeholder card art. */
  thumb: [string, string];
  description: string;
  nsfwCapable: boolean;
}

export type LoraKind = "style" | "character" | "concept" | "accelerator";

export interface Lora {
  id: string;
  name: string;
  version?: string;
  /** Filename inside ComfyUI's `models/loras`. */
  file: string;
  kind: LoraKind;
  strength: { default: number; min: number; max: number };
  /**
   * Text-encoder strength. `null` means "follow the UNet strength", which is
   * what almost every style LoRA wants; accelerators pin it to a fixed value.
   */
  clipStrength: number | null;
  triggerWords: string[];
  /** Base models this LoRA was trained against — used for the mismatch warning. */
  compatibleWith: BaseModel[];
  accelerator?: AcceleratorProfile;
  free: boolean;
  homepage?: string;
  thumb: [string, string];
  description: string;
}

export interface AspectRatio {
  id: string;
  label: string;
  /** Nominal ratio, used for the little preview box in the sidebar. */
  w: number;
  h: number;
  /** SDXL-friendly pixel sizes; every value is divisible by 8. */
  M: [number, number];
  L: [number, number];
}

export type ResolutionTier = "M" | "L";

/* ------------------------------------------------------------------ */
/* Checkpoints                                                         */
/* ------------------------------------------------------------------ */

export const CHECKPOINTS: Checkpoint[] = [
  {
    id: "coco-illustrious-noobxl-style",
    name: "coco-Illustrious-NoobXL-Style",
    version: "v2.0",
    baseModel: "NoobAI-XL",
    file: "coco-Illustrious-NoobXL-Style-v2.0.safetensors",
    clipSkip: 2,
    defaults: { steps: 28, cfg: 5.0, sampler: "euler_ancestral", scheduler: "normal" },
    qualityTags: "masterpiece, best quality, very aesthetic, absurdres",
    negativeDefault:
      "worst quality, low quality, lowres, bad anatomy, bad hands, extra digits, fewer digits, " +
      "jpeg artifacts, signature, watermark, username, blurry, text, error",
    thumb: ["#f43f5e", "#7c3aed"],
    description:
      "Illustrious / NoobAI-XL merge tuned for clean anime linework and saturated colour. " +
      "Danbooru-style tag prompting, CLIP skip 2.",
    nsfwCapable: true,
  },
  {
    id: "sdxl-base-1.0",
    name: "Stable Diffusion XL Base",
    version: "1.0",
    baseModel: "SDXL",
    file: "sd_xl_base_1.0.safetensors",
    huggingFaceId: "stabilityai/stable-diffusion-xl-base-1.0",
    clipSkip: 1,
    defaults: { steps: 30, cfg: 6.5, sampler: "dpmpp_2m", scheduler: "karras" },
    qualityTags: "highly detailed, sharp focus, professional photography",
    negativeDefault: "low quality, worst quality, blurry, jpeg artifacts, watermark, text",
    thumb: ["#0ea5e9", "#6366f1"],
    description:
      "The open SDXL baseline. Natural-language prompting, permissive licence, and the widest " +
      "free-provider support.",
    nsfwCapable: false,
  },
  {
    id: "flux-schnell",
    name: "FLUX.1 schnell",
    version: "1.0",
    baseModel: "FLUX",
    file: "flux1-schnell.safetensors",
    huggingFaceId: "black-forest-labs/FLUX.1-schnell",
    clipSkip: 1,
    defaults: { steps: 4, cfg: 1.0, sampler: "euler", scheduler: "simple" },
    qualityTags: "highly detailed, cinematic lighting",
    negativeDefault: "",
    thumb: ["#22c55e", "#0891b2"],
    description:
      "Apache-2.0 four-step distilled model. Excellent prompt adherence and typography; " +
      "SDXL LoRAs do not apply to it.",
    nsfwCapable: false,
  },
];

/* ------------------------------------------------------------------ */
/* LoRAs                                                               */
/* ------------------------------------------------------------------ */

export const LORAS: Lora[] = [
  {
    id: "shexyo-v3",
    name: "Shexyo",
    version: "v3",
    file: "shexyo_v3.safetensors",
    kind: "style",
    strength: { default: 0.7, min: -1, max: 2 },
    clipStrength: null,
    triggerWords: ["shexyo"],
    compatibleWith: ["Illustrious", "NoobAI-XL"],
    free: true,
    thumb: ["#38bdf8", "#a855f7"],
    description:
      "Illustrious-family style LoRA: glossy rendering, strong rim light, high-contrast eyes. " +
      "Sits comfortably around 0.6–0.8; above 1.0 it starts eating the checkpoint's anatomy.",
  },
  {
    id: "hyper-sdxl",
    name: "Hyper SDXL",
    version: "8-step",
    file: "Hyper-SDXL-8steps-lora.safetensors",
    kind: "accelerator",
    strength: { default: 1.0, min: 0.2, max: 1.0 },
    clipStrength: 1.0,
    triggerWords: [],
    compatibleWith: ["SDXL", "Illustrious", "NoobAI-XL", "Pony"],
    accelerator: {
      steps: 8,
      cfg: 1.0,
      sampler: "euler",
      scheduler: "sgm_uniform",
      note: "Hyper-SDXL is step-distilled: it needs ~8 steps at CFG 1.0 with the sgm_uniform schedule.",
    },
    free: true,
    homepage: "https://huggingface.co/ByteDance/Hyper-SD",
    thumb: ["#f59e0b", "#ef4444"],
    description:
      "ByteDance Hyper-SD distillation. Turns a 28-step render into an 8-step one at roughly a " +
      "third of the cost. Enabling it locks the sampler settings to the distilled profile.",
  },
  {
    id: "trt-style-illustrious",
    name: "TRT STYLE | Illustrious",
    version: "v1",
    file: "trt_style_illustrious.safetensors",
    kind: "style",
    strength: { default: 0.8, min: -1, max: 2 },
    clipStrength: null,
    triggerWords: ["trt style"],
    compatibleWith: ["Illustrious", "NoobAI-XL"],
    free: true,
    thumb: ["#ef4444", "#1f2937"],
    description:
      "Painterly Illustrious style pass — heavier shadow shaping and a warmer palette. " +
      "Stacks with Shexyo, but keep the combined weight under ~1.5.",
  },
  {
    id: "detail-tweaker-xl",
    name: "Detail Tweaker XL",
    version: "v1",
    file: "add-detail-xl.safetensors",
    kind: "concept",
    strength: { default: 0.5, min: -2, max: 2 },
    clipStrength: null,
    triggerWords: [],
    compatibleWith: ["SDXL", "Illustrious", "NoobAI-XL", "Pony"],
    free: true,
    thumb: ["#a3e635", "#0d9488"],
    description:
      "Slider LoRA. Positive weights add micro-detail, negative weights flatten and simplify. " +
      "Works on any SDXL derivative.",
  },
];

/* ------------------------------------------------------------------ */
/* Canvas                                                              */
/* ------------------------------------------------------------------ */

export const ASPECT_RATIOS: AspectRatio[] = [
  { id: "3:5", label: "3:5", w: 3, h: 5, M: [768, 1280], L: [840, 1400] },
  { id: "1:1", label: "1:1", w: 1, h: 1, M: [1024, 1024], L: [1152, 1152] },
  { id: "9:16", label: "9:16", w: 9, h: 16, M: [768, 1344], L: [864, 1536] },
  { id: "3:4", label: "3:4", w: 3, h: 4, M: [896, 1152], L: [1008, 1344] },
  { id: "4:3", label: "4:3", w: 4, h: 3, M: [1152, 896], L: [1344, 1008] },
  { id: "16:9", label: "16:9", w: 16, h: 9, M: [1344, 768], L: [1536, 864] },
];

export const SAMPLERS = [
  "euler",
  "euler_ancestral",
  "dpmpp_2m",
  "dpmpp_2m_sde",
  "dpmpp_3m_sde",
  "ddim",
  "lcm",
] as const;

export const SCHEDULERS = ["normal", "karras", "exponential", "sgm_uniform", "simple", "beta"] as const;

/* ------------------------------------------------------------------ */
/* Lookup helpers                                                      */
/* ------------------------------------------------------------------ */

export function getCheckpoint(id: string): Checkpoint | undefined {
  return CHECKPOINTS.find((c) => c.id === id);
}

export function getLora(id: string): Lora | undefined {
  return LORAS.find((l) => l.id === id);
}

export function getAspectRatio(id: string): AspectRatio | undefined {
  return ASPECT_RATIOS.find((a) => a.id === id);
}

export function dimensionsFor(ratioId: string, tier: ResolutionTier): [number, number] {
  const ratio = getAspectRatio(ratioId) ?? ASPECT_RATIOS[0];
  return ratio[tier];
}

export const DEFAULT_CHECKPOINT_ID = CHECKPOINTS[0].id;
