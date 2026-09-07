"use client";

import { useState } from "react";
import Image from "next/image";
import {
  IconClose,
  IconDownload,
  IconRefresh,
  IconSparkles,
  IconSpinner,
  IconTrash,
  IconWarning,
} from "@/components/ui/icons";
import { dimensionsFor } from "@/lib/catalog";
import type { ImageRecord, Job } from "@/lib/types";
import { Lightbox } from "./Lightbox";
import { useStudio } from "./StudioProvider";

function relativeTime(timestamp: number): string {
  const seconds = Math.round((Date.now() - timestamp) / 1000);
  if (seconds < 60) return `${seconds}s ago`;
  if (seconds < 3600) return `${Math.round(seconds / 60)}m ago`;
  if (seconds < 86_400) return `${Math.round(seconds / 3600)}h ago`;
  return new Date(timestamp).toLocaleDateString();
}

const STATUS_COLOR: Record<Job["status"], string> = {
  queued: "var(--text-faint)",
  running: "var(--accent)",
  succeeded: "var(--ok)",
  failed: "var(--danger)",
  cancelled: "var(--text-faint)",
};

function JobCard({ job, onOpen }: { job: Job; onOpen: (image: ImageRecord) => void }) {
  const { remix, cancelJob, removeJob } = useStudio();
  const [width, height] = dimensionsFor(job.request.aspectRatio, job.request.resolution);
  const pending = job.status === "queued" || job.status === "running";
  const duration =
    job.finishedAt && job.startedAt ? ((job.finishedAt - job.startedAt) / 1000).toFixed(1) : null;

  return (
    <article className="fade-up">
      <header className="mb-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[12px]">
        <span className="inline-flex items-center gap-1.5" style={{ color: STATUS_COLOR[job.status] }}>
          {pending ? <IconSpinner size={12} /> : <span className="h-1.5 w-1.5 rounded-full" style={{ background: "currentColor" }} />}
          {job.status}
        </span>
        <span style={{ color: "var(--text-faint)" }}>
          {job.provider} · {width}×{height} · seed {job.request.seed}
          {duration && ` · ${duration}s`}
        </span>
        <span style={{ color: "var(--text-faint)" }}>{relativeTime(job.queuedAt)}</span>

        <div className="ml-auto flex items-center gap-1">
          <button
            type="button"
            onClick={() => remix(job)}
            className="btn btn-ghost px-2 py-1"
            title="Load these settings back into the composer"
          >
            <IconRefresh size={13} />
            Remix
          </button>
          {pending ? (
            <button
              type="button"
              onClick={() => void cancelJob(job.id)}
              className="btn btn-ghost px-2 py-1"
              title="Cancel"
            >
              <IconClose size={13} />
            </button>
          ) : (
            <button
              type="button"
              onClick={() => void removeJob(job.id)}
              className="btn btn-ghost px-2 py-1"
              title="Delete this run and its images"
            >
              <IconTrash size={13} />
            </button>
          )}
        </div>
      </header>

      <p
        className="mb-2 line-clamp-2 text-[12.5px] leading-relaxed"
        style={{ color: "var(--text-muted)" }}
        title={job.request.finalPrompt}
      >
        {job.request.prompt}
      </p>

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
        {job.images.map((image) => (
          <div
            key={image.id}
            className="group relative overflow-hidden rounded-lg"
            style={{ aspectRatio: `${image.width} / ${image.height}`, background: "var(--sunken)" }}
          >
            <button
              type="button"
              onClick={() => onOpen(image)}
              className="absolute inset-0 h-full w-full"
              aria-label={`Open image, seed ${image.seed}`}
            >
              <Image
                src={`/api/images/${image.id}`}
                alt={`${job.request.prompt.slice(0, 80)} — seed ${image.seed}`}
                fill
                unoptimized
                sizes="(max-width: 640px) 50vw, 25vw"
                className="object-cover transition-transform duration-300 group-hover:scale-[1.03]"
              />
            </button>
            {/* Sits above the button, so the link is not nested inside it. */}
            <span
              className="pointer-events-none absolute inset-x-0 bottom-0 flex items-center justify-between px-2 py-1.5 text-[10.5px] opacity-0 transition-opacity group-hover:opacity-100"
              style={{ background: "linear-gradient(transparent, rgba(0,0,0,0.75))", color: "#fff" }}
            >
              <span className="font-mono">{image.seed}</span>
              <a
                href={`/api/images/${image.id}?download`}
                download
                className="pointer-events-auto rounded p-0.5 hover:bg-white/20"
                aria-label="Download"
              >
                <IconDownload size={13} />
              </a>
            </span>
          </div>
        ))}

        {pending &&
          Array.from({ length: Math.max(0, job.request.batchSize - job.images.length) }).map((_, index) => (
            <div
              key={`placeholder-${index}`}
              className="shimmer relative overflow-hidden rounded-lg"
              style={{ aspectRatio: `${width} / ${height}` }}
            >
              <span
                className="absolute inset-x-0 bottom-0 h-0.5 origin-left transition-transform duration-500"
                style={{
                  background: "var(--accent)",
                  transform: `scaleX(${Math.max(0.02, job.progress)})`,
                }}
              />
            </div>
          ))}
      </div>

      {job.error && (
        <p
          className="mt-2 flex items-start gap-2 rounded-lg p-2.5 text-[12.5px]"
          style={{ background: "var(--danger-soft)", color: "var(--danger)" }}
        >
          <IconWarning size={14} className="mt-px shrink-0" />
          {job.error}
        </p>
      )}

      {job.warnings.length > 0 && (
        <ul className="mt-2 space-y-1">
          {job.warnings.map((warning, index) => (
            <li
              key={index}
              className="flex items-start gap-2 text-[11.5px]"
              style={{ color: "var(--warn)" }}
            >
              <IconWarning size={12} className="mt-0.5 shrink-0" />
              {warning}
            </li>
          ))}
        </ul>
      )}
    </article>
  );
}

export function Results() {
  const { jobs, remix } = useStudio();
  const [viewing, setViewing] = useState<{ job: Job; image: ImageRecord } | null>(null);

  if (jobs.length === 0) {
    return (
      <div
        className="flex flex-col items-center justify-center rounded-xl px-6 py-16 text-center"
        style={{ border: "1px dashed var(--border)" }}
      >
        <IconSparkles size={28} style={{ color: "var(--text-faint)" }} />
        <p className="mt-3 text-[14px] font-medium">Nothing rendered yet</p>
        <p className="mt-1 max-w-md text-[12.5px]" style={{ color: "var(--text-muted)" }}>
          Describe what you want above, or paste a tag prompt. The LoRA stack on the right is applied
          on top of the checkpoint, in order.
        </p>
      </div>
    );
  }

  return (
    <>
      <div className="space-y-8">
        {jobs.map((job) => (
          <JobCard key={job.id} job={job} onOpen={(image) => setViewing({ job, image })} />
        ))}
      </div>

      {viewing && (
        <Lightbox
          job={viewing.job}
          image={viewing.image}
          onClose={() => setViewing(null)}
          onRemix={() => {
            remix(viewing.job);
            setViewing(null);
          }}
        />
      )}
    </>
  );
}
