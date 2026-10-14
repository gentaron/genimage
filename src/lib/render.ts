/**
 * Draws a text-only thumbnail onto a 1280×670 canvas.
 *
 * Everything is vector text on canvas, so the words come out exactly as typed
 * — no garbled glyphs as with diffusion models. All text is kept inside SAFE
 * pixels of every edge; only the background decoration bleeds to the border.
 */
import type { ThumbCopy } from "./copy";

export const W = 1280;
export const H = 670;
export const SAFE = 76;

// Set by next/font in the root layout; the fallbacks cover a missing variable.
let FONT_HEAD = '"Dela Gothic One", "Hiragino Sans", "Noto Sans JP", sans-serif';
let FONT_HAND = '"Yomogi", "Klee One", cursive';

function resolveFonts() {
  if (typeof document === "undefined") return;
  const css = getComputedStyle(document.documentElement);
  const head = css.getPropertyValue("--font-thumb-head").trim();
  const hand = css.getPropertyValue("--font-thumb-hand").trim();
  if (head) FONT_HEAD = `${head}, "Hiragino Sans", "Noto Sans JP", sans-serif`;
  if (hand) FONT_HAND = `${hand}, cursive`;
}

export type ThemeId = "caution" | "alert" | "deepblue";

interface Theme {
  label: string;
  swatch: [string, string];
  bg: [string, string];
  rays: string;
  dots: string;
  stripes: [string, string];
  mainFill: string;
  mainStroke: string;
  mainShadow: string;
  subBg: string;
  subText: string;
  tagBg: string;
  tagText: string;
  ink: string;
  marker: string;
}

/** Deep blue (#0b2a78) is the house colour, so every theme carries it somewhere. */
export const THEMES: Record<ThemeId, Theme> = {
  caution: {
    label: "警告イエロー",
    swatch: ["#ffd60a", "#111111"],
    bg: ["#ffe14d", "#ffc700"],
    rays: "rgba(255,255,255,0.45)",
    dots: "rgba(0,0,0,0.13)",
    stripes: ["#111111", "#ffd60a"],
    mainFill: "#111111",
    mainStroke: "#ffffff",
    mainShadow: "#0b2a78",
    subBg: "#e10600",
    subText: "#ffffff",
    tagBg: "#111111",
    tagText: "#ffd60a",
    ink: "#0b2a78",
    marker: "rgba(225,6,0,0.85)",
  },
  alert: {
    label: "レッドアラート",
    swatch: ["#e10600", "#ffd60a"],
    bg: ["#f01d12", "#b80400"],
    rays: "rgba(255,214,10,0.22)",
    dots: "rgba(0,0,0,0.18)",
    stripes: ["#111111", "#ffd60a"],
    mainFill: "#ffe600",
    mainStroke: "#111111",
    mainShadow: "#0b2a78",
    subBg: "#111111",
    subText: "#ffffff",
    tagBg: "#ffffff",
    tagText: "#e10600",
    ink: "#ffffff",
    marker: "rgba(255,214,10,0.95)",
  },
  deepblue: {
    label: "ディープブルー",
    swatch: ["#0b2a78", "#ffd60a"],
    bg: ["#123a9c", "#050b24"],
    rays: "rgba(80,140,255,0.16)",
    dots: "rgba(255,255,255,0.10)",
    stripes: ["#ffd60a", "#111111"],
    mainFill: "#ffffff",
    mainStroke: "#050b24",
    mainShadow: "#e10600",
    subBg: "#ffd60a",
    subText: "#111111",
    tagBg: "#e10600",
    tagText: "#ffffff",
    ink: "#ffe600",
    marker: "rgba(225,6,0,0.9)",
  },
};

