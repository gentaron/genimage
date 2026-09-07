"use client";

import { useRef, useState } from "react";
import Image from "next/image";
import { IconClose, IconImage, IconPlus } from "@/components/ui/icons";
import { Section } from "@/components/ui/primitives";
import { useStudio } from "./StudioProvider";

export function ReferencePanel() {
  const { reference, setReference, settings } = useStudio();
  const input = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);

  const required = settings.mode !== "generate";

  const accept = (files: FileList | null) => {
    const file = files?.[0];
    if (file) void setReference(file);
  };

  return (
    <Section
      title={
        <>
          <IconImage size={14} />
          Reference Image
        </>
      }
      help="Used by Edit and Enhance. In Generate mode it is ignored — switch tabs to put it to work."
      right={
        <span className="text-[11.5px]" style={{ color: "var(--text-faint)" }}>
          {reference ? "1/1" : "0/1"}
        </span>
      }
    >
      <input
        ref={input}
        type="file"
        accept="image/png,image/jpeg,image/webp"
        className="hidden"
        onChange={(e) => {
          accept(e.target.files);
          e.target.value = "";
        }}
      />

      {reference ? (
        <div className="relative w-fit">
          {/* Object URL of a local file — Next's optimizer cannot process it. */}
          <Image
            src={reference.preview}
            alt={reference.name}
            width={96}
            height={96}
            unoptimized
            className="h-24 w-24 rounded-lg object-cover"
            style={{ border: "1px solid var(--border)" }}
          />
          <button
            type="button"
            onClick={() => void setReference(null)}
            aria-label="Remove the reference image"
            className="absolute -right-2 -top-2 rounded-full p-1 transition-colors"
            style={{
              background: "var(--bg-elevated)",
              border: "1px solid var(--border-strong)",
              color: "var(--text-muted)",
            }}
          >
            <IconClose size={12} />
          </button>
          <p className="mt-1.5 max-w-24 truncate text-[11px]" style={{ color: "var(--text-faint)" }}>
            {reference.name}
          </p>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => input.current?.click()}
          onDragOver={(e) => {
            e.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragging(false);
            accept(e.dataTransfer.files);
          }}
          className="flex h-24 w-24 items-center justify-center rounded-lg transition-colors"
          style={{
            border: `1px dashed ${dragging || required ? "var(--accent)" : "var(--border-strong)"}`,
            background: dragging ? "var(--accent-soft)" : "transparent",
            color: "var(--text-faint)",
          }}
        >
          <IconPlus size={20} />
        </button>
      )}

      <p className="mt-2 text-[11.5px]" style={{ color: "var(--text-faint)" }}>
        PNG, JPEG or WebP, up to 12 MB. Drop a file anywhere on the box.
      </p>
    </Section>
  );
}
