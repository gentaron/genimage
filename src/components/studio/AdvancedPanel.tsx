"use client";

import { IconDice, IconSliders } from "@/components/ui/icons";
import { Checkbox, HelpDot, Section, Slider } from "@/components/ui/primitives";
import { useStudio } from "./StudioProvider";

export function AdvancedPanel() {
  const { catalog, settings, update, derived } = useStudio();
  const checkpoint = catalog?.checkpoints.find((c) => c.id === settings.checkpointId);
  const chosenProvider =
    settings.provider === "auto"
      ? catalog?.providers.find((p) => p.available)
      : catalog?.providers.find((p) => p.id === settings.provider);

  const acceleratorPinned = Boolean(derived.acceleratorNote);

  return (
    <Section
      title={
        <>
          <IconSliders size={14} />
          Advanced
        </>
      }
      collapsible
      defaultOpen={settings.advancedOpen}
      help="Overrides. Anything left untouched follows the checkpoint's defaults — or the accelerator LoRA's, when one is active."
    >
      <div className="space-y-4">
        {/* Negative prompt */}
        <div>
          <label
            className="mb-1.5 flex items-center gap-1 text-[12px]"
            htmlFor="negative-prompt"
            style={{ color: "var(--text-muted)" }}
          >
            Negative prompt
            <HelpDot content="Left empty, the checkpoint's own negative block is used. Writing anything here replaces it entirely." />
          </label>
          <textarea
            id="negative-prompt"
            rows={3}
            spellCheck={false}
            value={settings.negativePrompt}
            onChange={(e) => update({ negativePrompt: e.target.value })}
            placeholder={checkpoint?.negativeDefault}
            className="field w-full resize-y px-2.5 py-2 text-[12.5px] leading-relaxed placeholder:text-[var(--text-faint)]"
          />
        </div>

        <Checkbox
          checked={settings.appendQualityTags}
          onChange={(v) => update({ appendQualityTags: v })}
        >
          <span style={{ color: "var(--text-muted)" }}>
            Append quality tags{" "}
            {checkpoint && (
              <code className="font-mono text-[11px]" style={{ color: "var(--text-faint)" }}>
                ({checkpoint.qualityTags.split(",")[0].trim()}…)
              </code>
            )}
          </span>
        </Checkbox>

        {/* Sampling */}
        <div className="space-y-2.5">
          <Slider
            label="steps"
            value={derived.steps}
            min={1}
            max={80}
            step={1}
            format={(v) => String(Math.round(v))}
            onChange={(v) => update({ steps: Math.round(v) })}
            help={
              acceleratorPinned
                ? "An accelerator LoRA is active; it is distilled for a fixed step count and extra steps mostly waste time."
                : "More steps refine detail with diminishing returns. Most SDXL checkpoints converge by 30."
            }
          />
          <Slider
            label="CFG"
            value={derived.cfg}
            min={0}
            max={20}
            step={0.1}
            format={(v) => v.toFixed(1)}
            onChange={(v) => update({ cfg: v })}
            help={
              acceleratorPinned
                ? "Distilled models need CFG near 1.0 — raising it burns the image."
                : "How hard the sampler is pushed toward the prompt. 4–7 suits anime checkpoints."
            }
          />
          <Slider
            label="CLIP skip"
            value={settings.clipSkip ?? checkpoint?.clipSkip ?? 2}
            min={1}
            max={4}
            step={1}
            format={(v) => String(Math.round(v))}
            onChange={(v) => update({ clipSkip: Math.round(v) })}
            help="Which text-encoder layer to read from. Anime checkpoints are almost always trained at 2."
          />
        </div>

        <div className="grid grid-cols-2 gap-2">
          <label className="text-[12px]" style={{ color: "var(--text-muted)" }}>
            Sampler
            <select
              aria-label="Sampler"
              value={derived.sampler}
              onChange={(e) => update({ sampler: e.target.value })}
              className="field mt-1 w-full px-2 py-1.5 text-[12.5px]"
            >
              {(catalog?.samplers ?? []).map((sampler) => (
                <option key={sampler} value={sampler}>
                  {sampler}
                </option>
              ))}
            </select>
          </label>
          <label className="text-[12px]" style={{ color: "var(--text-muted)" }}>
            Scheduler
            <select
              aria-label="Scheduler"
              value={derived.scheduler}
              onChange={(e) => update({ scheduler: e.target.value })}
              className="field mt-1 w-full px-2 py-1.5 text-[12.5px]"
            >
              {(catalog?.schedulers ?? []).map((scheduler) => (
                <option key={scheduler} value={scheduler}>
                  {scheduler}
                </option>
              ))}
            </select>
          </label>
        </div>

        {/* Seed */}
        <div>
          <div className="mb-1.5 flex items-center justify-between">
            <span className="flex items-center gap-1 text-[12px]" style={{ color: "var(--text-muted)" }}>
              Seed
              <HelpDot content="Locking the seed makes a run reproducible: same seed, same settings, same image. Unlocked, the server rolls a new one and records it here." />
            </span>
            <Checkbox checked={settings.lockSeed} onChange={(v) => update({ lockSeed: v })}>
              <span style={{ color: "var(--text-muted)" }}>Lock</span>
            </Checkbox>
          </div>
          <div className="flex gap-1.5">
            <input
              type="number"
              min={0}
              max={2 ** 31 - 1}
              value={settings.seed}
              disabled={!settings.lockSeed}
              onChange={(e) => update({ seed: Math.max(0, Number(e.target.value) || 0) })}
              className="field w-full px-2.5 py-1.5 font-mono text-[12.5px] disabled:opacity-50"
            />
            <button
              type="button"
              onClick={() => update({ seed: Math.floor(Math.random() * 2 ** 31), lockSeed: true })}
              aria-label="Roll a new seed"
              className="btn btn-subtle px-2.5"
            >
              <IconDice size={15} />
            </button>
          </div>
        </div>

        {/* Mode-specific */}
        {settings.mode === "edit" && (
          <Slider
            label="Variation"
            value={settings.denoise}
            min={0.1}
            max={1}
            step={0.05}
            onChange={(v) => update({ denoise: v })}
            help="How far the result may drift from the reference. 0.3 nudges, 0.8 repaints."
          />
        )}

        {settings.mode === "enhance" && (
          <Slider
            label="Upscale"
            value={settings.upscale}
            min={1}
            max={4}
            step={0.25}
            format={(v) => `${v.toFixed(2)}×`}
            onChange={(v) => update({ upscale: v })}
            help="The reference is scaled by this factor and re-denoised lightly, so the new pixels carry detail instead of interpolation."
          />
        )}

        {/* Backend */}
        <div>
          <label className="block text-[12px]" style={{ color: "var(--text-muted)" }}>
            <span className="flex items-center gap-1">
              Backend
              <HelpDot content="Auto picks the first reachable backend in preference order: ComfyUI, fal.ai, Replicate, Hugging Face, Pollinations, then the offline renderer." />
            </span>
            <select
              aria-label="Backend"
              value={settings.provider}
              onChange={(e) => update({ provider: e.target.value })}
              className="field mt-1 w-full px-2 py-1.5 text-[12.5px]"
            >
              <option value="auto">Auto</option>
              {(catalog?.providers ?? []).map((provider) => (
                <option key={provider.id} value={provider.id}>
                  {provider.label}
                  {provider.capabilities.loras ? " · LoRA" : ""}
                  {provider.pricing === "free" ? " · free" : provider.pricing === "paid" ? " · paid" : " · credits"}
                  {provider.available ? "" : " (unavailable)"}
                </option>
              ))}
            </select>
          </label>

          {chosenProvider && !chosenProvider.capabilities.loras && derived.activeLoras.length > 0 && (
            <p className="mt-1.5 text-[11.5px]" style={{ color: "var(--warn)" }}>
              {chosenProvider.label} does not load LoRA weights — only the trigger words reach the
              prompt. fal.ai, Replicate or a local ComfyUI apply the real stack.
            </p>
          )}
          {chosenProvider?.pricing === "paid" && (
            <p className="mt-1.5 text-[11.5px]" style={{ color: "var(--text-faint)" }}>
              {chosenProvider.label} bills per second of GPU time. The credit figure on the Generate
              button is an estimate of relative cost, not a quote.
            </p>
          )}
        </div>
      </div>
    </Section>
  );
}
