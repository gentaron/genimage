"use client";

import { useState } from "react";
import { IconCheck, IconChevronDown, IconGrid } from "@/components/ui/icons";
import { Section } from "@/components/ui/primitives";
import { Thumb } from "./LoraPanel";
import { useStudio } from "./StudioProvider";

export function ModelPanel() {
  const { catalog, settings, update } = useStudio();
  const [picking, setPicking] = useState(false);

  const checkpoints = catalog?.checkpoints ?? [];
  const current = checkpoints.find((c) => c.id === settings.checkpointId) ?? checkpoints[0];
  if (!current) return null;

  return (
    <Section
      title={
        <>
          <IconGrid size={14} />
          Model
        </>
      }
      help="The base checkpoint. It decides the prompt vocabulary — Illustrious and NoobAI-XL expect Danbooru tags, SDXL and FLUX prefer sentences."
      right={
        <button
          type="button"
          onClick={() => setPicking((p) => !p)}
          className="inline-flex items-center gap-1 text-[11.5px]"
          style={{ color: "var(--accent)" }}
          aria-expanded={picking}
        >
          {picking ? "Close" : "Change"}
          <IconChevronDown
            size={11}
            style={{ transform: picking ? "rotate(180deg)" : "none", transition: "transform 120ms" }}
          />
        </button>
      }
    >
      {!picking ? (
        <div
          className="flex items-start gap-3 rounded-lg p-2.5"
          style={{ background: "var(--sunken)", border: "1px solid var(--border)" }}
        >
          <Thumb colors={current.thumb} size={56} />
          <div className="min-w-0 flex-1">
            <p className="truncate text-[13px] font-medium">{current.name}</p>
            <p className="mt-0.5 flex items-center gap-1.5 text-[11px]" style={{ color: "var(--text-faint)" }}>
              <span>{current.version}</span>
              <span
                className="rounded px-1 py-px"
                style={{ background: "var(--accent-soft)", color: "var(--accent)" }}
              >
                {current.baseModel}
              </span>
              <span>CLIP skip {current.clipSkip}</span>
            </p>
            <p className="mt-1.5 text-[11.5px] leading-relaxed" style={{ color: "var(--text-muted)" }}>
              {current.description}
            </p>
          </div>
        </div>
      ) : (
        <ul className="space-y-1.5">
          {checkpoints.map((checkpoint) => {
            const active = checkpoint.id === settings.checkpointId;
            return (
              <li key={checkpoint.id}>
                <button
                  type="button"
                  onClick={() => {
                    update({ checkpointId: checkpoint.id, steps: null, cfg: null, sampler: null, scheduler: null, clipSkip: null });
                    setPicking(false);
                  }}
                  className="flex w-full items-center gap-2.5 rounded-lg p-2 text-left transition-colors hover:bg-[var(--panel-hover)]"
                  style={{ border: `1px solid ${active ? "var(--accent)" : "var(--border)"}` }}
                >
                  <Thumb colors={checkpoint.thumb} size={38} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[12.5px] font-medium">{checkpoint.name}</span>
                    <span className="block text-[11px]" style={{ color: "var(--text-faint)" }}>
                      {checkpoint.baseModel} · {checkpoint.version}
                    </span>
                  </span>
                  {active && <IconCheck size={15} style={{ color: "var(--accent)" }} />}
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </Section>
  );
}
