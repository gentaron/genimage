import type { Storage } from "./types";

interface Entry {
  bytes: Buffer;
  mimeType: string;
  at: number;
}

/**
 * Last-resort in-process storage.
 *
 * On a serverless host this only survives within one warm instance, so it is
 * never chosen when a durable backend is available. It keeps local development
 * working when the data directory is not writable.
 */
export function memoryStorage(maxBytes = 256 * 1024 * 1024): Storage {
  const globalCache = globalThis as unknown as { __genimageMemoryStore?: Map<string, Entry> };
  const entries = (globalCache.__genimageMemoryStore ??= new Map());

  const evict = () => {
    let total = 0;
    for (const entry of entries.values()) total += entry.bytes.length;
    if (total <= maxBytes) return;
    // Oldest first until we are back under the cap.
    const ordered = [...entries.entries()].sort((a, b) => a[1].at - b[1].at);
    for (const [key, entry] of ordered) {
      if (total <= maxBytes) break;
      total -= entry.bytes.length;
      entries.delete(key);
    }
  };

  return {
    id: "memory",
    async get(key) {
      const entry = entries.get(key);
      return entry ? { bytes: entry.bytes, mimeType: entry.mimeType } : null;
    },
    async set(key, bytes, mimeType) {
      entries.set(key, { bytes: Buffer.from(bytes), mimeType, at: Date.now() });
      evict();
    },
    async delete(key) {
      entries.delete(key);
    },
  };
}
