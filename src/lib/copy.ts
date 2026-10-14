/**
 * The words that end up on a thumbnail, and the clean-up every source of them
 * goes through — the AI's answer, the offline extractor and hand edits alike.
 */

export interface ThumbCopy {
  /** The big headline: the article's name or its strongest SEO keyword. A "\n" forces a line break. */
  main: string;
  /** Optional strap line under the headline. */
  sub: string;
  /** Up to three short keyword chips. */
  tags: string[];
  /** Eureka's own one-line, first-person take, drawn handwritten. */
  comment: string;
}

export const LIMITS = { main: 24, sub: 22, tag: 10, tags: 3, comment: 26 } as const;

/** The media brand never goes on the image. */
const BANNED = [
  /genesis\s*vault/gi,
  /ジェネシス\s*・?\s*ヴ[ォオ]ル[トド]/g,
  /ジェネシス\s*・?\s*ボル[トド]/g,
];

export function stripBanned(s: string): string {
  let out = s;
  for (const re of BANNED) out = out.replace(re, "");
  return out
    .replace(/[ \t　]{2,}/g, " ")
    .replace(/^[\s・|｜:：\-–—×]+|[\s・|｜:：\-–—×]+$/g, "")
    .trim();
}

function clip(s: string, max: number): string {
  const chars = Array.from(s);
  return chars.length > max ? chars.slice(0, max).join("") : s;
}

export function sanitizeCopy(c: ThumbCopy): ThumbCopy {
  const main = c.main
    .split("\n")
    .map((l) => stripBanned(l))
    .filter(Boolean)
    .slice(0, 2)
    .join("\n");
  const sub = clip(stripBanned(c.sub), LIMITS.sub);
  const seen = new Set<string>(sub ? [sub] : []);
  const tags = c.tags
    .map((t) => clip(stripBanned(t.replace(/^#/, "")), LIMITS.tag))
    .filter((t) => {
      if (!t || seen.has(t) || main.replace("\n", "").includes(t)) return false;
      seen.add(t);
      return true;
    })
    .slice(0, LIMITS.tags);
  return {
    main: clip(main, LIMITS.main + 1),
    sub,
    tags,
    comment: clip(stripBanned(c.comment), LIMITS.comment),
  };
}
