"use client";

import { useEffect, useRef, useState } from "react";
import { IconClose, IconPlus } from "@/components/ui/icons";
import type { Booster } from "@/lib/prompt";
import { useStudio } from "./StudioProvider";

const GROUP_LABEL: Record<Booster["group"], string> = {
  quality: "Quality",
  lighting: "Lighting",
  camera: "Camera",
  render: "Render",
  negative: "Cleanup",
};

export function BoosterBar() {
  const { catalog, settings, update } = useStudio();
  const [open, setOpen] = useState(false);
  const wrapper = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: MouseEvent) => {
      if (!wrapper.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const boosters = catalog?.boosters ?? [];
  const selected = boosters.filter((b) => settings.boosters.includes(b.id));

  const toggle = (id: string) => {
    update({
      boosters: settings.boosters.includes(id)
        ? settings.boosters.filter((b) => b !== id)
        : [...settings.boosters, id],
    });
  };

  const groups = Array.from(new Set(boosters.map((b) => b.group)));

  return (
    <div ref={wrapper} className="relative flex flex-wrap items-center gap-2">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="btn btn-ghost rounded-full px-3 py-1.5"
      >
        Add Booster
        <IconPlus size={13} />
      </button>

      {selected.map((booster) => (
        <span
          key={booster.id}
          className="inline-flex items-center gap-1.5 rounded-full py-1 pl-3 pr-1.5 text-[12px]"
          style={{ background: "var(--accent-soft)", color: "var(--accent)", border: "1px solid transparent" }}
          title={booster.hint}
        >
          {booster.label}
          <button
            type="button"
            onClick={() => toggle(booster.id)}
            aria-label={`Remove ${booster.label}`}
            className="rounded-full p-0.5 transition-colors hover:bg-[var(--panel-hover)]"
          >
            <IconClose size={12} />
          </button>
        </span>
      ))}

      {open && (
        <div
          className="absolute bottom-full left-0 z-50 mb-2 w-[420px] max-w-[calc(100vw-3rem)] rounded-xl p-3 fade-up"
          style={{
            background: "var(--bg-elevated)",
            border: "1px solid var(--border-strong)",
            boxShadow: "var(--shadow-lg)",
          }}
        >
          <p className="mb-3 text-[12px]" style={{ color: "var(--text-muted)" }}>
            Boosters append tested tag groups to your prompt at generation time. They never overwrite
            what you typed.
          </p>
          <div className="max-h-[320px] space-y-3 overflow-auto pr-1">
            {groups.map((group) => (
              <div key={group}>
                <h4
                  className="mb-1.5 text-[11px] font-semibold uppercase tracking-wider"
                  style={{ color: "var(--text-faint)" }}
                >
                  {GROUP_LABEL[group]}
                </h4>
                <div className="flex flex-wrap gap-1.5">
                  {boosters
                    .filter((b) => b.group === group)
                    .map((booster) => {
                      const active = settings.boosters.includes(booster.id);
                      return (
                        <button
                          key={booster.id}
                          type="button"
                          onClick={() => toggle(booster.id)}
                          title={booster.hint}
                          aria-pressed={active}
                          className="rounded-full px-2.5 py-1 text-[12px] transition-colors"
                          style={{
                            background: active ? "var(--accent)" : "var(--sunken)",
                            color: active ? "var(--accent-text)" : "var(--text-muted)",
                            border: `1px solid ${active ? "transparent" : "var(--border)"}`,
                          }}
                        >
                          {booster.label}
                        </button>
                      );
                    })}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