function rng(seed: number) {
  let a = seed >>> 0 || 1;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ---------------------------------------------------------------- background

function drawBackground(ctx: CanvasRenderingContext2D, t: Theme, rand: () => number) {
  const g = ctx.createLinearGradient(0, 0, W, H);
  g.addColorStop(0, t.bg[0]);
  g.addColorStop(1, t.bg[1]);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);

  // Speed lines (集中線) out of the centre.
  const cx = W / 2;
  const cy = H * 0.48;
  const R = Math.hypot(W, H);
  ctx.fillStyle = t.rays;
  const n = 64;
  for (let i = 0; i < n; i++) {
    if (i % 2) continue;
    const a0 = (i / n) * Math.PI * 2 + rand() * 0.02;
    const a1 = a0 + (Math.PI * 2) / n * (0.5 + rand() * 0.6);
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.lineTo(cx + Math.cos(a0) * R, cy + Math.sin(a0) * R);
    ctx.lineTo(cx + Math.cos(a1) * R, cy + Math.sin(a1) * R);
    ctx.closePath();
    ctx.fill();
  }

  // Halftone in two opposite corners.
  ctx.fillStyle = t.dots;
  const corner = (ox: number, oy: number) => {
    for (let y = 0; y <= 260; y += 18) {
      for (let x = 0; x <= 360; x += 18) {
        const d = Math.hypot(x, y);
        const r = Math.max(0, 6.5 - d / 52);
        if (r <= 0.4) continue;
        ctx.beginPath();
        ctx.arc(ox === 0 ? x : W - x, oy === 0 ? y : H - y, r, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  };
  corner(0, 0);
  corner(W, H);

  // Caution tape along the top and bottom edges.
  const band = 22;
  for (const y0 of [0, H - band]) {
    ctx.save();
    ctx.beginPath();
    ctx.rect(0, y0, W, band);
    ctx.clip();
    ctx.fillStyle = t.stripes[1];
    ctx.fillRect(0, y0, W, band);
    ctx.fillStyle = t.stripes[0];
    for (let x = -band; x < W + band; x += 44) {
      ctx.beginPath();
      ctx.moveTo(x, y0 + band);
      ctx.lineTo(x + 22, y0 + band);
      ctx.lineTo(x + 22 + band, y0);
      ctx.lineTo(x + band, y0);
      ctx.closePath();
      ctx.fill();
    }
    ctx.restore();
  }
}

// ---------------------------------------------------------------- line breaking

const PARTICLE = /[のはがをにでともへやかなよ、。，．・×!！?？\s]/;

function script(ch: string): number {
  if (/[ァ-ヴー]/.test(ch)) return 1;
  if (/[一-龠々]/.test(ch)) return 2;
  if (/[ぁ-ゖ]/.test(ch)) return 3;
  if (/[A-Za-z0-9]/.test(ch)) return 4;
  return 5;
}

/** Splits a headline into two balanced lines without cutting a word in half. */
function splitTwo(ctx: CanvasRenderingContext2D, text: string): string[] {
  const chars = Array.from(text);
  if (chars.length < 4) return [text];
  let best = -1;
  let bestCost = Infinity;
  for (let i = 2; i <= chars.length - 2; i++) {
    const prev = chars[i - 1];
    const next = chars[i];
    let penalty: number;
    if (PARTICLE.test(prev)) penalty = 0;
    else if (script(prev) !== script(next) && !(script(prev) === 2 && script(next) === 3)) penalty = 0.15;
    else if (script(prev) === 4 && script(next) === 4) penalty = 5;
    else if (script(prev) === 1 && script(next) === 1) penalty = 3;
    else penalty = 0.6;
    if (/[ー」』）)、。]/.test(next)) penalty += 5;
    const a = ctx.measureText(chars.slice(0, i).join("").trim()).width;
    const b = ctx.measureText(chars.slice(i).join("").trim()).width;
    const cost = Math.abs(a - b) / (a + b) + penalty;
    if (cost < bestCost) {
      bestCost = cost;
      best = i;
    }
  }
  return [chars.slice(0, best).join("").trim(), chars.slice(best).join("").trim()];
}

// ---------------------------------------------------------------- blocks

function chipRow(ctx: CanvasRenderingContext2D, tags: string[], size: number) {
  ctx.font = `${size}px ${FONT_HEAD}`;
  const pad = size * 0.55;
  const gap = size * 0.45;
  const widths = tags.map((tg) => ctx.measureText(tg).width + pad * 2);
  return { widths, total: widths.reduce((s, w) => s + w, 0) + gap * Math.max(0, tags.length - 1), pad, gap };
}

function drawChips(ctx: CanvasRenderingContext2D, t: Theme, tags: string[], size: number, cy: number) {
  const { widths, total, pad, gap } = chipRow(ctx, tags, size);
  const h = size * 1.5;
  let x = (W - total) / 2;
  tags.forEach((tag, i) => {
    ctx.save();
    ctx.translate(x + widths[i] / 2, cy);
    ctx.transform(1, 0, -0.18, 1, 0, 0);
    ctx.fillStyle = "rgba(0,0,0,0.25)";
    ctx.fillRect(-widths[i] / 2 + 5, -h / 2 + 5, widths[i], h);
    ctx.fillStyle = t.tagBg;
    ctx.fillRect(-widths[i] / 2, -h / 2, widths[i], h);
    ctx.restore();
    ctx.fillStyle = t.tagText;
    ctx.font = `${size}px ${FONT_HEAD}`;
    ctx.textAlign = "left";
    ctx.textBaseline = "middle";
    ctx.fillText(tag, x + pad, cy + size * 0.04);
    x += widths[i] + gap;
  });
}

function drawMain(ctx: CanvasRenderingContext2D, t: Theme, lines: string[], size: number, top: number) {
  const lh = size * 1.14;
  ctx.font = `${size}px ${FONT_HEAD}`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.lineJoin = "round";
  ctx.miterLimit = 2;
  const block = lh * lines.length;
  ctx.save();
  ctx.translate(W / 2, top + block / 2);
  ctx.rotate((-2 * Math.PI) / 180);
  lines.forEach((line, i) => {
    const y = -block / 2 + lh * (i + 0.5);
    const sw = Math.max(8, size * 0.15);
    // Offset shadow, then a fat outline, then the fill.
    ctx.lineWidth = sw;
    ctx.strokeStyle = t.mainShadow;
    ctx.fillStyle = t.mainShadow;
    ctx.strokeText(line, size * 0.07, y + size * 0.07);
    ctx.fillText(line, size * 0.07, y + size * 0.07);
    ctx.strokeStyle = t.mainStroke;
    ctx.strokeText(line, 0, y);
    ctx.fillStyle = t.mainFill;
    ctx.fillText(line, 0, y);
  });
  ctx.restore();
}

function drawSub(ctx: CanvasRenderingContext2D, t: Theme, sub: string, size: number, cy: number) {
  ctx.font = `${size}px ${FONT_HEAD}`;
  const w = ctx.measureText(sub).width + size * 1.6;
  const h = size * 1.55;
  ctx.save();
  ctx.translate(W / 2, cy);
  ctx.rotate((-2 * Math.PI) / 180);
  ctx.transform(1, 0, -0.2, 1, 0, 0);
  ctx.fillStyle = t.subBg;
  ctx.fillRect(-w / 2, -h / 2, w, h);
  ctx.restore();
  ctx.save();
  ctx.translate(W / 2, cy);
  ctx.rotate((-2 * Math.PI) / 180);
  ctx.fillStyle = t.subText;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(sub, 0, size * 0.04);
  ctx.restore();
}

/** Eureka's line: handwritten, slightly tilted, with a marker underline. */
function drawComment(
  ctx: CanvasRenderingContext2D,
  t: Theme,
  text: string,
  size: number,
  cy: number,
  rand: () => number,
) {
  ctx.font = `${size}px ${FONT_HAND}`;
  const tw = ctx.measureText(text).width;
  const cx = W / 2;
  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate((-3 * Math.PI) / 180);

  // Two loose marker passes under the words.
  ctx.strokeStyle = t.marker;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  for (let pass = 0; pass < 2; pass++) {
    ctx.lineWidth = size * (pass ? 0.11 : 0.17);
    ctx.beginPath();
    const y0 = size * (0.62 + pass * 0.2);
    const x0 = -tw / 2 - size * 0.25 + rand() * 10;
    const x1 = tw / 2 + size * 0.2 - (pass ? size * 0.6 : 0);
    const steps = 6;
    ctx.moveTo(x0, y0 + (rand() - 0.5) * 4);
    for (let s = 1; s <= steps; s++) {
      const x = x0 + ((x1 - x0) * s) / steps;
      ctx.lineTo(x, y0 + (rand() - 0.5) * 6 - s * (pass ? 0.6 : 0.3));
    }
    ctx.stroke();
  }

  // Three short hand-drawn emphasis dashes fanning out before the line.
  ctx.lineWidth = Math.max(3, size * 0.07);
  ctx.strokeStyle = t.ink;
  const ex = -tw / 2 - size * 0.2;
  for (let k = -1; k <= 1; k++) {
    const ang = Math.PI + k * 0.6;
    ctx.beginPath();
    ctx.moveTo(ex + Math.cos(ang) * size * 0.32, Math.sin(ang) * size * 0.32);
    ctx.lineTo(ex + Math.cos(ang) * size * 0.68, Math.sin(ang) * size * 0.68);
    ctx.stroke();
  }

  ctx.fillStyle = t.ink;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  // A thin halo keeps the handwriting legible over the speed lines.
  ctx.lineWidth = size * 0.16;
  ctx.strokeStyle = t.ink === "#ffffff" || t.ink === "#ffe600" ? "rgba(0,0,0,0.55)" : "rgba(255,255,255,0.85)";
  ctx.strokeText(text, 0, 0);
  ctx.fillText(text, 0, 0);
  ctx.restore();
}

// ---------------------------------------------------------------- layout

export interface RenderOptions {
  theme: ThemeId;
  seed: number;
}

export function renderThumbnail(ctx: CanvasRenderingContext2D, copy: ThumbCopy, opts: RenderOptions) {
  const t = THEMES[opts.theme];
  const rand = rng(opts.seed);
  ctx.save();
  ctx.clearRect(0, 0, W, H);
  drawBackground(ctx, t, rand);

  const maxW = W - SAFE * 2;
  const maxH = H - SAFE * 2;
  const tags = copy.tags.filter(Boolean);
  const main = copy.main.trim();
  const sub = copy.sub.trim();
  const comment = copy.comment.trim();

  // Shrink the side blocks until they fit across the safe area.
  let tagSize = 34;
  while (tags.length && tagSize > 20 && chipRow(ctx, tags, tagSize).total > maxW) tagSize -= 2;
  let subSize = 40;
  ctx.font = `${subSize}px ${FONT_HEAD}`;
  while (sub && subSize > 22 && ctx.measureText(sub).width + subSize * 2.2 > maxW) {
    subSize -= 2;
    ctx.font = `${subSize}px ${FONT_HEAD}`;
  }
  let handSize = 58;
  ctx.font = `${handSize}px ${FONT_HAND}`;
  while (comment && handSize > 28 && ctx.measureText(comment).width + handSize * 1.6 > maxW) {
    handSize -= 2;
    ctx.font = `${handSize}px ${FONT_HAND}`;
  }

  const tagH = tags.length ? tagSize * 1.5 + 26 : 0;
  const subH = sub ? subSize * 1.55 + 22 : 0;
  const commentH = comment ? handSize * 1.9 + 24 : 0;

  // Then give the headline everything that is left, on one or two lines.
  let size = 176;
  let lines: string[] = [main];
  for (; size >= 48; size -= 4) {
    ctx.font = `${size}px ${FONT_HEAD}`;
    lines = main.includes("\n") ? main.split("\n").slice(0, 2) : [main];
    // The outline and shadow add ~0.25em of width.
    const fits = (ls: string[]) => ls.every((l) => ctx.measureText(l).width + size * 0.3 <= maxW);
    if (!fits(lines) && lines.length === 1) lines = splitTwo(ctx, main);
    const blockH = size * 1.14 * lines.length;
    if (fits(lines) && blockH + tagH + subH + commentH <= maxH) break;
  }
  const mainH = size * 1.14 * lines.length;

  const total = tagH + mainH + subH + commentH;
  let y = SAFE + (maxH - total) / 2;
  if (tags.length) {
    drawChips(ctx, t, tags, tagSize, y + (tagSize * 1.5) / 2);
    y += tagH;
  }
  if (main) drawMain(ctx, t, lines, size, y);
  y += mainH;
  if (sub) {
    drawSub(ctx, t, sub, subSize, y + 22 + (subSize * 1.55) / 2);
    y += subH;
  }
  if (comment) drawComment(ctx, t, comment, handSize, y + 24 + handSize * 0.75, rand);
  ctx.restore();
}

/** Every kana plus ASCII: loading these pulls in the glyph files most thumbnails need. */
const WARM =
  "あいうえおかきくけこさしすせそたちつてとなにぬねのはひふへほまみむめもやゆよらりるれろわをんがぎぐげござじずぜぞだぢづでどばびぶべぼぱぴぷぺぽぁぃぅぇぉっゃゅょ" +
  "アイウエオカキクケコサシスセソタチツテトナニヌネノハヒフヘホマミムメモヤユヨラリルレロワヲンガギグゲゴザジズゼゾダヂヅデドバビブベボパピプペポァィゥェォッャュョー" +
  "、。！？「」・×ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789%";

/** Makes sure the fonts (only the glyph files in use) are ready before drawing. */
export async function loadFonts(copy: ThumbCopy) {
  if (typeof document === "undefined" || !document.fonts) return;
  resolveFonts();
  const head = [copy.main, copy.sub, ...copy.tags].join("");
  await Promise.all([
    document.fonts.load(`40px ${FONT_HEAD}`, head || "あ"),
    document.fonts.load(`40px ${FONT_HAND}`, copy.comment || "あ"),
  ]).catch(() => undefined);
}

/** Fetches the common glyph files in the background so they are cached for offline use. */
export function warmFonts() {
  if (typeof document === "undefined" || !document.fonts) return;
  resolveFonts();
  void Promise.all([
    document.fonts.load(`40px ${FONT_HEAD}`, WARM),
    document.fonts.load(`40px ${FONT_HAND}`, WARM),
  ]).catch(() => undefined);
}
