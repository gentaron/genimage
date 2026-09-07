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
  signal: AbortSignal;
}

/**
 * Where an image lives.
 *
 * `url` means the provider already hosts it and the browser can load it
 * directly — no bytes ever pass through our server, which is what keeps a
 * serverless deployment inside its request budget. `bytes` means we have to
 * persist it ourselves.
 */
export type ImageSource =
  | { kind: "url"; url: string }
  | { kind: "bytes"; bytes: Uint8Array; mimeType: string };

export interface GeneratedImage {
  source: ImageSource;
  seed: number;
  width: number;
  height: number;
}

/**
 * Result of kicking off a render.
 *
 * `done` finished inside the request. `pending` means the work is running on the
 * provider's side and `handle` is whatever `poll` needs to check on it — it is
 * persisted with the job and round-tripped through the browser, so it must be
 * JSON-serialisable and must never contain a credential.
 */
export type StartResult =
  | { status: "done"; images: GeneratedImage[]; warnings: string[] }
  | { status: "pending"; handle: unknown; warnings: string[] };

export type PollResult =
  | { status: "done"; images: GeneratedImage[]; warnings?: string[] }
  | { status: "pending"; progress?: number; warnings?: string[] }
  | { status: "failed"; error: string };

export interface ImageProvider {
  id: string;
  label: string;
  summary: string;
  requiresKey: boolean;
  capabilities: ProviderCapabilities;
  isConfigured(): boolean;
  health(signal?: AbortSignal): Promise<{ available: boolean; detail: string }>;
  /** Kick off a render. Must return quickly enough for a serverless request. */
  start(ctx: ProviderContext): Promise<StartResult>;
  /** Required whenever `start` can return `pending`. */
  poll?(handle: unknown, ctx: ProviderContext): Promise<PollResult>;
  /**
   * Stop a pending job upstream. Worth implementing on any backend that bills
   * by the second — abandoning the browser tab should not keep the meter
   * running. Best-effort: failures are swallowed by the caller.
   */
  cancel?(handle: unknown, signal: AbortSignal): Promise<void>;
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
