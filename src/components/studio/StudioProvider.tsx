"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  useSyncExternalStore,
} from "react";
import { dimensionsFor, type Lora } from "@/lib/catalog";
import { estimateCost, estimateWait, joinTags } from "@/lib/prompt";
import type { GenerationRequest, Job } from "@/lib/types";
import {
  getServerSettingsSnapshot,
  getSettingsSnapshot,
  subscribeSettings,
  writeSettings,
} from "./settings-store";
import {
  DEFAULT_SETTINGS,
  settingsFromJob,
  type Catalog,
  type ReferenceImage,
  type Settings,
} from "./state";

interface StudioValue {
  catalog: Catalog | null;
  settings: Settings;
  update: (patch: Partial<Settings>) => void;
  reset: () => void;
  remix: (job: Job) => void;

  reference: ReferenceImage | null;
  setReference: (file: File | null) => Promise<void>;

  jobs: Job[];
  activeJob: Job | null;
  submitting: boolean;
  error: string | null;
  dismissError: () => void;

  generate: () => Promise<void>;
  cancelJob: (id: string) => Promise<void>;
  removeJob: (id: string) => Promise<void>;

  /** Derived, kept here so the composer and the rail cannot disagree. */
  derived: {
    width: number;
    height: number;
    steps: number;
    cfg: number;
    sampler: string;
    scheduler: string;
    cost: number;
    wait: number;
    activeLoras: { lora: Lora; strength: number }[];
    acceleratorNote: string | null;
    provider: string;
  };
}

const StudioContext = createContext<StudioValue | null>(null);

export function useStudio(): StudioValue {
  const value = useContext(StudioContext);
  if (!value) throw new Error("useStudio must be used inside <StudioProvider>");
  return value;
}

const POLL_INTERVAL_MS = 700;

