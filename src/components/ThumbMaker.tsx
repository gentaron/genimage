"use client";

import { useEffect, useRef, useState } from "react";
import { LIMITS, sanitizeCopy, type ThumbCopy } from "@/lib/copy";
import { extractLocal, keywords, reaction } from "@/lib/extract";
import { H, THEMES, W, loadFonts, renderThumbnail, warmFonts, type ThemeId } from "@/lib/render";
import InstallButton from "./InstallButton";

type AiId = "gemini" | "pollinations";
type Choice = "auto" | AiId | "local";
type Source = AiId | "local" | null;

// Kept here rather than imported from lib/ai, which is server-only.
const LABEL: Record<AiId | "local", string> = {
  gemini: "Gemini(無料枠)",
  pollinations: "Pollinations(無料)",
  local: "AIなし",
};

const EMPTY: ThumbCopy = { main: "", sub: "", tags: [], comment: "" };

const SAMPLE = `【保存版】Notion AIで習慣化を自動化する方法
毎朝のジャーナリングが続かない人へ。Notion AIのテンプレートとリマインダーを組み合わせると、習慣化はほぼ自動になる。
ポイントは3つ。記録のハードルを下げること、振り返りをAIに任せること、そして小さな達成を見える化すること。`;

function slug(s: string) {
  return (
    s
      .replace(/\s+/g, "")
      .replace(/[\\/:*?"<>|]/g, "")
      .slice(0, 40) || "thumbnail"
  );
}

const chip =
  "min-h-9 rounded-lg border border-[var(--border)] px-3 text-xs text-[var(--muted)] active:bg-white/10";

export default function ThumbMaker() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [preview, setPreview] = useState("");
  const [text, setText] = useState("");
  const [copy, setCopy] = useState<ThumbCopy>(EMPTY);
  const [tagInput, setTagInput] = useState("");
  const [theme, setTheme] = useState<ThemeId>("caution");
  const [seed, setSeed] = useState(1);
  const [busy, setBusy] = useState(false);
  const [source, setSource] = useState<Source>(null);
  const [note, setNote] = useState("");
  const [choice, setChoice] = useState<Choice>("auto");
  const [providers, setProviders] = useState<AiId[]>([]);
  const [editOpen, setEditOpen] = useState(false);

  useEffect(() => {
    fetch("/api/analyze")
      .then((r) => r.json())
      .then((d: { providers?: AiId[] }) => setProviders(d.providers ?? []))
      .catch(() => setProviders([]));
    if (process.env.NODE_ENV === "production" && "serviceWorker" in navigator) {
      navigator.serviceWorker
        .register("/sw.js", { scope: "/", updateViaCache: "none" })
        .then(() => navigator.serviceWorker.ready)
        .then(warmFonts)
        .catch(() => undefined);
    }
  }, []);

  // Redraw whenever the words or the look change. The canvas stays hidden;
  // the preview is an <img> so a long press can save it on a phone.
  useEffect(() => {
    let cancelled = false;
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;
    loadFonts(copy).then(() => {
      if (cancelled) return;
      renderThumbnail(ctx, copy, { theme, seed });
      canvas.toBlob((blob) => {
        if (!blob || cancelled) return;
        const url = URL.createObjectURL(blob);
        setPreview((old) => {
          if (old) URL.revokeObjectURL(old);
          return url;
        });
      }, "image/png");
    });
    return () => {
      cancelled = true;
    };
  }, [copy, theme, seed]);

  const apply = (next: ThumbCopy) => {
    setCopy(next);
    setTagInput(next.tags.join("、"));
    setEditOpen(true);
  };

  async function generate() {
    const input = text.trim();
    if (!input || busy) return;
    // Drop the keyboard so the preview is visible while it works.
    (document.activeElement as HTMLElement | null)?.blur();
    setBusy(true);
    setNote("");
    const nextSeed = Math.floor(Math.random() * 1e9);
    setSeed(nextSeed);

    let done = false;
    if (choice !== "local") {
      try {
        const res = await fetch("/api/analyze", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ text: input, provider: choice === "auto" ? undefined : choice }),
        });
        const data = (await res.json()) as { copy?: ThumbCopy; source?: AiId; skipped?: string[]; error?: string };
        if (res.ok && data.copy && data.source) {
          apply(data.copy);
          setSource(data.source);
          if (data.skipped?.length) setNote(`先に試してダメだったもの: ${data.skipped.join(" / ")}`);
          done = true;
        } else {
          setNote(`AIで作れませんでした(${data.error ?? res.status})。AIなしで作りました。`);
        }
      } catch {
        setNote("AIにつながりませんでした。AIなしで作りました。");
      }
    }
    if (!done) {
      apply(extractLocal(input, nextSeed));
      setSource("local");
    }
    setBusy(false);
  }

  async function pasteFromClipboard() {
    try {
      const clip = await navigator.clipboard.readText();
      if (clip) return setText(clip);
    } catch {
      /* no clipboard API or permission denied */
    }
    // Fall back to the field itself, where a long press offers "ペースト".
    document.getElementById("src")?.focus();
  }

  function rerollComment() {
    const top = keywords(text).find((k) => k.word !== copy.sub)?.word ?? copy.tags[0] ?? "";
    let next = copy.comment;
    for (let i = 0; i < 6 && next === copy.comment; i++) next = reaction(top, Math.floor(Math.random() * 1e6));
    setCopy({ ...copy, comment: next });
  }

  function edit(patch: Partial<ThumbCopy>) {
    setCopy(sanitizeCopy({ ...copy, ...patch }));
  }

  /** On a phone this opens the share sheet ("画像を保存" puts it in Photos); elsewhere it downloads. */
  async function save() {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, "image/png"));
    if (!blob) return;
    const name = `${slug(copy.main)}_1280x670.png`;
    const file = new File([blob], name, { type: "image/png" });
    const touch = window.matchMedia("(pointer: coarse)").matches;
    if (touch && navigator.canShare?.({ files: [file] })) {
      try {
        await navigator.share({ files: [file] });
        return;
      } catch (error) {
        if (error instanceof DOMException && error.name === "AbortError") return;
      }
    }
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = name;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  const hasCopy = Boolean(copy.main || copy.comment);

  return (
    <div className="min-h-dvh pb-32">
      <header className="pt-safe sticky top-0 z-20 bg-[var(--bg)]/95 px-4 pb-2 backdrop-blur">
        <div className="mx-auto flex max-w-3xl items-center gap-3">
          <h1 className="text-lg font-black tracking-tight">
            Eureka Thumb <span className="text-sm text-[var(--accent)]">文字だけサムネ</span>
          </h1>
          <div className="ml-auto">
            <InstallButton />
          </div>
        </div>
        <div className="mx-auto mt-2 max-w-3xl">
          <div
            className="relative overflow-hidden rounded-xl border border-[var(--border)] bg-black shadow-xl"
            style={{ aspectRatio: `${W} / ${H}` }}
          >
            {preview && (
              // A blob URL from the local canvas; next/image has nothing to optimise.
              // eslint-disable-next-line @next/next/no-img-element
              <img src={preview} alt="サムネイルのプレビュー" className="block h-full w-full" />
            )}
            {busy && (
              <div className="absolute inset-0 grid place-items-center bg-black/50 text-sm font-bold">考え中…</div>
            )}
          </div>
        </div>
      </header>

      <canvas ref={canvasRef} width={W} height={H} className="hidden" />

      <main className="mx-auto max-w-3xl space-y-3 px-4 pt-1">
        {source ? (
          <p className="text-xs text-[var(--muted)]">
            {source === "local" ? "AIなしで文字を作りました" : `${LABEL[source]} が文字を書きました`}
            ・画像の長押しでも保存できます
          </p>
        ) : (
          <p className="text-xs text-[var(--muted)]">文章を入れて「サムネ生成」を押すと上に出るよ</p>
        )}
        {note && <p className="text-xs text-amber-300">{note}</p>}

        <section className="rounded-2xl border border-[var(--border)] bg-[var(--panel)] p-3">
          <div className="mb-2 flex items-center gap-2">
            <label className="text-sm font-bold" htmlFor="src">
              記事・紹介文
            </label>
            <div className="ml-auto flex gap-2">
              <button type="button" className={chip} onClick={pasteFromClipboard}>
                貼り付け
              </button>
              {text ? (
                <button type="button" className={chip} onClick={() => setText("")}>
                  クリア
                </button>
              ) : (
                <button type="button" className={chip} onClick={() => setText(SAMPLE)}>
                  例文
                </button>
              )}
            </div>
          </div>
          <textarea
            id="src"
            className="field h-36 resize-y leading-relaxed"
            placeholder="タイトルや本文をそのまま貼り付け"
            value={text}
            onChange={(e) => setText(e.target.value)}
          />
          <label className="mt-3 flex items-center gap-2 text-xs text-[var(--muted)]">
            <span className="shrink-0">文字を考えるAI</span>
            <select className="field !py-2" value={choice} onChange={(e) => setChoice(e.target.value as Choice)}>
              <option value="auto">自動(無料AIを順に試す)</option>
              {providers.map((id) => (
                <option key={id} value={id}>
                  {LABEL[id]}
                </option>
              ))}
              <option value="local">AIなし(キーワード抽出のみ)</option>
            </select>
          </label>
        </section>

        <section className="no-scrollbar -mx-4 flex gap-2 overflow-x-auto px-4" role="radiogroup" aria-label="カラー">
          {(Object.keys(THEMES) as ThemeId[]).map((id) => (
            <button
              key={id}
              role="radio"
              aria-checked={theme === id}
              onClick={() => setTheme(id)}
              className={`flex min-h-11 shrink-0 items-center gap-2 rounded-full border px-4 text-sm ${
                theme === id ? "border-[var(--accent)] bg-white/5 text-white" : "border-[var(--border)] text-[var(--muted)]"
              }`}
            >
              <span
                className="h-4 w-4 rounded-full"
                style={{ background: `linear-gradient(135deg, ${THEMES[id].swatch[0]} 50%, ${THEMES[id].swatch[1]} 50%)` }}
              />
              {THEMES[id].label}
            </button>
          ))}
          <button
            className="min-h-11 shrink-0 rounded-full border border-[var(--border)] px-4 text-sm text-[var(--muted)]"
            onClick={() => setSeed(Math.floor(Math.random() * 1e9))}
          >
            線を揺らす
          </button>
        </section>

        <section className="rounded-2xl border border-[var(--border)] bg-[var(--panel)]">
          <button
            type="button"
            className="flex min-h-12 w-full items-center px-3 text-left text-sm font-bold"
            aria-expanded={editOpen}
            onClick={() => setEditOpen((v) => !v)}
          >
            文字を調整
            <span className="ml-auto text-[var(--muted)]">{editOpen ? "▲" : "▼"}</span>
          </button>
          {editOpen && (
            <div className="space-y-3 px-3 pb-3 text-sm">
              <label className="block">
                <span className="text-xs text-[var(--muted)]">見出し(改行で2行に)</span>
                <textarea
                  className="field mt-1 h-20 resize-none"
                  maxLength={LIMITS.main + 1}
                  value={copy.main}
                  onChange={(e) => setCopy({ ...copy, main: e.target.value })}
                  onBlur={() => edit({})}
                />
              </label>
              <label className="block">
                <span className="text-xs text-[var(--muted)]">サブ(空なら非表示)</span>
                <input
                  className="field mt-1"
                  maxLength={LIMITS.sub}
                  value={copy.sub}
                  onChange={(e) => setCopy({ ...copy, sub: e.target.value })}
                />
              </label>
              <label className="block">
                <span className="text-xs text-[var(--muted)]">キーワード(読点区切り・最大3つ)</span>
                <input
                  className="field mt-1"
                  value={tagInput}
                  onChange={(e) => {
                    setTagInput(e.target.value);
                    const tags = e.target.value
                      .split(/[、,，\s]+/)
                      .map((s) => s.trim())
                      .filter(Boolean)
                      .slice(0, LIMITS.tags)
                      .map((s) => Array.from(s).slice(0, LIMITS.tag).join(""));
                    setCopy({ ...copy, tags });
                  }}
                />
              </label>
              <div>
                <div className="flex items-center justify-between text-xs text-[var(--muted)]">
                  <label htmlFor="comment">エウレカの一言(手書き+アンダーライン)</label>
                  <button className="min-h-9 px-2 text-[var(--accent)] active:opacity-60" onClick={rerollComment} type="button">
                    別の一言
                  </button>
                </div>
                <input
                  id="comment"
                  className="field mt-1"
                  maxLength={LIMITS.comment}
                  value={copy.comment}
                  onChange={(e) => setCopy({ ...copy, comment: e.target.value })}
                  onBlur={() => edit({})}
                />
              </div>
            </div>
          )}
        </section>

        <p className="text-center text-xs text-[var(--muted)]">1280×670 PNG・文字は端から 76px 以上内側</p>
      </main>

      <nav className="pb-safe fixed inset-x-0 bottom-0 z-30 border-t border-[var(--border)] bg-[var(--bg)]/95 px-4 pt-3 backdrop-blur">
        <div className="mx-auto flex max-w-3xl gap-3">
          <button
            className="min-h-13 flex-[3] rounded-2xl bg-[var(--accent)] text-base font-black text-black active:brightness-90 disabled:opacity-40"
            onClick={generate}
            disabled={busy || !text.trim()}
          >
            {busy ? "考え中…" : hasCopy ? "もう一度生成" : "サムネ生成"}
          </button>
          <button
            className="min-h-13 flex-[2] rounded-2xl bg-white text-base font-black text-black active:brightness-90 disabled:opacity-30"
            onClick={save}
            disabled={!hasCopy}
          >
            保存・共有
          </button>
        </div>
      </nav>
    </div>
  );
}
