"use client";

import { IconPencil, IconSparkles, IconWand } from "@/components/ui/icons";
import { Tooltip } from "@/components/ui/primitives";
import type { Mode } from "@/lib/types";
import { useStudio } from "./StudioProvider";

const TABS: { id: Mode; label: string; icon: typeof IconSparkles; hint: string }[] = [
  {
    id: "generate",
    label: "Generate",
    icon: IconSparkles,
    hint: "Text to image. The prompt and the LoRA stack are the whole input.",
  },
  {
    id: "edit",
    label: "Edit",
    icon: IconPencil,
    hint: "Image to image. Keeps the reference's composition and repaints it with your prompt — the Variation slider decides how far it drifts.",
  },
  {
    id: "enhance",
    label: "Enhance",
    icon: IconWand,
    hint: "Hires fix. Upscales the reference and re-denoises it lightly so the added pixels carry real detail.",
  },
];

export function ModeTabs() {
  const { settings, update, catalog } = useStudio();
  const provider = catalog?.providers.find((p) => p.id === settings.provider);

  return (
    <nav className="flex items-end gap-1" style={{ borderBottom: "1px solid var(--border)" }}>
      {TABS.map((tab) => {
        const active = settings.mode === tab.id;
        // Only warn about an explicitly chosen provider; "auto" resolves later.
        const unsupported =
          provider &&
          ((tab.id === "edit" && !provider.capabilities.imageToImage) ||
            (tab.id === "enhance" && !provider.capabilities.upscale));

        return (
          <Tooltip
            key={tab.id}
            side="bottom"
            content={
              <>
                <strong style={{ color: "var(--text)" }}>{tab.label}</strong>
                <span className="mt-1 block" style={{ color: "var(--text-muted)" }}>
                  {tab.hint}
                </span>
                {unsupported && (
                  <span className="mt-1.5 block" style={{ color: "var(--warn)" }}>
                    {provider!.label} does not support this mode.
                  </span>
                )}
              </>
            }
          >
            <button
              type="button"
              onClick={() => update({ mode: tab.id })}
              aria-current={active ? "page" : undefined}
              className="relative flex items-center gap-2 px-3 pb-2.5 pt-1 text-[13.5px] font-medium transition-colors"
              style={{ color: active ? "var(--accent)" : "var(--text-muted)" }}
            >
              <tab.icon size={15} />
              {tab.label}
              {unsupported && (
                <span
                  className="h-1.5 w-1.5 rounded-full"
                  style={{ background: "var(--warn)" }}
                  aria-hidden
                />
              )}
              <span
                className="absolute inset-x-1 -bottom-px h-0.5 rounded-full transition-opacity"
                style={{ background: "var(--accent)", opacity: active ? 1 : 0 }}
              />
            </button>
          </Tooltip>
        );
      })}
    </nav>
  );
}
