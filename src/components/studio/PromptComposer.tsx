"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Tag } from "@/lib/tags";
import { IconSparkles, IconSpinner, IconWand } from "@/components/ui/icons";
import { Toggle, Tooltip } from "@/components/ui/primitives";
import { useStudio } from "./StudioProvider";

const PLACEHOLDER =
  '1girl, solo, cool adult woman, (brown hair), curly hair, red boots, deep blue gloves, ' +
  "tight deep blue t-shirt, superheroine, shiny skin, from front, simple background, hand on hip";

/** The comma-delimited token the caret currently sits in. */
function tokenAtCaret(text: string, caret: number): { value: string; start: number; end: number } {
  const start = text.lastIndexOf(",", caret - 1) + 1;
  const nextComma = text.indexOf(",", caret);
  const end = nextComma === -1 ? text.length : nextComma;
  return { value: text.slice(start, caret), start, end };
}

const CATEGORY_COLOR: Record<Tag["category"], string> = {
  general: "var(--text-muted)",
  quality: "var(--accent)",
  composition: "#38bdf8",
  lighting: "#f59e0b",
  style: "#f472b6",
  clothing: "#34d399",
  body: "#a78bfa",
  scene: "#60a5fa",
};

export function PromptComposer() {
  const { settings, update, generate, derived } = useStudio();
  const textarea = useRef<HTMLTextAreaElement>(null);

  const [fetched, setFetched] = useState<Tag[]>([]);
  const [dismissed, setDismissed] = useState(false);
  const [highlight, setHighlight] = useState(0);
  const [caret, setCaret] = useState(0);
  const [helperBusy, setHelperBusy] = useState(false);
  const [helperNote, setHelperNote] = useState<string | null>(null);

  const token = useMemo(() => tokenAtCaret(settings.prompt, caret), [settings.prompt, caret]);

  // --- autocomplete -------------------------------------------------------
  const query = token.value.trim();
  // Derived rather than stored, so no effect has to clear the list.
  const suggestions = settings.autocomplete && query.length > 0 && !dismissed ? fetched : [];

  useEffect(() => {
    if (!settings.autocomplete || query.length < 1) return;

    const controller = new AbortController();
    const timer = setTimeout(async () => {
      try {
        const res = await fetch(`/api/tags?q=${encodeURIComponent(query)}`, {
          signal: controller.signal,
        });
        if (!res.ok) return;
        const json = (await res.json()) as { tags: Tag[] };
        // Never suggest a tag the prompt already contains.
        const existing = new Set(settings.prompt.split(",").map((t) => t.trim().toLowerCase()));
        setFetched(json.tags.filter((t) => !existing.has(t.name)));
        setHighlight(0);
      } catch {
        /* aborted or offline — leave the previous list */
      }
    }, 120);

    return () => {
      controller.abort();
      clearTimeout(timer);
    };
  }, [query, settings.autocomplete, settings.prompt]);

  const applySuggestion = useCallback(
    (tag: Tag) => {
      const before = settings.prompt.slice(0, token.start);
      const after = settings.prompt.slice(token.end);
      const needsSpace = before.length > 0 && !before.endsWith(" ");
      const next = `${before}${needsSpace ? " " : ""}${tag.name}${after.startsWith(",") ? "" : ", "}${after}`;
      update({ prompt: next });
      setFetched([]);

      const caretTarget = before.length + (needsSpace ? 1 : 0) + tag.name.length + 2;
      requestAnimationFrame(() => {
        textarea.current?.focus();
        textarea.current?.setSelectionRange(caretTarget, caretTarget);
        setCaret(caretTarget);
      });
    },
    [settings.prompt, token, update],
  );

  const onKeyDown = (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
      event.preventDefault();
      void generate();
      return;
    }

    if (suggestions.length === 0) return;

    if (event.key === "ArrowDown") {
      event.preventDefault();
      setHighlight((h) => (h + 1) % suggestions.length);
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setHighlight((h) => (h - 1 + suggestions.length) % suggestions.length);
    } else if (event.key === "Tab" || (event.key === "Enter" && !event.shiftKey)) {
      event.preventDefault();
      applySuggestion(suggestions[highlight]);
    } else if (event.key === "Escape") {
      setDismissed(true);
    }
  };

  // --- prompt helper ------------------------------------------------------
  const runHelper = useCallback(async () => {
    const text = settings.prompt.trim();
    if (!text || helperBusy) return;
    setHelperBusy(true);
    setHelperNote(null);
    try {
      const res = await fetch("/api/prompt", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ text }),
      });
      const json = (await res.json()) as { prompt?: string; source?: string; error?: string };
      if (!res.ok || !json.prompt) {
        setHelperNote(json.error ?? "The helper could not rewrite that.");
        return;
      }
      update({ prompt: json.prompt });
      setHelperNote(
        json.source === "llm"
          ? "Rewritten by the configured language model."
          : "Rewritten with the built-in tag lexicon. Anything it did not recognise was kept verbatim.",
      );
    } catch {
      setHelperNote("The helper is unavailable right now.");
    } finally {
      setHelperBusy(false);
    }
  }, [settings.prompt, helperBusy, update]);

  const charCount = settings.prompt.length;

  return (
    <div className="relative">
      {/* toolbar */}
      <div className="mb-2 flex flex-wrap items-center justify-end gap-x-5 gap-y-2 text-[12.5px]">
        <Tooltip
          side="bottom"
          width={320}
          content={
            <>
              <strong className="block" style={{ color: "var(--text)" }}>
                Describe your vision in natural language
              </strong>
              <span style={{ color: "var(--text-muted)" }}>
                e.g. &ldquo;a girl walking on the beach at sunset&rdquo; — then press{" "}
                <em>Rewrite as tags</em> to convert it into the Danbooru-style tags this checkpoint
                was trained on.
              </span>
            </>
          }
        >
          <span
            className="mr-auto inline-flex cursor-help items-center gap-1.5"
            style={{ color: "var(--text-faint)" }}
          >
            <IconSparkles size={13} />
            How prompting works
          </span>
        </Tooltip>

        <label className="flex items-center gap-2" style={{ color: "var(--text-muted)" }}>
          Prompt Helper
          <Toggle
            checked={settings.promptHelper}
            onChange={(v) => update({ promptHelper: v })}
            label="Prompt Helper"
          />
        </label>

        <label className="flex items-center gap-2" style={{ color: "var(--text-muted)" }}>
          Autocomplete
          <Toggle
            checked={settings.autocomplete}
            onChange={(v) => update({ autocomplete: v })}
            label="Tag autocomplete"
          />
        </label>

        {settings.promptHelper && (
          <button
            type="button"
            onClick={() => void runHelper()}
            disabled={helperBusy || !settings.prompt.trim()}
            className="btn btn-subtle px-2.5 py-1.5"
          >
            {helperBusy ? <IconSpinner size={14} /> : <IconWand size={14} />}
            Rewrite as tags
          </button>
        )}
      </div>

      {/* textarea */}
      <div
        className="rounded-xl p-3 transition-colors focus-within:border-[var(--accent)]"
        style={{ background: "var(--accent-soft)", border: "1px solid var(--border)" }}
      >
        <textarea
          ref={textarea}
          value={settings.prompt}
          rows={4}
          spellCheck={false}
          placeholder={PLACEHOLDER}
          aria-label="Prompt"
          onChange={(e) => {
            update({ prompt: e.target.value });
            setCaret(e.target.selectionStart);
            setDismissed(false);
          }}
          onKeyDown={onKeyDown}
          onKeyUp={(e) => setCaret(e.currentTarget.selectionStart)}
          onClick={(e) => {
            setCaret(e.currentTarget.selectionStart);
            setDismissed(false);
          }}
          onBlur={() => window.setTimeout(() => setDismissed(true), 120)}
          className="w-full resize-y bg-transparent text-[14px] leading-relaxed outline-none placeholder:text-[var(--text-faint)]"
          style={{ minHeight: 92, color: "var(--text)" }}
        />

        <div className="mt-1 flex items-center justify-between text-[11.5px]" style={{ color: "var(--text-faint)" }}>
          <span>
            {derived.activeLoras.length > 0 && (
              <>
                Trigger words from {derived.activeLoras.length} LoRA
                {derived.activeLoras.length > 1 ? "s" : ""} are appended automatically.
              </>
            )}
          </span>
          <span className="font-mono tabular-nums">{charCount}/4000</span>
        </div>
      </div>

      {helperNote && (
        <p className="mt-2 text-[12px]" style={{ color: "var(--text-muted)" }}>
          {helperNote}
        </p>
      )}

      {/* autocomplete dropdown */}
      {suggestions.length > 0 && (
        <ul
          role="listbox"
          aria-label="Tag suggestions"
          className="absolute left-0 right-0 top-full z-40 mt-1 max-h-72 overflow-auto rounded-lg py-1 fade-up"
          style={{
            background: "var(--bg-elevated)",
            border: "1px solid var(--border-strong)",
            boxShadow: "var(--shadow-lg)",
          }}
        >
          {suggestions.map((tag, index) => (
            <li key={tag.name}>
              <button
                type="button"
                role="option"
                aria-selected={index === highlight}
                onMouseDown={(e) => e.preventDefault()}
                onMouseEnter={() => setHighlight(index)}
                onClick={() => applySuggestion(tag)}
                className="flex w-full items-center justify-between gap-3 px-3 py-1.5 text-left text-[13px]"
                style={{ background: index === highlight ? "var(--panel-hover)" : "transparent" }}
              >
                <span style={{ color: "var(--text)" }}>{tag.name}</span>
                <span
                  className="rounded px-1.5 py-0.5 text-[10.5px] uppercase tracking-wide"
                  style={{ color: CATEGORY_COLOR[tag.category], background: "var(--sunken)" }}
                >
                  {tag.category}
                </span>
              </button>
            </li>
          ))}
          <li
            className="px-3 pb-1 pt-1.5 text-[11px]"
            style={{ color: "var(--text-faint)", borderTop: "1px solid var(--border)" }}
          >
            <kbd>Tab</kbd> to insert · <kbd>↑</kbd> <kbd>↓</kbd> to move · <kbd>Esc</kbd> to dismiss
          </li>
        </ul>
      )}
    </div>
  );
}
