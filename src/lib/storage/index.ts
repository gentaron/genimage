import path from "node:path";
import { filesystemStorage } from "./filesystem";
import { memoryStorage } from "./memory";
import { isNetlifyRuntime, netlifyBlobStorage } from "./netlify";
import type { Storage } from "./types";

export type { Storage } from "./types";

const STORE_NAME = process.env.GENIMAGE_BLOB_STORE ?? "genimage";

function choose(): Storage {
  // An explicit choice always wins, so a self-hosted deployment can force one.
  const forced = process.env.GENIMAGE_STORAGE;
  if (forced === "memory") return memoryStorage();
  if (forced === "netlify") return netlifyBlobStorage(STORE_NAME);
  if (forced === "filesystem") return filesystemStorage(dataDir());

  if (isNetlifyRuntime()) return netlifyBlobStorage(STORE_NAME);
  return filesystemStorage(dataDir());
}

export function dataDir(): string {
  return process.env.GENIMAGE_DATA_DIR
    ? path.resolve(process.env.GENIMAGE_DATA_DIR)
    : path.join(process.cwd(), "data");
}

const globalStorage = globalThis as unknown as { __genimageStorage?: Storage };

export function storage(): Storage {
  return (globalStorage.__genimageStorage ??= choose());
}

/**
 * Writes through the chosen backend, falling back to memory if it rejects.
 *
 * A read-only filesystem is the classic serverless failure: without this the
 * whole render is lost after the model has already done the expensive part.
 */
export async function putBlob(key: string, bytes: Uint8Array, mimeType: string): Promise<Storage> {
  const primary = storage();
  try {
    await primary.set(key, bytes, mimeType);
    return primary;
  } catch (error) {
    console.error(`[storage] ${primary.id} rejected a write, falling back to memory:`, error);
    const fallback = memoryStorage();
    await fallback.set(key, bytes, mimeType);
    globalStorage.__genimageStorage = fallback;
    return fallback;
  }
}

export async function getBlob(key: string): Promise<{ bytes: Buffer; mimeType: string } | null> {
  try {
    const found = await storage().get(key);
    if (found) return found;
  } catch (error) {
    console.error("[storage] read failed:", error);
  }
  // A write may have landed in the memory fallback after the primary failed.
  return memoryStorage().get(key);
}

export async function deleteBlob(key: string): Promise<void> {
  await storage().delete(key).catch(() => {});
  await memoryStorage().delete(key).catch(() => {});
}