export function StudioProvider({ children }: { children: React.ReactNode }) {
  const settings = useSyncExternalStore(
    subscribeSettings,
    getSettingsSnapshot,
    getServerSettingsSnapshot,
  );
  const [catalog, setCatalog] = useState<Catalog | null>(null);
  const [jobs, setJobs] = useState<Job[]>([]);
  const [activeJobId, setActiveJobId] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reference, setReferenceState] = useState<ReferenceImage | null>(null);

  // --- boot ---------------------------------------------------------------
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const [catalogRes, jobsRes] = await Promise.all([
          fetch("/api/catalog"),
          fetch("/api/jobs?limit=24"),
        ]);
        if (cancelled) return;
        if (catalogRes.ok) setCatalog((await catalogRes.json()) as Catalog);
        if (jobsRes.ok) setJobs(((await jobsRes.json()) as { jobs: Job[] }).jobs);
      } catch {
        if (!cancelled) setError("Could not reach the server. Is `npm run dev` still running?");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Release the object URL when the reference is replaced or the page unmounts.
  useEffect(() => {
    if (!reference) return;
    const url = reference.preview;
    return () => URL.revokeObjectURL(url);
  }, [reference]);

  const update = useCallback((patch: Partial<Settings>) => {
    writeSettings((prev) => ({ ...prev, ...patch }));
  }, []);

  const reset = useCallback(() => {
    writeSettings((prev) => ({ ...DEFAULT_SETTINGS, provider: prev.provider }));
    setError(null);
  }, []);

  const remix = useCallback((job: Job) => {
    writeSettings((prev) => settingsFromJob(job, prev));
    if (typeof window !== "undefined") window.scrollTo({ top: 0, behavior: "smooth" });
  }, []);

  const setReference = useCallback(async (file: File | null) => {
    setReferenceState(null);
    if (!file) return;

    const form = new FormData();
    form.append("image", file);
    try {
      const res = await fetch("/api/upload", { method: "POST", body: form });
      const json = (await res.json()) as { id?: string; error?: string };
      if (!res.ok || !json.id) {
        setError(json.error ?? "The reference image could not be uploaded.");
        return;
      }
      setReferenceState({ id: json.id, preview: URL.createObjectURL(file), name: file.name });
    } catch {
      setError("The reference image could not be uploaded.");
    }
  }, []);

  // --- derived ------------------------------------------------------------
  const derived = useMemo(() => {
    const checkpoint =
      catalog?.checkpoints.find((c) => c.id === settings.checkpointId) ?? catalog?.checkpoints[0];

    const activeLoras = (catalog?.loras ?? [])
      .filter((lora) => settings.loras[lora.id]?.enabled)
      .map((lora) => ({
        lora,
        strength: settings.loras[lora.id]?.strength ?? lora.strength.default,
      }));

    const accelerator = activeLoras.find((l) => l.lora.accelerator)?.lora.accelerator;
    const defaults = accelerator
      ? {
          steps: accelerator.steps,
          cfg: accelerator.cfg,
          sampler: accelerator.sampler,
          scheduler: accelerator.scheduler,
        }
      : (checkpoint?.defaults ?? { steps: 28, cfg: 5, sampler: "euler_ancestral", scheduler: "normal" });

    const [width, height] = dimensionsFor(settings.aspectRatio, settings.resolution);
    const steps = settings.steps ?? defaults.steps;
    const cfg = settings.cfg ?? defaults.cfg;

    return {
      width,
      height,
      steps,
      cfg,
      sampler: settings.sampler ?? defaults.sampler,
      scheduler: settings.scheduler ?? defaults.scheduler,
      cost: estimateCost({
        width,
        height,
        steps,
        batchSize: settings.batchSize,
        loraCount: activeLoras.length,
        highPriority: settings.highPriority,
        upscale: settings.mode === "enhance" ? settings.upscale : 1,
      }),
      wait: estimateWait({
        width,
        height,
        steps,
        batchSize: settings.batchSize,
        highPriority: settings.highPriority,
      }),
      activeLoras,
      acceleratorNote: accelerator?.note ?? null,
      provider: settings.provider,
    };
  }, [catalog, settings]);

  // --- generation ---------------------------------------------------------
  const generate = useCallback(async () => {
    if (submitting) return;
    setError(null);

    const boosters = (catalog?.boosters ?? []).filter((b) => settings.boosters.includes(b.id));
    const payload: Partial<GenerationRequest> = {
      mode: settings.mode,
      prompt: joinTags(settings.prompt, ...boosters.map((b) => b.positive ?? "")),
      negativePrompt: joinTags(settings.negativePrompt, ...boosters.map((b) => b.negative ?? "")),
      checkpointId: settings.checkpointId,
      loras: derived.activeLoras.map((l) => ({ id: l.lora.id, strength: l.strength })),
      aspectRatio: settings.aspectRatio,
      resolution: settings.resolution,
      batchSize: settings.batchSize,
      seed: settings.lockSeed ? settings.seed : null,
      steps: settings.steps,
      cfg: settings.cfg,
      sampler: settings.sampler,
      scheduler: settings.scheduler,
      clipSkip: settings.clipSkip,
      appendQualityTags: settings.appendQualityTags,
      denoise: settings.denoise,
      upscale: settings.upscale,
      referenceImageId: settings.mode === "generate" ? null : (reference?.id ?? null),
      provider: settings.provider === "auto" ? null : settings.provider,
      highPriority: settings.highPriority,
    };

    setSubmitting(true);
    try {
      const res = await fetch("/api/generate", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      });
      const json = (await res.json()) as { job?: Job; error?: string };
      if (!res.ok || !json.job) {
        setError(json.error ?? "The job could not be queued.");
        return;
      }
      setJobs((prev) => [json.job!, ...prev]);
      setActiveJobId(json.job.id);
      // Remember the seed the server actually rolled, so "lock seed" reproduces it.
      if (!settings.lockSeed) writeSettings((prev) => ({ ...prev, seed: json.job!.request.seed }));
    } catch {
      setError("The server did not respond. Check the terminal running the dev server.");
    } finally {
      setSubmitting(false);
    }
  }, [catalog, derived.activeLoras, reference, settings, submitting]);

  // Poll while anything is in flight, then stop. One timer for all jobs.
  useEffect(() => {
    const pending = jobs.filter((j) => j.status === "queued" || j.status === "running");
    if (pending.length === 0) return;

    let stopped = false;
    const tick = async () => {
      const updated = await Promise.all(
        pending.map(async (job) => {
          try {
            const res = await fetch(`/api/jobs/${job.id}`, { cache: "no-store" });
            if (!res.ok) return null;
            return ((await res.json()) as { job: Job }).job;
          } catch {
            return null;
          }
        }),
      );
      if (stopped) return;
      const byId = new Map(updated.filter((j): j is Job => j !== null).map((j) => [j.id, j]));
      if (byId.size > 0) setJobs((prev) => prev.map((j) => byId.get(j.id) ?? j));
    };

    const timer = setInterval(() => void tick(), POLL_INTERVAL_MS);
    return () => {
      stopped = true;
      clearInterval(timer);
    };
  }, [jobs]);

  const cancelJob = useCallback(async (id: string) => {
    await fetch(`/api/jobs/${id}?action=cancel`, { method: "DELETE" }).catch(() => null);
    setJobs((prev) =>
      prev.map((j) => (j.id === id ? { ...j, status: "cancelled", finishedAt: Date.now() } : j)),
    );
  }, []);

  const removeJob = useCallback(async (id: string) => {
    setJobs((prev) => prev.filter((j) => j.id !== id));
    setActiveJobId((prev) => (prev === id ? null : prev));
    await fetch(`/api/jobs/${id}`, { method: "DELETE" }).catch(() => null);
  }, []);

  const activeJob = useMemo(
    () => jobs.find((j) => j.id === activeJobId) ?? jobs[0] ?? null,
    [jobs, activeJobId],
  );

  const value: StudioValue = {
    catalog,
    settings,
    update,
    reset,
    remix,
    reference,
    setReference,
    jobs,
    activeJob,
    submitting,
    error,
    dismissError: () => setError(null),
    generate,
    cancelJob,
    removeJob,
    derived,
  };

  return <StudioContext.Provider value={value}>{children}</StudioContext.Provider>;
}
