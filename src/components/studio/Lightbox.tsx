"use client";

import { useEffect } from "react";
import Image from "next/image";
import { IconClose, IconDownload, IconRefresh } from "@/components/ui/icons";
import type { ImageRecord, Job } from "@/lib/types";

const CHROME_BUTTON: React.CSSProperties = {
  background: "rgba(255,255,255,0.08)",
  border: "1px solid rgba(255,255,255,0.14)",
  color: "#ececf1",
};

/** Full-bleed viewer with the exact parameters that produced the image. */
export function Lightbox({
  job,
  image,
  onClose,
  onRemix,
}: {
  job: Job;
  image: ImageRecord;
  onClose: () => void;
  onRemix?: () => void;
}) {
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  const rows: [string, string][] = [
    ["Prompt", job.request.finalPrompt],
    ["Negative", job.request.finalNegativePrompt || "—"],
    ["Model", job.request.checkpointId],
    [
      "LoRAs",
      job.request.loras.length > 0
        ? job.request.loras.map((l) => `${l.id} @ ${l.strength.toFixed(2)}`).join(", ")
        : "none",
    ],
    ["Size", `${image.width}×${image.height}`],
    ["Seed", String(image.seed)],
    ["Steps / CFG", `${job.request.steps} / ${job.request.cfg}`],
    ["Sampler", `${job.request.sampler} · ${job.request.scheduler}`],
    ["Backend", job.provider],
  ];

  return (
    <div
      className="fixed inset-0 z-[75] flex flex-col"
      // A media viewer reads better as dark chrome in both themes, so these
      // colours are deliberately literal rather than theme tokens.
      style={{ background: "rgba(8,8,12,0.97)", backdropFilter: "blur(10px)", color: "#ececf1" }}
      role="dialog"
      aria-modal="true"
      aria-label="Image detail"
    >
      <header className="flex shrink-0 items-center gap-2 px-4 py-3">
        <span className="font-mono text-[12px]" style={{ color: "rgba(236,236,241,0.6)" }}>
          seed {image.seed} · {image.width}×{image.height}
        </span>
        <div className="ml-auto flex items-center gap-1.5">
          {onRemix && (
            <button type="button" onClick={onRemix} className="btn px-3 py-2" style={CHROME_BUTTON}>
              <IconRefresh size={14} />
              Remix
            </button>
          )}
          <a
            href={`/api/images/${image.id}?download`}
            download
            className="btn px-3 py-2"
            style={CHROME_BUTTON}
          >
            <IconDownload size={14} />
            Download
          </a>
          <button type="button" onClick={onClose} aria-label="Close" className="btn p-2" style={CHROME_BUTTON}>
            <IconClose size={16} />
          </button>
        </div>
      </header>

      <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-auto px-4 pb-4 lg:flex-row">
        <div className="flex min-h-0 flex-1 items-center justify-center" onClick={onClose}>
          <Image
            src={`/api/images/${image.id}`}
            alt={job.request.prompt.slice(0, 120)}
            width={image.width}
            height={image.height}
            unoptimized
            className="max-h-full w-auto max-w-full rounded-lg object-contain"
            onClick={(e) => e.stopPropagation()}
          />
        </div>

        <dl
          className="w-full shrink-0 space-y-2.5 self-start rounded-xl p-4 text-[12.5px] lg:w-[340px]"
          style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)" }}
        >
          {rows.map(([label, value]) => (
            <div key={label}>
              <dt className="text-[11px] uppercase tracking-wider" style={{ color: "rgba(236,236,241,0.5)" }}>
                {label}
              </dt>
              <dd className="mt-0.5 break-words" style={{ color: "#ececf1" }}>
                {value}
              </dd>
            </div>
          ))}
        </dl>
      </div>
    </div>
  );
}
