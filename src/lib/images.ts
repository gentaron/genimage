import crypto from "node:crypto";
import { deleteBlob, getBlob, putBlob } from "./storage";

/**
 * Image bytes.
 *
 * Blobs are keyed by their own id, so serving one is a single lookup and there
 * is no index to keep in sync. Providers that return a URL never come through
 * here at all — the browser loads those directly from the provider's CDN.
 */

export function newId(prefix: string): string {
  return `${prefix}_${crypto.randomBytes(9).toString("base64url")}`;
}

const OUTPUT_PREFIX = "images/";
const UPLOAD_PREFIX = "uploads/";

export async function saveOutput(bytes: Uint8Array, mimeType: string): Promise<string> {
  const id = newId("img");
  await putBlob(OUTPUT_PREFIX + id, bytes, mimeType);
  return id;
}

export async function readOutput(id: string) {
  if (!/^img_[A-Za-z0-9_-]+$/.test(id)) return null;
  return getBlob(OUTPUT_PREFIX + id);
}

export async function deleteOutput(id: string): Promise<void> {
  if (!/^img_[A-Za-z0-9_-]+$/.test(id)) return;
  await deleteBlob(OUTPUT_PREFIX + id);
}

export async function saveUpload(bytes: Uint8Array, mimeType: string): Promise<string> {
  const id = newId("ref");
  await putBlob(UPLOAD_PREFIX + id, bytes, mimeType);
  return id;
}

export async function readUpload(id: string) {
  if (!/^ref_[A-Za-z0-9_-]+$/.test(id)) return null;
  return getBlob(UPLOAD_PREFIX + id);
}
