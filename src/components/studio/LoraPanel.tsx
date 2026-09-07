"use client";

import { useState } from "react";
import { IconBolt, IconChevronDown, IconClose, IconLayers } from "@/components/ui/icons";
import { Section, Slider, Tooltip } from "@/components/ui/primitives";
import type { Lora } from "@/lib/catalog";
import { useStudio } from "./StudioProvider";

export function Thumb({ colors, size = 44 }: { colors: [string, string]; size?: number }) {
  return (
    <span
      className="block shrink-0 rounded-lg"
      style={{
        width: size,
        height: size,
        background: `linear-gradient(140deg, ${colors[0]}, ${colors[1]})`,
        boxShadow: "inset 0 0 0 1px rgba(255,255,255,0.08)",
      }}
      aria-hidden
    />
  );
}

const KIND_LABEL: Record<Lora["kind"], string> = {
  style: "Style",
  character: "Character",
  concept: "Concept",
  accelerator: "Accelerator",
};

export function LoraPanel() {
  const { catalog, settings, update, derived } = useStudio();
  const [showAll, setShowAll] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null);

  const loras = catalog?.loras ?? [];
  const checkpoint = catalog?.checkpoints.find((c) => c.id === settings.checkpointId);
  const active = loras.filter((l) => settings.loras[l.id]?.enabled);
  const inactive = loras.filter((l) => !settings.loras[l.id]?.enabled);

  const setEnabled = (lora: Lora, enabled: boolean) => {
    update({
      loras: {
        ...settings.loras,
        [lora.id]: {
          enabled,
          strength: settings.loras[lora.id]?.strength ?? lora.strength.default,
        },
      },
    });
    if (enabled) setExpanded(lora.id);
  };

  const setStrength = (lora: Lora, strength: number) => {
    update({
      loras: { ...settings.loras, [lora.id]: { enabled: true, strength } },
    });
  };

  const styleWeight = derived.activeLoras
    .filter((l) => l.lora.kind === "style")
    .reduce((sum, l) => sum + Math.abs(l.strength), 0);

  return (
    <Section
      title={
        <>
          <IconLayers size={14} />
          LoRA
        </>
      }
      help="LoRAs are small weight patches layered on top of the checkpoint. They are applied in list order; the strength is the UNet weight."
      right={
        <span className="text-[11.5px]" style={{ color: "var(--text-faint)" }}>
          {active.length} active · max 6
        </span>
      }
    >
      {active.length === 0 && (
        <p className="mb-3 text-[12.5px]" style={{ color: "var(--text-faint)" }}>
          No LoRA applied — the checkpoint renders on its own.
        </p>
      )}

      <div className="space-y-2">
        {active.map((lora) => {
          const strength = settings.loras[lora.id]?.strength ?? lora.strength.default;
          const isOpen = expanded === lora.id;
          const mismatch = checkpoint && !lora.compatibleWith.includes(checkpoint.baseModel);

          return (
            <div
              key={lora.id}
              className="rounded-lg p-2.5"
              style={{ background: "var(--sunken)", border: "1px solid var(--border)" }}
            >
              <div className="flex items-start gap-2.5">
                <Thumb colors={lora.thumb} />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5">
                    <span className="truncate text-[13px] font-medium">{lora.name}</span>
                    {lora.version && (
                      <span className="text-[11px]" style={{ color: "var(--text-faint)" }}>
                        {lora.version}
                      </span>
                    )}
                    {lora.accelerator && (
                      <Tooltip content={lora.accelerator.note} width={280}>
                        <span
                          className="inline-flex items-center gap-0.5 rounded px-1 py-px text-[10px] font-semibold"
                          style={{ background: "var(--warn-soft)", color: "var(--warn)" }}
                        >
                          <IconBolt size={9} />
                          {KIND_LABEL[lora.kind]}
                        </span>
                      </Tooltip>
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={() => setExpanded(isOpen ? null : lora.id)}
                    className="mt-0.5 inline-flex items-center gap-1 text-[11.5px]"
                    style={{ color: "var(--text-faint)" }}
                  >
                    {isOpen ? "Hide details" : "Details"}
                    <IconChevronDown
                      size={11}
                      style={{ transform: isOpen ? "rotate(180deg)" : "none", transition: "transform 120ms" }}
                    />
                  </button>
                </div>
                <button
                  type="button"
                  onClick={() => setEnabled(lora, false)}
                  aria-label={`Remove ${lora.name}`}
                  className="rounded p-1 transition-colors hover:bg-[var(--panel-hover)]"
                  style={{ color: "var(--text-faint)" }}
                >
                  <IconClose size={14} />
                </button>
              </div>

              <div className="mt-2">
                <Slider
                  label="strength"
                  value={strength}
                  min={lora.strength.min}
                  max={lora.strength.max}
                  step={0.05}
                  onChange={(v) => setStrength(lora, v)}
                  help={
                    lora.accelerator
                      ? "Accelerator LoRAs expect full strength. Lowering it reintroduces the step count you were trying to avoid."
                      : "0.6–0.8 is the usual working range for a style LoRA. Negative values invert the effect."
                  }
                />
              </div>

              {isOpen && (
                <p className="mt-2 text-[12px] leading-relaxed" style={{ color: "var(--text-muted)" }}>
                  {lora.description}
                  {lora.triggerWords.length > 0 && (
                    <>
                      {" "}
                      Trigger:{" "}
                      <code className="font-mono" style={{ color: "var(--text)" }}>
                        {lora.triggerWords.join(", ")}
                      </code>
                      .
                    </>
                  )}
                  <span className="mt-1 block" style={{ color: "var(--text-faint)" }}>
                    File: <code className="font-mono">{lora.file}</code>
                  </span>
                </p>
              )}

              {mismatch && (
                <p className="mt-1.5 text-[11.5px]" style={{ color: "var(--warn)" }}>
                  Trained for {lora.compatibleWith.join(" / ")} — results on {checkpoint!.baseModel} are
                  unpredictable.
                </p>
              )}
            </div>
          );
        })}
      </div>

      {styleWeight > 1.6 && (
        <p className="mt-2 text-[11.5px]" style={{ color: "var(--warn)" }}>
          Combined style weight {styleWeight.toFixed(2)} — above ~1.5 the checkpoint&apos;s anatomy
          usually starts breaking down.
        </p>
      )}

      {inactive.length > 0 && (
        <>
          <div className="mt-3 grid grid-cols-3 gap-2">
            {(showAll ? inactive : inactive.slice(0, 3)).map((lora) => (
              <button
                key={lora.id}
                type="button"
                onClick={() => setEnabled(lora, true)}
                className="group flex flex-col items-center gap-1.5 rounded-lg p-1.5 text-center transition-colors hover:bg-[var(--panel-hover)]"
                title={lora.description}
              >
                <Thumb colors={lora.thumb} size={56} />
                <span className="line-clamp-2 text-[11px] leading-tight" style={{ color: "var(--text-muted)" }}>
                  {lora.name}
                </span>
              </button>
            ))}
          </div>

          {inactive.length > 3 && (
            <button
              type="button"
              onClick={() => setShowAll((s) => !s)}
              className="btn btn-subtle mt-2 w-full py-2"
            >
              {showAll ? "Show fewer LoRAs" : `Show more LoRAs (${inactive.length - 3})`}
            </button>
          )}
        </>
      )}

      {derived.acceleratorNote && (
        <p
          className="mt-3 flex gap-1.5 rounded-lg p-2 text-[11.5px] leading-relaxed"
          style={{ background: "var(--warn-soft)", color: "var(--warn)" }}
        >
          <IconBolt size={13} className="mt-px shrink-0" />
          <span>
            {derived.acceleratorNote} Sampler settings are pinned to {derived.steps} steps @ CFG{" "}
            {derived.cfg}.
          </span>
        </p>
      )}
    </Section>
  );
}
