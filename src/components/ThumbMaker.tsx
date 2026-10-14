"use client";

import { useEffect, useRef, useState } from "react";
import { LIMITS, sanitizeCopy, type ThumbCopy } from "@/lib/copy";
import { extractLocal, keywords, reaction } from "@/lib/extract";
import { H, THEMES, W, loadFonts, renderThumbnail, type ThemeId } from "@/lib/render";

type AiId = "claude" | "gemini" | "pollinations";
type Choice = "auto" | AiId | "local";
type Source = AiId | "local" | null;

// Kept here rather than imported from lib/ai, which would drag the server SDK into the bundle.
const LABEL: Record<AiId | "local", string> = {
  claude: "Claude",
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

export default function ThumbMaker() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
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

  useEffect(() => {
    fetch("/api/analyze")
      .then((r) => r.json())
      .then((d: { providers?: AiId[] }) => setProviders(d.providers ?? []))
      .catch(() => setProviders([]));
  }, []);

  // Redraw whenever the words or the look change.
  useEffect(() => {
    let cancelled = false;
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!ctx) return;
    loadFonts(copy).then(() => {
      if (!cancelled) renderThumbnail(ctx, copy, { theme, seed });
    });
    return () => {
      cancelled = true;
    };
  }, [copy, theme, seed]);

  const apply = (next: ThumbCopy) => {
    setCopy(next);
    setTagInput(next.tags.join("、"));
  };

  async function generate() {
    const input = text.trim();
    if (!input) return;
    setBusy(true);
    setNote("");
    const nextSeed = Math.floor(Math.random() * 1e9);
    setSeed(nextSeed);
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
          setBusy(false);
          return;
        }
        setNote(`AIで作れませんでした(${data.error ?? res.status})。AIなしで作りました。`);
      } catch {
        setNote("AIに接続できませんでした。AIなしで作りました。");
      }
    }
    setBusy(false);
    apply(extractLocal(input, nextSeed));
    setSource("local");
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

  function download() {
    canvasRef.current?.toBlob((blob) => {
      if (!blob) return;
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${slug(copy.main)}_1280x670.png`;
      a.click();
      URL.revokeObjectURL(url);
    }, "image/png");
  }

  const hasCopy = Boolean(copy.main || copy.comment);

  return (
    <main className="mx-auto max-w-6xl px-4 py-8">
      <header className="mb-6">
        <h1 className="text-2xl font-black tracking-tight">
          Eureka Thumb <span className="text-[var(--accent)]">— 文字だけサムネ</span>
        </h1>
        <p className="mt-1 text-sm text-[var(--muted)]">
          文章を貼ってボタンを押すだけ。キーワードとエウレカの一言を拾って、1280×670 の派手なサムネを作るよ。
        </p>
      </header>

      <div className="grid gap-6 lg:grid-cols-[380px_1fr]">
        <section className="space-y-4">
          <div className="rounded-2xl border border-[var(--border)] bg-[var(--panel)] p-4">
            <label className="mb-2 block text-sm font-bold" htmlFor="src">
              記事・紹介文
            </label>
            <textarea
              id="src"
              className="field h-56 resize-y text-sm leading-relaxed"
              placeholder="タイトルや本文をそのまま貼り付け"
              value={text}
              onChange={(e) => setText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) generate();
              }}
            />
            <div className="mt-3 flex gap-2">
              <button
                className="flex-1 rounded-xl bg-[var(--accent)] px-4 py-3 font-black text-black transition hover:brightness-110 disabled:opacity-50"
                onClick={generate}
                disabled={busy || !text.trim()}
              >
                {busy ? "考え中…" : hasCopy ? "もう一度生成" : "サムネ生成"}
              </button>
              {!text && (
                <button
                  className="rounded-xl border border-[var(--border)] px-3 text-sm text-[var(--muted)] hover:text-white"
                  onClick={() => setText(SAMPLE)}
                >
                  例文
                </button>
              )}
            </div>
            <label className="mt-3 flex items-center gap-2 text-xs text-[var(--muted)]">
              文字を考えるAI
              <select
                className="field !w-auto flex-1 !py-1.5 text-sm"
                value={choice}
                onChange={(e) => setChoice(e.target.value as Choice)}
              >
                <option value="auto">自動(使えるものから順に)</option>
                {providers.map((id) => (
                  <option key={id} value={id}>
                    {LABEL[id]}
                  </option>
                ))}
                <option value="local">AIなし(キーワード抽出のみ)</option>
              </select>
            </label>
            {source && (
              <p className="mt-2 text-xs text-[var(--muted)]">
                {source === "local" ? "AIなしで文字を作りました" : `${LABEL[source]} が文字を書きました`}
              </p>
            )}
            {note && <p className="mt-1 text-xs text-amber-300">{note}</p>}
          </div>

          <div className="space-y-3 rounded-2xl border border-[var(--border)] bg-[var(--panel)] p-4 text-sm">
            <p className="font-bold">文字を調整</p>
            <label className="block">
              <span className="text-xs text-[var(--muted)]">見出し(改行で2行に)</span>
              <textarea
                className="field mt-1 h-16 resize-none"
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
            <label className="block">
              <span className="flex items-center justify-between text-xs text-[var(--muted)]">
                エウレカの一言(手書き+アンダーライン)
                <button className="text-[var(--accent)] hover:underline" onClick={rerollComment} type="button">
                  別の一言
                </button>
              </span>
              <input
                className="field mt-1"
                maxLength={LIMITS.comment}
                value={copy.comment}
                onChange={(e) => setCopy({ ...copy, comment: e.target.value })}
                onBlur={() => edit({})}
              />
            </label>
          </div>
        </section>

        <section className="space-y-4">
          <div className="overflow-hidden rounded-2xl border border-[var(--border)] bg-black shadow-2xl">
            <canvas
              ref={canvasRef}
              width={W}
              height={H}
              className="block h-auto w-full"
              aria-label="サムネイルのプレビュー"
            />
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <div className="flex gap-2" role="radiogroup" aria-label="カラー">
              {(Object.keys(THEMES) as ThemeId[]).map((id) => (
                <button
                  key={id}
                  role="radio"
                  aria-checked={theme === id}
                  onClick={() => setTheme(id)}
                  className={`flex items-center gap-2 rounded-xl border px-3 py-2 text-sm ${
                    theme === id ? "border-[var(--accent)] text-white" : "border-[var(--border)] text-[var(--muted)]"
                  }`}
                >
                  <span
                    className="h-4 w-4 rounded-full"
                    style={{ background: `linear-gradient(135deg, ${THEMES[id].swatch[0]} 50%, ${THEMES[id].swatch[1]} 50%)` }}
                  />
                  {THEMES[id].label}
                </button>
              ))}
            </div>
            <button
              className="rounded-xl border border-[var(--border)] px-3 py-2 text-sm text-[var(--muted)] hover:text-white"
              onClick={() => setSeed(Math.floor(Math.random() * 1e9))}
            >
              線を揺らす
            </button>
            <button
              className="ml-auto rounded-xl bg-white px-5 py-2 font-black text-black hover:brightness-90 disabled:opacity-40"
              onClick={download}
              disabled={!hasCopy}
            >
              PNG をダウンロード
            </button>
          </div>
          <p className="text-xs text-[var(--muted)]">1280×670 PNG。文字はすべて端から 76px 以上内側に収めています。</p>
        </section>
      </div>
    </main>
  );
}
