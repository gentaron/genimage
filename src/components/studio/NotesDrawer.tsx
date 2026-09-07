"use client";

import { useEffect } from "react";
import { IconClose } from "@/components/ui/icons";
import { useStudio } from "./StudioProvider";

/**
 * Operator notes. Everything needed to move from the free fallback backends to
 * a real local ComfyUI run, including the exact filenames the catalog expects.
 */
export function NotesDrawer({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { catalog } = useStudio();

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[70] flex justify-end">
      <div
        className="absolute inset-0"
        style={{ background: "rgba(0,0,0,0.5)" }}
        onClick={onClose}
        aria-hidden
      />
      <aside
        role="dialog"
        aria-modal="true"
        aria-label="Notes"
        className="relative flex w-[min(520px,100vw)] flex-col fade-up"
        style={{ background: "var(--bg-elevated)", borderLeft: "1px solid var(--border-strong)" }}
      >
        <header
          className="flex items-center justify-between px-5 py-4"
          style={{ borderBottom: "1px solid var(--border)" }}
        >
          <h2 className="text-[15px] font-semibold">Notes</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="btn btn-ghost p-1.5"
          >
            <IconClose size={16} />
          </button>
        </header>

        <div className="flex-1 space-y-6 overflow-auto px-5 py-5 text-[13px] leading-relaxed">
          <section>
            <h3 className="mb-1.5 text-[13.5px] font-semibold">Backends</h3>
            <p style={{ color: "var(--text-muted)" }}>
              The studio uses whichever backend is reachable. The thing worth knowing up front:{" "}
              <strong style={{ color: "var(--text)" }}>
                free and LoRA-capable do not overlap in the cloud
              </strong>
              . Free hosted models run their own weights, so your LoRA stack contributes only its
              trigger words. Applying the real weights means either your own GPU or a paid hosted
              one.
            </p>
            <ul className="mt-2 space-y-1.5">
              {(catalog?.providers ?? []).map((provider) => (
                <li key={provider.id} className="flex items-start gap-2">
                  <span
                    className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full"
                    style={{ background: provider.available ? "var(--ok)" : "var(--text-faint)" }}
                    aria-hidden
                  />
                  <span>
                    <strong>{provider.label}</strong>
                    <span style={{ color: "var(--text-faint)" }}> — {provider.detail}</span>
                    <span className="mt-0.5 block text-[12px]">
                      <span
                        style={{ color: provider.capabilities.loras ? "var(--ok)" : "var(--warn)" }}
                      >
                        {provider.capabilities.loras ? "applies LoRA weights" : "no LoRA weights"}
                      </span>
                      <span style={{ color: "var(--text-faint)" }}>
                        {" · "}
                        {provider.pricing === "free"
                          ? "free"
                          : provider.pricing === "credits"
                            ? "free credit, then paid"
                            : "paid per second"}
                        {provider.selfHosted ? " · needs your own GPU" : ""}
                      </span>
                    </span>
                  </span>
                </li>
              ))}
            </ul>
          </section>

          <section>
            <h3 className="mb-1.5 text-[13.5px] font-semibold">LoRAs in the cloud</h3>
            <p style={{ color: "var(--text-muted)" }}>
              fal.ai and Replicate load LoRAs over HTTP, so each one needs a public URL to its{" "}
              <code className="font-mono">.safetensors</code> file. Point{" "}
              <code className="font-mono">GENIMAGE_WEIGHTS</code> at your own copies:
            </p>
            <pre
              className="mt-2 overflow-x-auto rounded-lg p-2.5 font-mono text-[11px]"
              style={{ background: "var(--sunken)", border: "1px solid var(--border)" }}
            >
{`GENIMAGE_WEIGHTS={"shexyo-v3":"https://…/shexyo_v3.safetensors"}`}
            </pre>
            <p className="mt-2" style={{ color: "var(--text-muted)" }}>
              A LoRA with no URL is skipped and the job says so, rather than quietly rendering
              without it.
            </p>
          </section>

          <section>
            <h3 className="mb-1.5 text-[13.5px] font-semibold">Running it free, on your own GPU</h3>
            <ol className="list-decimal space-y-1.5 pl-5" style={{ color: "var(--text-muted)" }}>
              <li>
                Start ComfyUI: <code className="font-mono">python main.py --listen 127.0.0.1 --port 8188</code>
              </li>
              <li>
                Point the studio at it: <code className="font-mono">COMFYUI_URL=http://127.0.0.1:8188</code> in{" "}
                <code className="font-mono">.env.local</code>
              </li>
              <li>Drop the checkpoint and LoRA files into ComfyUI using the exact names below.</li>
              <li>Reload — the backend pill in the header turns green.</li>
            </ol>
          </section>

          <section>
            <h3 className="mb-1.5 text-[13.5px] font-semibold">Expected filenames</h3>
            <p className="mb-2" style={{ color: "var(--text-muted)" }}>
              Rename your downloads to match, or edit <code className="font-mono">src/lib/catalog.ts</code>.
            </p>
            <div className="space-y-2">
              <div>
                <p className="text-[11px] uppercase tracking-wider" style={{ color: "var(--text-faint)" }}>
                  models/checkpoints
                </p>
                {(catalog?.checkpoints ?? []).map((checkpoint) => (
                  <p key={checkpoint.id} className="font-mono text-[11.5px]">
                    {checkpoint.file}
                  </p>
                ))}
              </div>
              <div>
                <p className="text-[11px] uppercase tracking-wider" style={{ color: "var(--text-faint)" }}>
                  models/loras
                </p>
                {(catalog?.loras ?? []).map((lora) => (
                  <p key={lora.id} className="font-mono text-[11.5px]">
                    {lora.file}
                  </p>
                ))}
              </div>
            </div>
          </section>

          <section>
            <h3 className="mb-1.5 text-[13.5px] font-semibold">Prompting this checkpoint family</h3>
            <ul className="list-disc space-y-1.5 pl-5" style={{ color: "var(--text-muted)" }}>
              <li>Comma-separated Danbooru tags, most important first.</li>
              <li>
                <code className="font-mono">(tag:1.2)</code> raises a tag&apos;s weight,{" "}
                <code className="font-mono">(tag:0.8)</code> lowers it.
              </li>
              <li>Quality tags go last — the Advanced panel appends them for you.</li>
              <li>Illustrious wants CLIP skip 2. SDXL and FLUX want 1.</li>
            </ul>
          </section>

          <section>
            <h3 className="mb-1.5 text-[13.5px] font-semibold">Where things are stored</h3>
            <p style={{ color: "var(--text-muted)" }}>
              Job history lives in this browser, not on the server — it will not follow you to
              another device, and clearing site data clears it. Images either sit on the backend&apos;s
              own CDN or, when a backend hands back raw bytes, in this deployment&apos;s blob storage.
            </p>
          </section>

          <section>
            <h3 className="mb-1.5 text-[13.5px] font-semibold">Shortcuts</h3>
            <ul className="space-y-1" style={{ color: "var(--text-muted)" }}>
              <li>
                <kbd>Ctrl</kbd>/<kbd>⌘</kbd> + <kbd>Enter</kbd> — generate
              </li>
              <li>
                <kbd>Tab</kbd> — accept the highlighted tag suggestion
              </li>
              <li>
                <kbd>Esc</kbd> — dismiss suggestions, close this panel and the lightbox
              </li>
            </ul>
          </section>

          <section>
            <h3 className="mb-1.5 text-[13.5px] font-semibold">Content policy</h3>
            <p style={{ color: "var(--text-muted)" }}>
              Prompts that combine a minor descriptor with sexual content are rejected on the server
              and cannot be turned off. Set <code className="font-mono">GENIMAGE_SFW_ONLY=1</code> to
              additionally block all explicit content on a shared instance.
            </p>
          </section>
        </div>
      </aside>
    </div>
  );
}
