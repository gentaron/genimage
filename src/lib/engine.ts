import {
  CHECKPOINTS,
  DEFAULT_CHECKPOINT_ID,
  dimensionsFor,
  getAspectRatio,
  getCheckpoint,
  getLora,
  SAMPLERS,
  SCHEDULERS,
  type Checkpoint,
} from "./catalog";
import { buildPrompts, estimateCost } from "./prompt";
import { checkPrompt, checkSfw } from "./safety";
import { getProvider, resolveProvider } from "./providers";
import type { ProviderContext, ResolvedLora } from "./providers/types";
import { ProviderError } from "./providers/types";
import { previewProvider } from "./providers/preview";
import { getJob, newId, putJob, readUpload, saveOutput } from "./store";
import type { GenerationRequest, Job, ResolvedRequest } from "./types";

const MAX_LORAS = Number(process.env.GENIMAGE_MAX_LORAS ?? 6);
const MAX_BATCH = Number(process.env.GENIMAGE_MAX_BATCH ?? 8);
const CONCURRENCY = Math.max(1, Number(process.env.GENIMAGE_CONCURRENCY ?? 1));
const SFW_ONLY = process.env.GENIMAGE_SFW_ONLY === "1";

export class RequestError extends Error {}

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

function num(value: unknown, fallback: number): number {
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

/**
 * Turns a raw browser payload into a fully-defaulted, validated request.
 * Throws `RequestError` for anything the user can fix by changing the form.
 */
export function resolveRequest(input: Partial<GenerationRequest>): {
  request: ResolvedRequest;
  checkpoint: Checkpoint;
  loras: ResolvedLora[];
  warnings: string[];
} {
  const warnings: string[] = [];

  const prompt = String(input.prompt ?? "").trim();
  if (!prompt) throw new RequestError("Write a prompt first.");
  if (prompt.length > 4000) throw new RequestError("The prompt is longer than 4000 characters.");

  const negativePrompt = String(input.negativePrompt ?? "").trim().slice(0, 4000);

  const safety = checkPrompt(prompt, negativePrompt);
  if (!safety.ok) throw new RequestError(safety.reason!);
  const sfw = checkSfw(SFW_ONLY, prompt, negativePrompt);
  if (!sfw.ok) throw new RequestError(sfw.reason!);

  const checkpoint = getCheckpoint(String(input.checkpointId ?? "")) ?? getCheckpoint(DEFAULT_CHECKPOINT_ID)!;

  // --- LoRA stack --------------------------------------------------------
  const loras: ResolvedLora[] = [];
  const seenLoras = new Set<string>();
  for (const selection of input.loras ?? []) {
    const lora = getLora(String(selection?.id ?? ""));
    if (!lora || seenLoras.has(lora.id)) continue;
    if (loras.length >= MAX_LORAS) {
      warnings.push(`Only the first ${MAX_LORAS} LoRAs were applied.`);
      break;
    }
    seenLoras.add(lora.id);
    const strength = clamp(num(selection.strength, lora.strength.default), lora.strength.min, lora.strength.max);
    const clipStrength =
      selection.clipStrength === null || selection.clipStrength === undefined
        ? (lora.clipStrength ?? strength)
        : clamp(num(selection.clipStrength, strength), lora.strength.min, lora.strength.max);
    loras.push({ lora, strength, clipStrength });

    if (!lora.compatibleWith.includes(checkpoint.baseModel)) {
      warnings.push(
        `${lora.name} was trained for ${lora.compatibleWith.join("/")} and may not behave on a ${checkpoint.baseModel} checkpoint.`,
      );
    }
  }

  const styleWeight = loras
    .filter((l) => l.lora.kind === "style")
    .reduce((sum, l) => sum + Math.abs(l.strength), 0);
  if (styleWeight > 1.6) {
    warnings.push(
      `Combined style LoRA weight is ${styleWeight.toFixed(2)}; above ~1.5 the checkpoint's anatomy usually breaks down.`,
    );
  }

  // --- Sampler settings --------------------------------------------------
  // An accelerator LoRA is step-distilled, so its profile replaces the
  // checkpoint defaults. Explicit user values still win.
  const accelerator = loras.find((l) => l.lora.accelerator)?.lora.accelerator;
  const defaults = accelerator
    ? { steps: accelerator.steps, cfg: accelerator.cfg, sampler: accelerator.sampler, scheduler: accelerator.scheduler }
    : checkpoint.defaults;

  const steps = clamp(Math.round(num(input.steps ?? defaults.steps, defaults.steps)), 1, 150);
  const cfg = clamp(num(input.cfg ?? defaults.cfg, defaults.cfg), 0, 30);
  const sampler = SAMPLERS.includes(String(input.sampler ?? "") as (typeof SAMPLERS)[number])
    ? String(input.sampler)
    : defaults.sampler;
  const scheduler = SCHEDULERS.includes(String(input.scheduler ?? "") as (typeof SCHEDULERS)[number])
    ? String(input.scheduler)
    : defaults.scheduler;

  if (accelerator) {
    if (cfg > accelerator.cfg + 1.5) {
      warnings.push(`${accelerator.note} CFG ${cfg} will look burnt.`);
    }
    if (steps > accelerator.steps * 2) {
      warnings.push(`${accelerator.note} ${steps} steps mostly wastes time.`);
    }
  }

  const clipSkip = clamp(Math.round(num(input.clipSkip ?? checkpoint.clipSkip, checkpoint.clipSkip)), 1, 12);

  // --- Canvas ------------------------------------------------------------
  const ratio = getAspectRatio(String(input.aspectRatio ?? "")) ?? getAspectRatio("3:5")!;
  const tier = input.resolution === "L" ? "L" : "M";
  const [width, height] = dimensionsFor(ratio.id, tier);

  const batchSize = clamp(Math.round(num(input.batchSize, 1)), 1, MAX_BATCH);
  const seed =
    input.seed === null || input.seed === undefined || !Number.isFinite(Number(input.seed))
      ? Math.floor(Math.random() * 2 ** 31)
      : Math.abs(Math.round(Number(input.seed))) % 2 ** 31;

  const mode = input.mode === "edit" || input.mode === "enhance" ? input.mode : "generate";
  const referenceImageId = input.referenceImageId ? String(input.referenceImageId) : null;
  if (mode !== "generate" && !referenceImageId) {
    throw new RequestError(`${mode === "edit" ? "Edit" : "Enhance"} mode needs a reference image.`);
  }

  const denoise = clamp(num(input.denoise, mode === "enhance" ? 0.35 : 0.65), 0.05, 1);
  const upscale = clamp(num(input.upscale, 1.5), 1, 4);
  const appendQualityTags = input.appendQualityTags !== false;

  const { positive, negative } = buildPrompts(
    { prompt, negativePrompt, appendQualityTags },
    checkpoint,
    loras.map((l) => l.lora),
  );

  const request: ResolvedRequest = {
    mode,
    prompt,
    negativePrompt,
    checkpointId: checkpoint.id,
    loras: loras.map((l) => ({ id: l.lora.id, strength: l.strength, clipStrength: l.clipStrength })),
    aspectRatio: ratio.id,
    resolution: tier,
    batchSize,
    seed,
    steps,
    cfg,
    sampler,
    scheduler,
    clipSkip,
    appendQualityTags,
    denoise,
    referenceImageId,
    upscale,
    provider: input.provider ?? "auto",
    highPriority: Boolean(input.highPriority),
    width,
    height,
    finalPrompt: positive,
    finalNegativePrompt: negative,
  };

  return { request, checkpoint, loras, warnings };
}

/* ------------------------------------------------------------------ */
/* Queue                                                               */
/* ------------------------------------------------------------------ */

interface Engine {
  queue: string[];
  running: Set<string>;
  controllers: Map<string, AbortController>;
}

const globalEngine = globalThis as unknown as { __genimageEngine?: Engine };
const engine: Engine =
  globalEngine.__genimageEngine ??
  (globalEngine.__genimageEngine = { queue: [], running: new Set(), controllers: new Map() });

export async function submit(input: Partial<GenerationRequest>): Promise<Job> {
  const { request, loras, warnings } = resolveRequest(input);
  const provider = await resolveProvider(request.provider === "auto" ? null : request.provider);

  const pixels = request.width * request.height;
  if (pixels > provider.capabilities.maxPixels) {
    warnings.push(
      `${provider.label} caps output around ${Math.round(provider.capabilities.maxPixels / 1_000_000)} MP; ` +
        "the image was scaled to fit.",
    );
  }
  if (request.batchSize > 1 && !provider.capabilities.batch) {
    warnings.push(`${provider.label} renders one image at a time.`);
  }

  const job: Job = {
    id: newId("job"),
    status: "queued",
    mode: request.mode,
    provider: provider.id,
    request,
    images: [],
    error: null,
    progress: 0,
    queuedAt: Date.now(),
    startedAt: null,
    finishedAt: null,
    cost: estimateCost({
      width: request.width,
      height: request.height,
      steps: request.steps,
      batchSize: request.batchSize,
      loraCount: loras.length,
      highPriority: request.highPriority,
      upscale: request.mode === "enhance" ? request.upscale : 1,
    }),
    warnings,
  };

  await putJob(job);

  // High priority jumps ahead of the normal queue but never preempts a run.
  if (request.highPriority) {
    const firstNormal = engine.queue.findIndex((id) => !id.startsWith("!"));
    engine.queue.splice(firstNormal === -1 ? engine.queue.length : firstNormal, 0, job.id);
  } else {
    engine.queue.push(job.id);
  }

  void pump();
  return job;
}

/** Starts workers up to the concurrency limit. Safe to call repeatedly. */
function pump(): void {
  while (engine.running.size < CONCURRENCY && engine.queue.length > 0) {
    const jobId = engine.queue.shift();
    if (!jobId) break;
    engine.running.add(jobId);
    void run(jobId).finally(() => {
      engine.running.delete(jobId);
      if (engine.queue.length > 0) pump();
    });
  }
}

/** Each job carries its own provider id, resolved when it was submitted. */
async function run(jobId: string): Promise<void> {
  const job = await getJob(jobId);
  if (!job || job.status === "cancelled") return;

  const provider = getProvider(job.provider) ?? previewProvider;

  const checkpoint = getCheckpoint(job.request.checkpointId) ?? CHECKPOINTS[0];
  const loras: ResolvedLora[] = job.request.loras
    .map((l) => {
      const lora = getLora(l.id);
      return lora ? { lora, strength: l.strength, clipStrength: l.clipStrength ?? l.strength } : null;
    })
    .filter((l): l is ResolvedLora => l !== null);

  const controller = new AbortController();
  engine.controllers.set(jobId, controller);

  job.status = "running";
  job.startedAt = Date.now();
  job.progress = 0.02;
  await putJob(job);

  try {
    const referenceImage = job.request.referenceImageId
      ? await readUpload(job.request.referenceImageId)
      : null;
    if (job.request.referenceImageId && !referenceImage) {
      job.warnings.push("The reference image is no longer on disk; it was ignored.");
    }

    const ctx: ProviderContext = {
      request: job.request,
      checkpoint,
      loras,
      referenceImage,
      signal: controller.signal,
      onProgress: (progress) => {
        job.progress = Math.max(job.progress, Math.min(0.99, progress));
        void putJob(job);
      },
    };

    const result = await provider.generate(ctx);

    for (const image of result.images) {
      const saved = await saveOutput(job.id, image.bytes, image.mimeType);
      job.images.push({
        id: saved.id,
        jobId: job.id,
        seed: image.seed,
        width: image.width,
        height: image.height,
        file: saved.file,
        mimeType: image.mimeType,
        createdAt: Date.now(),
      });
    }

    job.warnings.push(...result.warnings);
    job.status = "succeeded";
    job.progress = 1;
  } catch (error) {
    const message =
      error instanceof ProviderError
        ? error.message
        : `${provider.label} failed: ${(error as Error).message ?? String(error)}`;
    job.status = controller.signal.aborted ? "cancelled" : "failed";
    job.error = message;
  } finally {
    job.finishedAt = Date.now();
    engine.controllers.delete(jobId);
    await putJob(job);
  }
}

export async function cancel(jobId: string): Promise<boolean> {
  const index = engine.queue.indexOf(jobId);
  if (index !== -1) engine.queue.splice(index, 1);

  const controller = engine.controllers.get(jobId);
  controller?.abort(new Error("Cancelled by the user."));

  const job = await getJob(jobId);
  if (!job || job.status === "succeeded" || job.status === "failed") return false;
  job.status = "cancelled";
  job.finishedAt = Date.now();
  await putJob(job);
  return true;
}

export function queueDepth(): number {
  return engine.queue.length + engine.running.size;
}
