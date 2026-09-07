import type { AspectRatio, Checkpoint, Lora, ResolutionTier } from "@/lib/catalog";
import type { Booster } from "@/lib/prompt";
import type { Job, Mode, ProviderStatus } from "@/lib/types";

export interface Catalog {
  checkpoints: Checkpoint[];
  loras: Lora[];
  aspectRatios: AspectRatio[];
  boosters: Booster[];
  samplers: string[];
  schedulers: string[];
  providers: ProviderStatus[];
}

export interface LoraState {
  enabled: boolean;
  strength: number;
}

export interface ReferenceImage {
  id: string;
  /** Object URL for the local preview; not persisted. */
  preview: string;
  name: string;
}

/** Everything the user can change. Persisted to localStorage. */
export interface Settings {
  mode: Mode;
  prompt: string;
  negativePrompt: string;
  checkpointId: string;
  loras: Record<string, LoraState>;
  boosters: string[];
  aspectRatio: string;
  resolution: ResolutionTier;
  batchSize: number;
  lockSeed: boolean;
  seed: number;
  steps: number | null;
  cfg: number | null;
  sampler: string | null;
  scheduler: string | null;
  clipSkip: number | null;
  appendQualityTags: boolean;
  denoise: number;
  upscale: number;
  provider: string;
  highPriority: boolean;
  promptHelper: boolean;
  autocomplete: boolean;
  advancedOpen: boolean;
}

export const DEFAULT_SETTINGS: Settings = {
  mode: "generate",
  prompt: "",
  negativePrompt: "",
  checkpointId: "coco-illustrious-noobxl-style",
  loras: { "shexyo-v3": { enabled: true, strength: 0.7 } },
  boosters: [],
  aspectRatio: "3:5",
  resolution: "M",
  batchSize: 4,
  lockSeed: false,
  seed: 0,
  steps: null,
  cfg: null,
  sampler: null,
  scheduler: null,
  clipSkip: null,
  appendQualityTags: true,
  denoise: 0.65,
  upscale: 1.5,
  provider: "auto",
  highPriority: true,
  promptHelper: true,
  autocomplete: true,
  advancedOpen: false,
};

const STORAGE_KEY = "genimage:settings:v1";

export function loadSettings(): Settings {
  if (typeof window === "undefined") return DEFAULT_SETTINGS;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_SETTINGS;
    const parsed = JSON.parse(raw) as Partial<Settings>;
    // Merge rather than replace so new fields pick up their defaults.
    return { ...DEFAULT_SETTINGS, ...parsed, loras: parsed.loras ?? DEFAULT_SETTINGS.loras };
  } catch {
    return DEFAULT_SETTINGS;
  }
}

export function saveSettings(settings: Settings): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
  } catch {
    // Private browsing or a full quota — the studio still works, it just forgets.
  }
}

/** Restores a job's settings into the composer ("Remix"). */
export function settingsFromJob(job: Job, current: Settings): Settings {
  const loras: Record<string, LoraState> = {};
  for (const lora of job.request.loras) {
    loras[lora.id] = { enabled: true, strength: lora.strength };
  }
  return {
    ...current,
    mode: "generate",
    prompt: job.request.prompt,
    negativePrompt: job.request.negativePrompt,
    checkpointId: job.request.checkpointId,
    loras,
    boosters: [],
    aspectRatio: job.request.aspectRatio,
    resolution: job.request.resolution,
    batchSize: job.request.batchSize,
    lockSeed: true,
    seed: job.request.seed,
    steps: job.request.steps,
    cfg: job.request.cfg,
    sampler: job.request.sampler,
    scheduler: job.request.scheduler,
    clipSkip: job.request.clipSkip,
    appendQualityTags: job.request.appendQualityTags,
  };
}
