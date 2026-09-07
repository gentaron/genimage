"use client";

import { DEFAULT_SETTINGS, loadSettings, saveSettings, type Settings } from "./state";

/**
 * Settings live in a tiny external store rather than component state.
 *
 * `useSyncExternalStore` reads the server snapshot during hydration and the
 * localStorage-backed one afterwards, so restoring a session never causes a
 * hydration mismatch and never needs a setState-in-effect.
 */

let snapshot: Settings = DEFAULT_SETTINGS;
let hydrated = false;
const listeners = new Set<() => void>();

export function subscribeSettings(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function getSettingsSnapshot(): Settings {
  if (!hydrated) {
    snapshot = loadSettings();
    hydrated = true;
  }
  return snapshot;
}

export function getServerSettingsSnapshot(): Settings {
  return DEFAULT_SETTINGS;
}

export function writeSettings(next: Settings | ((previous: Settings) => Settings)): void {
  snapshot = typeof next === "function" ? next(getSettingsSnapshot()) : next;
  saveSettings(snapshot);
  for (const listener of listeners) listener();
}
