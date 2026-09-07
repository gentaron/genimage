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
import type { GeneratedImage, ProviderContext, ResolvedLora } from "./providers/types";
import { ProviderError } from "./providers/types";
import { newId, readUpload, saveOutput } from "./images";
import { signHandle, verifyHandle } from "./handle";
import type { GenerationRequest, ImageRecord, Job, ResolvedRequest } from "./types";

const MAX_LORAS = Number(process.env.GENIMAGE_MAX_LORAS ?? 6);
const MAX_BATCH = Number(process.env.GENIMAGE_MAX_BATCH ?? 8);
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
/* Running a job                                                       */
/* ------------------------------------------------------------------ */

/**
 * Persists whatever a provider returned.
 *
 * URL-backed images are recorded as-is — the browser fetches them from the
 * provider's CDN, so nothing passes through here. Byte-backed images go to blob
 * storage and are served from `/api/images/<id>`.
 */
async function recordImages(images: GeneratedImage[]): Promise<ImageRecord[]> {
  const records: ImageRecord[] = [];
  for (const image of images) {
    if (image.source.kind === "url") {
      records.push({
        id: newId("img"),
        seed: image.seed,
        width: image.width,
        height: image.height,
        url: image.source.url,
        createdAt: Date.now(),
      });
    } else {
      const id = await saveOutput(image.source.bytes, image.source.mimeType);
      records.push({
        id,
        seed: image.seed,
        width: image.width,
        height: image.height,
        url: null,
        createdAt: Date.now(),
      });
    }
  }
  return records;
}

async function buildContext(
  request: ResolvedRequest,
  signal: AbortSignal,
  withReference: boolean,
): Promise<ProviderContext> {
  const checkpoint = getCheckpoint(request.checkpointId) ?? CHECKPOINTS[0];
  const loras: ResolvedLora[] = request.loras
    .map((selection) => {
      const lora = getLora(selection.id);
      return lora
        ? { lora, strength: selection.strength, clipStrength: selection.clipStrength ?? selection.strength }
        : null;
    })
    .filter((entry): entry is ResolvedLora => entry !== null);

  const referenceImage =
    withReference && request.referenceImageId ? await readUpload(request.referenceImageId) : null;

  return { request, checkpoint, loras, referenceImage, signal };
}

/**
 * Validates a request and kicks off the render.
 *
 * Returns as soon as the provider has accepted the work. Providers that finish
 * inline (Pollinations, the offline renderer) come back `succeeded`; the rest
 * come back `running` with a signed handle for the browser to poll.
 */
export async function submit(input: Partial<GenerationRequest>, signal: AbortSignal): Promise<Job> {
  const { request, loras, warnings } = resolveRequest(input);
  const provider = await resolveProvider(request.provider === "auto" ? null : request.provider);

  if (request.width * request.height > provider.capabilities.maxPixels) {
    warnings.push(
      `${provider.label} caps output around ${Math.round(provider.capabilities.maxPixels / 1_000_000)} MP; ` +
        "the image may be scaled to fit.",
    );
  }
  if (request.batchSize > 1 && !provider.capabilities.batch) {
    warnings.push(`${provider.label} renders one image at a time.`);
  }

  const now = Date.now();
  const job: Job = {
    id: newId("job"),
    status: "running",
    mode: request.mode,
    provider: provider.id,
    request,
    handle: null,
    images: [],
    error: null,
    progress: 0.02,
    queuedAt: now,
    startedAt: now,
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

  try {
    const ctx = await buildContext(request, signal, true);
    if (request.referenceImageId && !ctx.referenceImage) {
      job.warnings.push("The reference image is no longer in storage; it was ignored.");
    }

    const result = await provider.start(ctx);
    job.warnings.push(...result.warnings);

    if (result.status === "done") {
      job.images = await recordImages(result.images);
      job.status = "succeeded";
      job.progress = 1;
      job.finishedAt = Date.now();
    } else {
      if (!provider.poll) {
        throw new ProviderError(`${provider.label} returned a pending job but cannot poll it.`);
      }
      job.handle = signHandle(provider.id, result.handle);
      job.progress = 0.05;
    }
  } catch (error) {
    job.status = "failed";
    job.error = describe(error, provider.label);
    job.finishedAt = Date.now();
  }

  return job;
}

/** Advances a running job. The handle's signature is what authorises the poll. */
export async function advance(job: Job, signal: AbortSignal): Promise<Job> {
  if (job.status !== "running" && job.status !== "queued") return job;

  const provider = getProvider(job.provider);
  if (!provider?.poll) {
    return { ...job, status: "failed", error: "That backend is no longer available.", finishedAt: Date.now() };
  }

  const handle = job.handle ? verifyHandle(job.provider, job.handle) : null;
  if (handle === null) {
    return {
      ...job,
      status: "failed",
      error: "This job's handle is missing or was not issued by this server.",
      finishedAt: Date.now(),
    };
  }

  try {
    // resolveRequest already validated everything on the way in, and the handle
    // signature covers the provider, so the request is only used to shape output.
    const ctx = await buildContext(job.request, signal, false);
    const result = await provider.poll(handle, ctx);

    if (result.status === "pending") {
      return {
        ...job,
        progress: Math.max(job.progress, result.progress ?? job.progress),
        warnings: result.warnings ? [...job.warnings, ...result.warnings] : job.warnings,
      };
    }
    if (result.status === "failed") {
      return { ...job, status: "failed", error: result.error, finishedAt: Date.now() };
    }

    return {
      ...job,
      status: "succeeded",
      progress: 1,
      images: await recordImages(result.images),
      warnings: result.warnings ? [...job.warnings, ...result.warnings] : job.warnings,
      finishedAt: Date.now(),
    };
  } catch (error) {
    return { ...job, status: "failed", error: describe(error, provider.label), finishedAt: Date.now() };
  }
}

function describe(error: unknown, providerLabel: string): string {
  if (error instanceof ProviderError) return error.message;
  const message = (error as Error)?.message ?? String(error);
  // The classic serverless failure, worth naming precisely.
  if (message.includes("ENOENT") || message.includes("EROFS") || message.includes("read-only")) {
    return (
      `${providerLabel} produced images but they could not be stored: ${message}. ` +
      "On a serverless host set up blob storage, or use a backend that returns image URLs."
    );
  }
  return `${providerLabel} failed: ${message}`;
}

/**
 * Cancels a pending job upstream. Best-effort — the browser stops polling
 * either way, but on a per-second backend this is what stops the billing.
 */
export async function abandon(job: Job, signal: AbortSignal): Promise<void> {
  const provider = getProvider(job.provider);
  if (!provider?.cancel || !job.handle) return;

  const handle = verifyHandle(job.provider, job.handle);
  if (handle === null) return;

  await provider.cancel(handle, signal).catch((error) => {
    console.error(`[cancel] ${provider.label} refused:`, error);
  });
}
