import type { ProviderStatus } from "../types";
import { comfyuiProvider } from "./comfyui";
import { falProvider } from "./fal";
import { huggingfaceProvider } from "./huggingface";
import { pollinationsProvider } from "./pollinations";
import { previewProvider } from "./preview";
import { replicateProvider } from "./replicate";
import type { ImageProvider } from "./types";

/**
 * Provider registry, in preference order.
 *
 * `auto` walks this list and picks the first backend that is both configured
 * and reachable. ComfyUI leads because when it is running it is free and the
 * most capable; on a cloud deployment it simply is not reachable and the list
 * falls through to the hosted backends.
 */
export const PROVIDERS: ImageProvider[] = [
  comfyuiProvider,
  falProvider,
  replicateProvider,
  huggingfaceProvider,
  pollinationsProvider,
  previewProvider,
];

/** Extra display metadata that does not belong on the provider itself. */
const TRAITS: Record<string, { selfHosted: boolean; pricing: ProviderStatus["pricing"] }> = {
  comfyui: { selfHosted: true, pricing: "free" },
  fal: { selfHosted: false, pricing: "paid" },
  replicate: { selfHosted: false, pricing: "paid" },
  huggingface: { selfHosted: false, pricing: "credits" },
  pollinations: { selfHosted: false, pricing: "free" },
  preview: { selfHosted: false, pricing: "free" },
};

export function getProvider(id: string): ImageProvider | undefined {
  return PROVIDERS.find((p) => p.id === id);
}

/** Health results are cached briefly so the sidebar poll does not hammer backends. */
interface CacheEntry {
  at: number;
  value: ProviderStatus[];
}
const globalCache = globalThis as unknown as { __genimageHealth?: CacheEntry };
const TTL_MS = 15_000;

export async function providerStatuses(force = false): Promise<ProviderStatus[]> {
  const cached = globalCache.__genimageHealth;
  if (!force && cached && Date.now() - cached.at < TTL_MS) return cached.value;

  const value = await Promise.all(
    PROVIDERS.map(async (provider): Promise<ProviderStatus> => {
      const traits = TRAITS[provider.id] ?? { selfHosted: false, pricing: "free" as const };
      const base = {
        id: provider.id,
        label: provider.label,
        requiresKey: provider.requiresKey,
        capabilities: provider.capabilities,
        ...traits,
      };

      if (!provider.isConfigured()) {
        return {
          ...base,
          available: false,
          detail: provider.requiresKey ? "Not configured — API key missing." : "Not configured.",
        };
      }

      const health = await provider.health().catch((error: Error) => ({
        available: false,
        detail: error.message,
      }));
      return { ...base, available: health.available, detail: health.detail };
    }),
  );

  globalCache.__genimageHealth = { at: Date.now(), value };
  return value;
}

/**
 * Resolves the provider for a job. An explicit id is honoured even if the
 * health check is stale — the run itself is the real test — while `auto` and
 * unknown ids fall through the preference list.
 */
export async function resolveProvider(requested: string | null): Promise<ImageProvider> {
  if (requested && requested !== "auto") {
    const provider = getProvider(requested);
    if (provider) return provider;
  }

  const statuses = await providerStatuses();
  for (const provider of PROVIDERS) {
    if (statuses.find((s) => s.id === provider.id)?.available) return provider;
  }
  return previewProvider;
}

export type { ImageProvider } from "./types";
