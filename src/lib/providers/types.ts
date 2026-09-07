import type { Checkpoint, Lora } from "../catalog";
import type { ProviderCapabilities, ResolvedRequest } from "../types";

export interface ResolvedLora {
  lora: Lora;
  strength: number;
  clipStrength: number;
}

export interface ProviderContext {
  request: ResolvedRequest;
  checkpoint: Checkpoint;
  loras: ResolvedLora[];
  referenceImage: { bytes: Buffer; mimeType: string } | null;
  /** 0–1. Providers call this as often as they can; the UI interpolates. */
  onProgress: (progress: number) => void;
  signal: AbortSignal;
}

export interface GeneratedImage {
  bytes: Uint8Array;
  mimeType: string;
  seed: number;
  width: number;
  height: number;
}

export interface ProviderResult {
  images: GeneratedImage[];
  /** Surfaced in the UI, e.g. "LoRA weights were not applied by this backend". */
  warnings: string[];
}

export interface ImageProvider {
  id: string;
  label: string;
  /** One line shown in the provider picker. */
  summary: string;
  requiresKey: boolean;
  capabilities: ProviderCapabilities;
  /** Cheap synchronous check: is the config present at all? */
  isConfigured(): boolean;
  /** Network check with a short timeout. */
  health(signal?: AbortSignal): Promise<{ available: boolean; detail: string }>;
  generate(ctx: ProviderContext): Promise<ProviderResult>;
}

export class ProviderError extends Error {
  constructor(
    message: string,
    readonly retriable = false,
  ) {
    super(message);
    this.name = "ProviderError";
  }
}

/** `fetch` with a hard timeout, honouring an outer abort signal too. */
export async function fetchWithTimeout(
  url: string,
  init: RequestInit & { timeoutMs?: number } = {},
  outer?: AbortSignal,
): Promise<Response> {
  const { timeoutMs = 30_000, ...rest } = init;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(new Error(`Timed out after ${timeoutMs}ms`)), timeoutMs);
  const onAbort = () => controller.abort(outer?.reason);
  outer?.addEventListener("abort", onAbort);
  try {
    return await fetch(url, { ...rest, signal: controller.signal });
  } finally {
    clearTimeout(timer);
    outer?.removeEventListener("abort", onAbort);
  }
}
