import type { ResolutionTier } from "./catalog";

export type Mode = "generate" | "edit" | "enhance";

export interface LoraSelection {
  id: string;
  strength: number;
  /** `null` → mirror the UNet strength. */
  clipStrength?: number | null;
}

/** What the browser sends to `POST /api/generate`. */
export interface GenerationRequest {
  mode: Mode;
  prompt: string;
  negativePrompt: string;
  checkpointId: string;
  loras: LoraSelection[];
  aspectRatio: string;
  resolution: ResolutionTier;
  batchSize: number;
  seed: number | null;
  steps: number | null;
  cfg: number | null;
  sampler: string | null;
  scheduler: string | null;
  clipSkip: number | null;
  /** Quality tag block from the checkpoint, appended to the prompt. */
  appendQualityTags: boolean;
  /** img2img / edit strength: 1 = ignore the reference, 0 = copy it. */
  denoise: number;
  /** Reference image id returned by `POST /api/upload`. */
  referenceImageId: string | null;
  /** Enhance mode: multiplier applied to the source resolution. */
  upscale: number;
  provider: string | null;
  highPriority: boolean;
}

/** The fully-defaulted, safety-checked request the providers actually execute. */
export interface ResolvedRequest extends Omit<GenerationRequest, "seed" | "steps" | "cfg" | "sampler" | "scheduler" | "clipSkip"> {
  seed: number;
  steps: number;
  cfg: number;
  sampler: string;
  scheduler: string;
  clipSkip: number;
  width: number;
  height: number;
  /** Prompt after quality tags and LoRA trigger words are merged in. */
  finalPrompt: string;
  finalNegativePrompt: string;
}

export type JobStatus = "queued" | "running" | "succeeded" | "failed" | "cancelled";

export interface ImageRecord {
  id: string;
  jobId: string;
  seed: number;
  width: number;
  height: number;
  /** Relative path inside the data directory. */
  file: string;
  mimeType: string;
  createdAt: number;
}

export interface Job {
  id: string;
  status: JobStatus;
  mode: Mode;
  provider: string;
  request: ResolvedRequest;
  images: ImageRecord[];
  error: string | null;
  /** 0–1; providers report it when they can, otherwise it is time-estimated. */
  progress: number;
  queuedAt: number;
  startedAt: number | null;
  finishedAt: number | null;
  /** Credits charged by the pricing model — display only, nothing is billed. */
  cost: number;
  /** Non-fatal notes, e.g. "this provider ignored your LoRA stack". */
  warnings: string[];
}

export interface ProviderCapabilities {
  textToImage: boolean;
  imageToImage: boolean;
  upscale: boolean;
  /** True only when LoRA weights are genuinely loaded, not merely hinted at. */
  loras: boolean;
  negativePrompt: boolean;
  seed: boolean;
  customSampler: boolean;
  batch: boolean;
  maxPixels: number;
}

export interface ProviderStatus {
  id: string;
  label: string;
  available: boolean;
  detail: string;
  requiresKey: boolean;
  capabilities: ProviderCapabilities;
}
