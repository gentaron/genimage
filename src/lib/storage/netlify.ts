import type { Storage } from "./types";

/**
 * Netlify Blobs.
 *
 * Netlify's filesystem is read-only apart from `/tmp`, which is per-instance and
 * ephemeral, so generated images and uploads go to Blobs instead. On Netlify the
 * SDK picks its credentials up from the runtime — nothing to configure.
 */
export function netlifyBlobStorage(storeName: string): Storage {
  // The SDK is imported lazily so a non-Netlify deployment never loads it.
  const store = (async () => {
    const { getStore } = await import("@netlify/blobs");
    return getStore({ name: storeName, consistency: "strong" });
  })();

  return {
    id: `netlify-blobs(${storeName})`,

    async get(key) {
      const result = await (await store).getWithMetadata(key, { type: "arrayBuffer" });
      if (!result) return null;
      return {
        bytes: Buffer.from(result.data),
        mimeType: String(result.metadata?.mimeType ?? "application/octet-stream"),
      };
    },

    async set(key, bytes, mimeType) {
      // Copy into a standalone ArrayBuffer: a Uint8Array view may only cover
      // part of a pooled Node Buffer.
      const buffer = bytes.buffer.slice(
        bytes.byteOffset,
        bytes.byteOffset + bytes.byteLength,
      ) as ArrayBuffer;
      await (await store).set(key, buffer, { metadata: { mimeType } });
    },

    async delete(key) {
      await (await store).delete(key);
    },
  };
}

/** True when the Blobs runtime context is actually available. */
export function isNetlifyRuntime(): boolean {
  return Boolean(
    process.env.NETLIFY_BLOBS_CONTEXT ||
      (process.env.NETLIFY && process.env.SITE_ID && process.env.NETLIFY_API_TOKEN),
  );
}
