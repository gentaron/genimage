"use client";

import { useEffect, useId, useRef, useState } from "react";
import { IconHelp } from "./icons";

/* ------------------------------------------------------------------ */
/* Toggle                                                              */
/* ------------------------------------------------------------------ */

export function Toggle({
  checked,
  onChange,
  label,
  disabled,
}: {
  checked: boolean;
  onChange: (next: boolean) => void;
  label: string;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className="relative h-[18px] w-8 shrink-0 rounded-full transition-colors disabled:opacity-40"
      style={{ background: checked ? "var(--accent)" : "var(--border-strong)" }}
    >
      <span
        className="absolute top-[2px] h-[14px] w-[14px] rounded-full bg-white transition-transform"
        style={{ left: 2, transform: checked ? "translateX(14px)" : "none" }}
      />
    </button>
  );
}

/* ------------------------------------------------------------------ */
/* Checkbox                                                            */
/* ------------------------------------------------------------------ */

export function Checkbox({
  checked,
  onChange,
  children,
  disabled,
}: {
  checked: boolean;
  onChange: (next: boolean) => void;
  children: React.ReactNode;
  disabled?: boolean;
}) {
  return (
    <label
      className={`inline-flex cursor-pointer items-center gap-2 text-[13px] select-none ${
        disabled ? "opacity-40" : ""
      }`}
    >
      <input
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={(e) => onChange(e.target.checked)}
        className="h-[15px] w-[15px] cursor-pointer rounded-[4px] border accent-[var(--accent)]"
        style={{ accentColor: "var(--accent)" }}
      />
      {children}
    </label>
  );
}

/* ------------------------------------------------------------------ */
/* Tooltip                                                             */
/* ------------------------------------------------------------------ */

/**
 * Hover/focus tooltip. Positioned with a fixed-position portal-free layer so it
 * escapes the sidebar's `overflow: auto` without needing a portal.
 */
export function Tooltip({
  content,
  children,
  side = "top",
  width = 260,
}: {
  content: React.ReactNode;
  children: React.ReactNode;
  side?: "top" | "bottom" | "left";
  width?: number;
}) {
  const [open, setOpen] = useState(false);
  const [coords, setCoords] = useState({ top: 0, left: 0 });
  const anchor = useRef<HTMLSpanElement>(null);
  const id = useId();

  useEffect(() => {
    if (!open || !anchor.current) return;
    const rect = anchor.current.getBoundingClientRect();
    const margin = 8;
    let left = rect.left + rect.width / 2 - width / 2;
    let top = side === "bottom" ? rect.bottom + margin : rect.top - margin;
    if (side === "left") {
      left = rect.left - width - margin;
      top = rect.top;
    }
    left = Math.max(12, Math.min(left, window.innerWidth - width - 12));
    if (side === "top") top = Math.max(12, top);
    setCoords({ top, left });
  }, [open, side, width]);

  return (
    <>
      <span
        ref={anchor}
        aria-describedby={open ? id : undefined}
        onMouseEnter={() => setOpen(true)}
        onMouseLeave={() => setOpen(false)}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
        className="inline-flex"
      >
        {children}
      </span>
      {open && (
        <span
          id={id}
          role="tooltip"
          className="pointer-events-none fixed z-[80] rounded-lg px-3 py-2 text-[12.5px] leading-relaxed fade-up"
          style={{
            top: coords.top,
            left: coords.left,
            width,
            transform: side === "top" ? "translateY(-100%)" : undefined,
            background: "var(--bg-elevated)",
            color: "var(--text)",
            border: "1px solid var(--border-strong)",
            boxShadow: "var(--shadow-md)",
          }}
        >
          {content}
        </span>
      )}
    </>
  );
}

export function HelpDot({ content }: { content: React.ReactNode }) {
  return (
    <Tooltip content={content}>
      <button
        type="button"
        aria-label="More information"
        className="inline-flex items-center justify-center rounded-full transition-colors"
        style={{ color: "var(--text-faint)" }}
      >
        <IconHelp size={13} />
      </button>
    </Tooltip>
  );
}

/* ------------------------------------------------------------------ */
/* Labelled slider                                                     */
/* ------------------------------------------------------------------ */

export function Slider({
  label,
  value,
  min,
  max,
  step = 0.05,
  onChange,
  format = (v: number) => v.toFixed(2),
  help,
}: {
  label: React.ReactNode;
  value: number;
  min: number;
  max: number;
  step?: number;
  onChange: (next: number) => void;
  format?: (value: number) => string;
  help?: React.ReactNode;
}) {
  return (
    <div className="flex items-center gap-3">
      <span className="flex min-w-0 items-center gap-1 text-[12px]" style={{ color: "var(--text-muted)" }}>
        <span className="truncate">{label}</span>
        {help && <HelpDot content={help} />}
      </span>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        aria-label={typeof label === "string" ? label : undefined}
        onChange={(e) => onChange(Number(e.target.value))}
        className="min-w-0 flex-1"
      />
      <output
        className="w-11 shrink-0 text-right font-mono text-[12px] tabular-nums"
        style={{ color: "var(--text)" }}
      >
        {format(value)}
      </output>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Collapsible section                                                 */
/* ------------------------------------------------------------------ */

export function Section({
  title,
  help,
  right,
  children,
  defaultOpen = true,
  collapsible = false,
}: {
  title: React.ReactNode;
  help?: React.ReactNode;
  right?: React.ReactNode;
  children: React.ReactNode;
  defaultOpen?: boolean;
  collapsible?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const isOpen = collapsible ? open : true;

  return (
    <section className="px-4 py-4" style={{ borderBottom: "1px solid var(--border)" }}>
      <header className="mb-3 flex items-center justify-between gap-2">
        {/* The help affordance is a sibling, never a nested button. */}
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            disabled={!collapsible}
            onClick={() => setOpen((o) => !o)}
            className="section-label disabled:cursor-default"
          >
            {title}
          </button>
          {help && <HelpDot content={help} />}
        </div>
        {right}
      </header>
      {isOpen && children}
    </section>
  );
}
