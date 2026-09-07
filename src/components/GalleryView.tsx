"use client";

import { useCallback, useEffect, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { IconGrid, IconSparkles, IconSpinner } from "@/components/ui/icons";
import { Lightbox } from "@/components/studio/Lightbox";
import type { ImageRecord, Job } from "@/lib/types";

const PAGE_SIZE = 24;

export function GalleryView() {
  const [jobs, setJobs] = useState<Job[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [viewing, setViewing] = useState<{ job: Job; image: ImageRecord } | null>(null);

  // Starts with the request, so the mount effect never sets state synchronously.
  const loadPage = useCallback(async (offset: number) => {
    try {
      const res = await fetch(`/api/jobs?limit=${PAGE_SIZE}&offset=${offset}`);
      if (!res.ok) return;
      const json = (await res.json()) as { jobs: Job[]; total: number };
      setJobs((prev) => (offset === 0 ? json.jobs : [...prev, ...json.jobs]));
      setTotal(json.total);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadPage(0);
  }, [loadPage]);

  const tiles = jobs.flatMap((job) => job.images.map((image) => ({ job, image })));

  return (
    <div className="mx-auto max-w-[1400px] px-4 py-6 sm:px-6">
      <header className="mb-6 flex items-center gap-3">
        <h1 className="flex items-center gap-2 text-[18px] font-semibold">
          <IconGrid size={18} />
          Gallery
        </h1>
        <span className="text-[12.5px]" style={{ color: "var(--text-faint)" }}>
          {tiles.length} image{tiles.length === 1 ? "" : "s"} from {total} run
          {total === 1 ? "" : "s"}
        </span>
        <Link href="/" className="btn btn-ghost ml-auto px-3 py-2">
          <IconSparkles size={15} />
          Back to the studio
        </Link>
      </header>

      {tiles.length === 0 && !loading ? (
        <div
          className="rounded-xl px-6 py-20 text-center"
          style={{ border: "1px dashed var(--border)" }}
        >
          <p className="text-[14px] font-medium">The gallery is empty</p>
          <p className="mt-1 text-[12.5px]" style={{ color: "var(--text-muted)" }}>
            Everything you render shows up here, with the parameters that produced it.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5 xl:grid-cols-6">
          {tiles.map(({ job, image }) => (
            <button
              key={image.id}
              type="button"
              onClick={() => setViewing({ job, image })}
              className="group relative overflow-hidden rounded-lg"
              style={{ aspectRatio: `${image.width} / ${image.height}`, background: "var(--sunken)" }}
            >
              <Image
                src={`/api/images/${image.id}`}
                alt={job.request.prompt.slice(0, 80)}
                fill
                unoptimized
                sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 16vw"
                className="object-cover transition-transform duration-300 group-hover:scale-[1.04]"
              />
              <span
                className="absolute inset-x-0 bottom-0 line-clamp-2 px-2 py-1.5 text-left text-[10.5px] opacity-0 transition-opacity group-hover:opacity-100"
                style={{ background: "linear-gradient(transparent, rgba(0,0,0,0.8))", color: "#fff" }}
              >
                {job.request.prompt}
              </span>
            </button>
          ))}
        </div>
      )}

      {jobs.length < total && (
        <div className="mt-6 flex justify-center">
          <button
            type="button"
            onClick={() => {
              setLoading(true);
              void loadPage(jobs.length);
            }}
            disabled={loading}
            className="btn btn-subtle px-4 py-2.5"
          >
            {loading && <IconSpinner size={14} />}
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
