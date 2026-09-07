"use client";

import { IconImage, IconSquare } from "@/components/ui/icons";
import { Section } from "@/components/ui/primitives";
import { dimensionsFor } from "@/lib/catalog";
import { useStudio } from "./StudioProvider";

const BATCH_OPTIONS = [1, 2, 4, 8];

/** Little proportional rectangle used as the ratio button's glyph. */
function RatioGlyph({ w, h }: { w: number; h: number }) {
  const scale = 18 / Math.max(w, h);
  return (
    <span
      className="block rounded-[3px]"
      style={{
        width: Math.max(6, w * scale),
        height: Math.max(6, h * scale),
        border: "1.5px solid currentColor",
      }}
      aria-hidden
    />
  );
}

export function CanvasPanel() {
  const { catalog, settings, update, derived } = useStudio();
  const ratios = catalog?.aspectRatios ?? [];

  return (
    <>
      <Section
        title={
          <>
            <IconSquare size={14} />
            Aspect Ratio
          </>
        }
        help="SDXL was trained on ~1 megapixel buckets. These presets stay inside those buckets, which is why they look sharper than an arbitrary crop."
      >
        <div className="grid grid-cols-6 gap-1.5">
          {ratios.map((ratio) => {
            const active = ratio.id === settings.aspectRatio;
            return (
              <button
                key={ratio.id}
                type="button"
                onClick={() => update({ aspectRatio: ratio.id })}
                aria-pressed={active}
                className="flex h-[52px] flex-col items-center justify-center gap-1 rounded-lg transition-colors"
                style={{
                  border: `1px solid ${active ? "var(--accent)" : "var(--border)"}`,
                  background: active ? "var(--accent-soft)" : "transparent",
                  color: active ? "var(--accent)" : "var(--text-muted)",
                }}
              >
                <RatioGlyph w={ratio.w} h={ratio.h} />
                <span className="text-[10px]">{ratio.label}</span>
              </button>
            );
          })}
        </div>
      </Section>

      <Section
        title="Resolution"
        help="M sits in SDXL's native training range. L renders larger but drifts further from what the model saw, so composition can wander."
      >
        <div className="grid grid-cols-2 gap-2">
          {(["M", "L"] as const).map((tier) => {
            const [w, h] = dimensionsFor(settings.aspectRatio, tier);
            const active = settings.resolution === tier;
            return (
              <button
                key={tier}
                type="button"
                onClick={() => update({ resolution: tier })}
                aria-pressed={active}
                className="rounded-lg py-2.5 transition-colors"
                style={{
                  border: `1px solid ${active ? "var(--accent)" : "var(--border)"}`,
                  background: active ? "var(--accent-soft)" : "transparent",
                }}
              >
                <span
                  className="block text-[13px] font-semibold"
                  style={{ color: active ? "var(--accent)" : "var(--text)" }}
                >
                  {tier}
                </span>
                <span className="block font-mono text-[11px]" style={{ color: "var(--text-faint)" }}>
                  {w}×{h}
                </span>
              </button>
            );
          })}
        </div>
      </Section>

      <Section
        title={
          <>
            <IconImage size={14} />
            Number of images
          </>
        }
        help="Rendered as one batch. Each image gets a consecutive seed, so a batch of four is four neighbouring points in the same latent space."
      >
        <div
          className="grid grid-cols-4 gap-1 rounded-lg p-1"
          style={{ background: "var(--sunken)", border: "1px solid var(--border)" }}
        >
          {BATCH_OPTIONS.map((count) => {
            const active = settings.batchSize === count;
            return (
              <button
                key={count}
                type="button"
                onClick={() => update({ batchSize: count })}
                aria-pressed={active}
                className="rounded-md py-1.5 text-[12.5px] font-medium transition-colors"
                style={{
                  background: active ? "var(--accent)" : "transparent",
                  color: active ? "var(--accent-text)" : "var(--text-muted)",
                }}
              >
                {count === 1 ? "Single" : `×${count}`}
              </button>
            );
          })}
        </div>
        <p className="mt-2 text-[11.5px]" style={{ color: "var(--text-faint)" }}>
          {derived.width}×{derived.height} · {derived.steps} steps · CFG {derived.cfg} ·{" "}
          {derived.sampler}
        </p>
      </Section>
    </>
  );
}
