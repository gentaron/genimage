"use client";

import { useState } from "react";
import { IconRefresh, IconWarning } from "@/components/ui/icons";
import type { ImageRecord } from "@/lib/types";
import { imageSrc } from "./state";

/**
 * One result tile.
 *
 * With a URL-backed provider the render *is* the image request — the browser
 * asks the provider's CDN and waits while the GPU works. So the loading and
 * error states live here rather than in the job record, and a failed image can
 * be retried on its own without re-queuing the whole job.
 */
export function ResultImage({
  image,
  alt,
  className,
  onClick,
}: {
  image: ImageRecord;
  alt: string;
  className?: string;
  onClick?: () => void;
}) {
  // Callers key this component by image id, so a new record remounts it and
  // these start fresh without an effect.
  const [state, setState] = useState<"loading" | "loaded" | "error">("loading");
  const [attempt, setAttempt] = useState(0);

  const base = imageSrc(image);
  const src = attempt === 0 ? base : `${base}${base.includes("?") ? "&" : "?"}_retry=${attempt}`;

  return (
    <span className="absolute inset-0 block">
      {/* Deliberately not next/image: these come from arbitrary provider CDNs
          and are never optimised, so the plain element is the honest one. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        key={src}
        src={src}
        alt={alt}
        onLoad={() => setState("loaded")}
        onError={() => setState("error")}
        onClick={onClick}
        className={className ?? "h-full w-full object-cover"}
        style={{ opacity: state === "loaded" ? 1 : 0, transition: "opacity 220ms ease" }}
      />

      {state === "loading" && (
        <span className="shimmer absolute inset-0 block" aria-label="Rendering" />
      )}

      {state === "error" && (
        <span
          className="absolute inset-0 flex flex-col items-center justify-center gap-2 p-3 text-center"
          style={{ background: "var(--sunken)" }}
        >
          <IconWarning size={18} style={{ color: "var(--warn)" }} />
          <span className="text-[11.5px] leading-snug" style={{ color: "var(--text-muted)" }}>
            The backend did not return this image.
          </span>
          <button
            type="button"
            onClick={(event) => {
              event.stopPropagation();
              setState("loading");
              setAttempt((n) => n + 1);
            }}
            className="btn btn-subtle px-2 py-1 text-[11.5px]"
          >
            <IconRefresh size={12} />
            Retry
          </button>
        </span>
      )}
    </span>
  );
}
