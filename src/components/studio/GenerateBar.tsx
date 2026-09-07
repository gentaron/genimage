"use client";

import { useState, useSyncExternalStore } from "react";
import { IconBolt, IconChevronDown, IconSparkles, IconSpinner } from "@/components/ui/icons";
import { Checkbox, HelpDot } from "@/components/ui/primitives";
import { BoosterBar } from "./BoosterBar";
import { useStudio } from "./StudioProvider";

const BATCH_OPTIONS = [1, 2, 4, 8];

export function GenerateBar() {
  const { settings, update, derived, generate, submitting, reference, jobs } = useStudio();
  const [menuOpen, setMenuOpen] = useState(false);

  // Show the modifier this user actually presses. The platform never changes,
  // so the subscribe callback is a no-op.
  const shortcut = useSyncExternalStore(
    () => () => {},
    () => (/Mac|iPhone|iPad/.test(navigator.platform) ? "⌘" : "Ctrl"),
    () => "Ctrl",
  );

  const needsReference = settings.mode !== "generate" && !reference;
  const blocked = submitting || !settings.prompt.trim() || needsReference;
  const inFlight = jobs.some((j) => j.status === "queued" || j.status === "running");

  return (
    <div className="flex flex-wrap items-center gap-x-5 gap-y-3">
      <BoosterBar />

      <div className="ml-auto flex items-center gap-4">
        <span className="text-[12.5px]" style={{ color: "var(--text-muted)" }}>
          Est. wait ~{derived.wait}s
        </span>

        <span className="flex items-center gap-1">
          <Checkbox checked={settings.highPriority} onChange={(v) => update({ highPriority: v })}>
            High Priority
          </Checkbox>
          <HelpDot content="Jumps ahead of queued jobs on this instance. It does not make the GPU faster — the credit estimate reflects the premium a hosted service would charge." />
        </span>

        <div className="relative flex">
          <button
            type="button"
            onClick={() => void generate()}
            disabled={blocked}
            title={
              needsReference
                ? "Add a reference image first"
                : `Generate (${shortcut}+Enter)`
            }
            className="btn btn-primary rounded-r-none px-4 py-2.5 text-[13.5px]"
          >
            {submitting || inFlight ? <IconSpinner size={15} /> : <IconSparkles size={15} />}
            <span>Generate</span>
            <span className="inline-flex items-center gap-1 opacity-80">
              <IconBolt size={12} />
              <span className="font-mono tabular-nums">{derived.cost.toLocaleString()}</span>
            </span>
            <kbd
              className="ml-1 hidden rounded px-1.5 py-0.5 font-mono text-[10.5px] sm:inline"
              style={{ background: "rgba(0,0,0,0.22)" }}
            >
              {shortcut}+↵
            </kbd>
          </button>

          <button
            type="button"
            aria-label="Batch size"
            aria-expanded={menuOpen}
            onClick={() => setMenuOpen((o) => !o)}
            disabled={submitting}
            className="btn btn-primary rounded-l-none px-2"
            style={{ borderLeft: "1px solid rgba(0,0,0,0.22)" }}
          >
            <IconChevronDown size={14} />
          </button>

          {menuOpen && (
            <>
              <div className="fixed inset-0 z-40" onClick={() => setMenuOpen(false)} aria-hidden />
              <div
                className="absolute right-0 top-full z-50 mt-1.5 w-52 rounded-lg p-1.5 fade-up"
                style={{
                  background: "var(--bg-elevated)",
                  border: "1px solid var(--border-strong)",
                  boxShadow: "var(--shadow-lg)",
                }}
              >
                <p className="px-2 pb-1.5 pt-1 text-[11px] uppercase tracking-wider" style={{ color: "var(--text-faint)" }}>
                  Images per run
                </p>
                {BATCH_OPTIONS.map((count) => (
                  <button
                    key={count}
                    type="button"
                    onClick={() => {
                      update({ batchSize: count });
                      setMenuOpen(false);
                    }}
                    className="flex w-full items-center justify-between rounded px-2 py-1.5 text-[13px] transition-colors hover:bg-[var(--panel-hover)]"
                    style={{ color: settings.batchSize === count ? "var(--accent)" : "var(--text)" }}
                  >
                    <span>{count === 1 ? "Single" : `Batch ×${count}`}</span>
                    {settings.batchSize === count && <span aria-hidden>✓</span>}
                  </button>
                ))}
              </div>
            </>
          )}
        </div>
      </div>

      {needsReference && (
        <p className="w-full text-[12.5px]" style={{ color: "var(--warn)" }}>
          {settings.mode === "edit" ? "Edit" : "Enhance"} mode needs a reference image — add one in
          the right-hand panel.
        </p>
      )}
    </div>
  );
}
