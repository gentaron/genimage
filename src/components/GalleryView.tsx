"use client";

import { useState, useSyncExternalStore } from "react";
import Link from "next/link";
import { IconGrid, IconSparkles } from "@/components/ui/icons";
import { Lightbox } from "@/components/studio/Lightbox";
import { ResultImage } from "@/components/studio/ResultImage";
import {
  getHistorySnapshot,
  getServerHistorySnapshot,
  subscribeHistory,
} from "@/components/studio/history-store";
import type { ImageRecord, Job } from "@/lib/types";

const PAGE_SIZE = 24;

export function GalleryView() {
  // History lives in this browser — the server keeps no job table.
  const jobs = useSyncExternalStore(
    subscribeHistory,
    getHistorySnapshot,
    getServerHistorySnapshot,
  );
  const [shown, setShown] = useState(PAGE_SIZE);
  const [viewing, setViewing] = useState<{ job: Job; image: ImageRecord } | null>(null);

  const allTiles = jobs.flatMap((job) => job.images.map((image) => ({ job, image })));
  const tiles = allTiles.slice(0, shown);

  return (
    <div className="mx-auto max-w-[1400px] px-4 py-6 sm:px-6">
      <header className="mb-6 flex items-center gap-3">
        <h1 className="flex items-center gap-2 text-[18px] font-semibold">
          <IconGrid size={18} />
          Gallery
        </h1>
        <span className="text-[12.5px]" style={{ color: "var(--text-faint)" }}>
          {allTiles.length} image{allTiles.length === 1 ? "" : "s"} from {jobs.length} run
          {jobs.length === 1 ? "" : "s"} in this browser
        </span>
        <Link href="/" className="btn btn-ghost ml-auto px-3 py-2">
          <IconSparkles size={15} />
          Back to the studio
        </Link>
      </header>

      {tiles.length === 0 ? (
        <div
          className="rounded-xl px-6 py-20 text-center"
          style={{ border: "1px dashed var(--border)" }}
        >
          <p className="text-[14px] font-medium">The gallery is empty</p>
          <p className="mt-1 text-[12.5px]" style={{ color: "var(--text-muted)" }}>
            Everything you render shows up here, with the parameters that produced it. History is
            stored in this browser, so it does not follow you to another device.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5 xl:grid-cols-6">
          {tiles.map(({ job, image }) => (
            <div
              key={image.id}
              className="group relative overflow-hidden rounded-lg"
              style={{ aspectRatio: `${image.width} / ${image.height}`, background: "var(--sunken)" }}
            >
              <ResultImage
                image={image}
                alt={job.request.prompt.slice(0, 80)}
                className="h-full w-full cursor-pointer object-cover transition-transform duration-300 group-hover:scale-[1.04]"
                onClick={() => setViewing({ job, image })}
              />
              <span
                className="pointer-events-none absolute inset-x-0 bottom-0 line-clamp-2 px-2 py-1.5 text-left text-[10.5px] opacity-0 transition-opacity group-hover:opacity-100"
                style={{ background: "linear-gradient(transparent, rgba(0,0,0,0.8))", color: "#fff" }}
              >
                {job.request.prompt}
              </span>
            </div>
          ))}
        </div>
      )}

      {tiles.length < allTiles.length && (
        <div className="mt-6 flex justify-center">
          <button
            type="button"
            onClick={() => setShown((n) => n + PAGE_SIZE)}
            className="btn btn-subtle px-4 py-2.5"
          >
            Load more
          </button>
        </div>
      )}

      {viewing && (
        <Lightbox job={viewing.job} image={viewing.image} onClose={() => setViewing(null)} />
      )}
    </div>
  );
}
