/**
 * Binary + JSON storage behind one interface.
 *
 * The studio runs both on a long-lived server (where the local filesystem is
 * fine) and on serverless hosts like Netlify, where `/var/task` is read-only and
 * only a blob service persists. Everything that touches storage goes through
 * here so neither the providers nor the routes have to care.
 */
export interface Storage {
  /** Human-readable name shown in diagnostics. */
  readonly id: string;
  get(key: string): Promise<{ bytes: Buffer; mimeType: string } | null>;
  set(key: string, bytes: Uint8Array, mimeType: string): Promise<void>;
  delete(key: string): Promise<void>;
}
