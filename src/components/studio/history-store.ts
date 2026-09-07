"use client";

import type { Job } from "@/lib/types";
import { loadHistory, saveHistory } from "./state";

/**
 * Job history, shared by the studio and the gallery.
 *
 * Like the settings store, this is an external store read through
 * `useSyncExternalStore`: the server snapshot is empty and the browser snapshot
 * comes from localStorage, so restoring history never causes a hydration
 * mismatch and no effect has to set state on mount.
 */

const EMPTY: Job[] = [];

let snapshot: Job[] = EMPTY;
let hydrated = false;
const listeners = new Set<() => void>();

export function subscribeHistory(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function getHistorySnapshot(): Job[] {
  if (!hydrated) {
    snapshot = loadHistory();
    hydrated = true;
  }
  return snapshot;
}

export function getServerHistorySnapshot(): Job[] {
  return EMPTY;
}

export function writeHistory(next: Job[] | ((previous: Job[]) => Job[])): void {
  snapshot = typeof next === "function" ? next(getHistorySnapshot()) : next;
  saveHistory(snapshot);
  for (const listener of listeners) listener();
}
