/**
 * Prompt safety gate.
 *
 * One rule, always on and not configurable: a prompt may not combine a
 * child/minor descriptor with sexual content. Everything else is left to the
 * operator via SFW mode.
 */

const MINOR_TERMS = [
  "loli",
  "lolicon",
  "shota",
  "shotacon",
  "toddler",
  "toddlercon",
  "preteen",
  "pre-teen",
  "prepubescent",
  "pre-pubescent",
  "child",
  "children",
  "kid",
  "kids",
  "infant",
  "baby",
  "babies",
  "kindergarten",
  "elementary school",
  "middle schooler",
  "grade schooler",
  "underage",
  "under-age",
  "minor",
  "少女",
  "幼女",
  "児童",
  "小学生",
  "ロリ",
  "ショタ",
];

/** Ages 0–17 written as digits or words, e.g. "12yo", "15 years old". */
const YOUNG_AGE = /\b(?:[0-9]|1[0-7])\s*(?:yo|y\.o\.|yrs?|years?[\s-]*old|才|歳)\b/i;

const SEXUAL_TERMS = [
  "nude",
  "naked",
  "nsfw",
  "sex",
  "sexual",
  "sexy",
  "porn",
  "hentai",
  "erotic",
  "explicit",
  "topless",
  "bottomless",
  "nipples",
  "areola",
  "genital",
  "penis",
  "vagina",
  "pussy",
  "cum",
  "orgasm",
  "masturbat",
  "fellatio",
  "cunnilingus",
  "spread legs",
  "bikini",
  "lingerie",
  "underwear",
  "panties",
  "bra",
  "seductive",
  "provocative",
  "suggestive",
  "fetish",
  "bdsm",
  "bondage",
  "エロ",
  "裸",
  "全裸",
  "水着",
  "下着",
];

/** Words that make a "child" hit almost certainly innocent. */
const BENIGN_CONTEXT = [
  "childhood memory",
  "child of light",
  "inner child",
  "children's book",
  "child-friendly",
];

export interface SafetyVerdict {
  ok: boolean;
  reason?: string;
  /** Terms that triggered the block, for the operator-facing log. */
  matched?: string[];
}

function containsAny(haystack: string, needles: string[]): string[] {
  return needles.filter((n) => haystack.includes(n));
}

/**
 * Returns `{ ok: false }` when the combined prompt text sexualises a minor.
 * Called on every generation request, on the server, before anything is queued.
 */
export function checkPrompt(...parts: string[]): SafetyVerdict {
  const text = parts.filter(Boolean).join(" \n ").toLowerCase();
  if (!text.trim()) return { ok: true };

  if (BENIGN_CONTEXT.some((phrase) => text.includes(phrase))) {
    // Still check the explicit ones — a benign phrase must not act as a bypass.
    const hardMinor = containsAny(text, MINOR_TERMS.slice(0, 8));
    const sexual = containsAny(text, SEXUAL_TERMS);
    if (hardMinor.length === 0 || sexual.length === 0) return { ok: true };
    return {
      ok: false,
      reason: "This prompt combines a minor descriptor with sexual content and cannot be generated.",
      matched: [...hardMinor, ...sexual],
    };
  }

  const minorHits = containsAny(text, MINOR_TERMS);
  if (YOUNG_AGE.test(text)) minorHits.push("explicit age under 18");
  if (minorHits.length === 0) return { ok: true };

  const sexualHits = containsAny(text, SEXUAL_TERMS);
  if (sexualHits.length === 0) return { ok: true };

  return {
    ok: false,
    reason:
      "This prompt combines a minor descriptor with sexual content and cannot be generated. " +
      "Remove the age or child-related terms, or the sexual terms.",
    matched: [...minorHits, ...sexualHits],
  };
}

/** Terms blocked outright when the operator turns on SFW mode. */
const SFW_BLOCKED = SEXUAL_TERMS.filter(
  (t) => !["sexy", "bikini", "seductive", "provocative", "suggestive"].includes(t),
);

export function checkSfw(enabled: boolean, ...parts: string[]): SafetyVerdict {
  if (!enabled) return { ok: true };
  const text = parts.filter(Boolean).join(" ").toLowerCase();
  const hits = containsAny(text, SFW_BLOCKED);
  if (hits.length === 0) return { ok: true };
  return { ok: false, reason: "SFW mode is on and this prompt requests explicit content.", matched: hits };
}
