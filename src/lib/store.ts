import { promises as fs } from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import type { ImageRecord, Job } from "./types";

/**
 * Filesystem-backed store.
 *
 * Jobs live in memory and are mirrored to `jobs.json` so history survives a
 * restart; image bytes go straight to disk and are streamed back out by
 * `/api/images/[id]`. Deliberately dependency-free — swapping in Postgres later
 * only means reimplementing this module's exported surface.
 */

export const DATA_DIR = process.env.GENIMAGE_DATA_DIR
  ? path.resolve(process.env.GENIMAGE_DATA_DIR)
  : path.join(process.cwd(), "data");

export const OUTPUT_DIR = path.join(DATA_DIR, "outputs");
export const UPLOAD_DIR = path.join(DATA_DIR, "uploads");
const JOBS_FILE = path.join(DATA_DIR, "jobs.json");

/** Keeps `jobs.json` from growing without bound on a long-lived instance. */
const MAX_JOBS = Number(process.env.GENIMAGE_MAX_HISTORY ?? 500);

interface StoreState {
  jobs: Map<string, Job>;
  order: string[];
  loaded: boolean;
  writing: Promise<void> | null;
  dirty: boolean;
}

// Next's dev server re-evaluates modules on edit; a global keeps the queue and
// history alive across those reloads.
const globalStore = globalThis as unknown as { __genimageStore?: StoreState };

const state: StoreState =
  globalStore.__genimageStore ??
  (globalStore.__genimageStore = {
    jobs: new Map(),
    order: [],
    loaded: false,
    writing: null,
    dirty: false,
  });

export function newId(prefix: string): string {
  return `${prefix}_${crypto.randomBytes(9).toString("base64url")}`;
}

async function ensureDirs(): Promise<void> {
  await fs.mkdir(OUTPUT_DIR, { recursive: true });
  await fs.mkdir(UPLOAD_DIR, { recursive: true });
}

async function load(): Promise<void> {
  if (state.loaded) return;
  state.loaded = true;
  await ensureDirs();
  try {
    const raw = await fs.readFile(JOBS_FILE, "utf8");
    const parsed = JSON.parse(raw) as Job[];
    for (const job of parsed) {
      // A job that was mid-flight when the process died can never finish.
      if (job.status === "running" || job.status === "queued") {
        job.status = "failed";
        job.error = "Interrupted by a server restart.";
        job.finishedAt = job.finishedAt ?? Date.now();
      }
      state.jobs.set(job.id, job);
      state.order.push(job.id);
    }
  } catch {
    // No history yet, or it is unreadable — start clean rather than crash.
  }
}

/** Coalesces concurrent writes; at most one flush is in flight at a time. */
function scheduleFlush(): void {
  state.dirty = true;
  if (state.writing) return;
  state.writing = (async () => {
    // Let the current tick finish so a burst of updates becomes one write.
    await new Promise((r) => setTimeout(r, 50));
    while (state.dirty) {
      state.dirty = false;
      const jobs = state.order.map((id) => state.jobs.get(id)!).filter(Boolean);
      const tmp = `${JOBS_FILE}.${process.pid}.tmp`;
      try {
        await fs.writeFile(tmp, JSON.stringify(jobs), "utf8");
        await fs.rename(tmp, JOBS_FILE);
      } catch {
        await fs.rm(tmp, { force: true }).catch(() => {});
      }
    }
    state.writing = null;
  })();
}

export async function putJob(job: Job): Promise<void> {
  await load();
  const isNew = !state.jobs.has(job.id);
  state.jobs.set(job.id, job);
  if (isNew) {
    state.order.unshift(job.id);
    while (state.order.length > MAX_JOBS) {
      const dropped = state.order.pop();
      if (dropped) {
        const old = state.jobs.get(dropped);
        state.jobs.delete(dropped);
        // Reclaim the pixels too, otherwise the disk fills up silently.
        for (const image of old?.images ?? []) {
          fs.rm(path.join(DATA_DIR, image.file), { force: true }).catch(() => {});
        }
      }
    }
  }
  scheduleFlush();
}

export async function getJob(id: string): Promise<Job | undefined> {
  await load();
  return state.jobs.get(id);
}

export async function listJobs(limit = 50, offset = 0): Promise<Job[]> {
  await load();
  return state.order
    .slice(offset, offset + limit)
    .map((id) => state.jobs.get(id)!)
    .filter(Boolean);
}

export async function countJobs(): Promise<number> {
  await load();
  return state.order.length;
}

export async function deleteJob(id: string): Promise<boolean> {
  await load();
  const job = state.jobs.get(id);
  if (!job) return false;
  state.jobs.delete(id);
  state.order = state.order.filter((x) => x !== id);
  for (const image of job.images) {
    await fs.rm(path.join(DATA_DIR, image.file), { force: true }).catch(() => {});
  }
  scheduleFlush();
  return true;
}

export async function findImage(imageId: string): Promise<ImageRecord | undefined> {
  await load();
  for (const id of state.order) {
    const job = state.jobs.get(id);
    const image = job?.images.find((i) => i.id === imageId);
    if (image) return image;
  }
  return undefined;
}

/* ------------------------------------------------------------------ */
/* Binary payloads                                                     */
/* ------------------------------------------------------------------ */

const EXT_BY_MIME: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
};

export async function saveOutput(
  jobId: string,
  bytes: Uint8Array,
  mimeType: string,
): Promise<{ id: string; file: string }> {
  await ensureDirs();
  const id = newId("img");
  const ext = EXT_BY_MIME[mimeType] ?? "png";
  const file = path.join("outputs", `${id}.${ext}`);
  await fs.writeFile(path.join(DATA_DIR, file), bytes);
  return { id, file };
}

export async function saveUpload(bytes: Uint8Array, mimeType: string): Promise<{ id: string; file: string }> {
  await ensureDirs();
  const id = newId("ref");
  const ext = EXT_BY_MIME[mimeType] ?? "png";
  const file = path.join("uploads", `${id}.${ext}`);
  await fs.writeFile(path.join(DATA_DIR, file), bytes);
  return { id, file };
}

/** Resolves an upload id back to its bytes, refusing anything outside the data dir. */
export async function readUpload(id: string): Promise<{ bytes: Buffer; mimeType: string } | null> {
  if (!/^ref_[A-Za-z0-9_-]+$/.test(id)) return null;
  for (const [mime, ext] of Object.entries(EXT_BY_MIME)) {
    const candidate = path.join(UPLOAD_DIR, `${id}.${ext}`);
    if (!candidate.startsWith(UPLOAD_DIR)) continue;
    try {
      return { bytes: await fs.readFile(candidate), mimeType: mime };
    } catch {
      // try the next extension
    }
  }
  return null;
}

export async function readOutput(image: ImageRecord): Promise<Buffer | null> {
  const full = path.join(DATA_DIR, image.file);
  if (!full.startsWith(DATA_DIR)) return null;
  try {
    return await fs.readFile(full);
  } catch {
    return null;
  }
}
