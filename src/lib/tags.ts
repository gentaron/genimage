/**
 * Tag dictionary for the autocomplete dropdown and the Prompt Helper.
 *
 * `weight` is a relative popularity hint (0–100) used only for ranking
 * suggestions — it is a curated editorial ordering, not a scraped post count.
 */

export type TagCategory = "general" | "quality" | "composition" | "lighting" | "style" | "clothing" | "body" | "scene";

export interface Tag {
  name: string;
  category: TagCategory;
  weight: number;
  alias?: string[];
}

const t = (name: string, category: TagCategory, weight: number, alias?: string[]): Tag => ({
  name,
  category,
  weight,
  alias,
});

export const TAGS: Tag[] = [
  // --- subject count / core ------------------------------------------------
  t("1girl", "general", 100, ["one girl", "single female"]),
  t("1boy", "general", 92, ["one boy", "single male"]),
  t("2girls", "general", 70),
  t("solo", "general", 96),
  t("solo focus", "general", 60),
  t("multiple girls", "general", 62),
  t("couple", "general", 45),

  // --- quality -------------------------------------------------------------
  t("masterpiece", "quality", 99),
  t("best quality", "quality", 99),
  t("very aesthetic", "quality", 88),
  t("absurdres", "quality", 86),
  t("highres", "quality", 84),
  t("ultra detailed", "quality", 82),
  t("intricate details", "quality", 76),
  t("official art", "quality", 58),
  t("newest", "quality", 40),

  // --- composition ---------------------------------------------------------
  t("from front", "composition", 78),
  t("from side", "composition", 66),
  t("from behind", "composition", 64),
  t("from above", "composition", 72),
  t("from below", "composition", 70),
  t("upper body", "composition", 88),
  t("full body", "composition", 90),
  t("cowboy shot", "composition", 74),
  t("portrait", "composition", 80),
  t("close-up", "composition", 68),
  t("dutch angle", "composition", 52),
  t("dynamic pose", "composition", 76),
  t("looking at viewer", "composition", 94),
  t("looking away", "composition", 48),
  t("depth of field", "composition", 66),
  t("bokeh", "composition", 60),
  t("wide shot", "composition", 54),

  // --- lighting ------------------------------------------------------------
  t("cinematic lighting", "lighting", 86),
  t("dramatic lighting", "lighting", 78),
  t("rim light", "lighting", 74),
  t("backlighting", "lighting", 70),
  t("volumetric lighting", "lighting", 68),
  t("soft lighting", "lighting", 72),
  t("god rays", "lighting", 52),
  t("golden hour", "lighting", 58),
  t("neon lights", "lighting", 62),
  t("moonlight", "lighting", 50),
  t("studio lighting", "lighting", 56),
  t("high contrast", "lighting", 60),

  // --- style / render ------------------------------------------------------
  t("anime screencap", "style", 72),
  t("cel shading", "style", 66),
  t("clean lineart", "style", 64),
  t("flat color", "style", 48),
  t("painterly", "style", 58),
  t("watercolor", "style", 54),
  t("oil painting", "style", 50),
  t("sketch", "style", 46),
  t("pixel art", "style", 38),
  t("photorealistic", "style", 76),
  t("realistic", "style", 74),
  t("3d render", "style", 44),
  t("concept art", "style", 52),
  t("illustration", "style", 68),
  t("vivid colors", "style", 62),
  t("muted colors", "style", 40),
  t("monochrome", "style", 42),
  t("film grain", "style", 44),
  t("chromatic aberration", "style", 36),
  t("shiny skin", "style", 70),
  t("oiled skin", "style", 56),
  t("glossy", "style", 48),

  // --- body / character ----------------------------------------------------
  t("long hair", "body", 96),
  t("short hair", "body", 88),
  t("very long hair", "body", 74),
  t("curly hair", "body", 62),
  t("wavy hair", "body", 58),
  t("straight hair", "body", 56),
  t("twintails", "body", 78),
  t("ponytail", "body", 80),
  t("braid", "body", 66),
  t("messy hair", "body", 50),
  t("blue hair", "body", 82),
  t("brown hair", "body", 90),
  t("black hair", "body", 92),
  t("blonde hair", "body", 90),
  t("red hair", "body", 78),
  t("white hair", "body", 76),
  t("silver hair", "body", 70),
  t("pink hair", "body", 68),
  t("green hair", "body", 56),
  t("purple hair", "body", 58),
  t("blue eyes", "body", 90),
  t("brown eyes", "body", 84),
  t("green eyes", "body", 72),
  t("red eyes", "body", 78),
  t("golden eyes", "body", 62),
  t("heterochromia", "body", 48),
  t("detailed eyes", "body", 82),
  t("mature female", "body", 74),
  t("mature body", "body", 66),
  t("adult", "body", 70),
  t("muscular", "body", 58),
  t("slim", "body", 54),
  t("tall", "body", 46),
  t("freckles", "body", 40),
  t("smile", "body", 88),
  t("smirk", "body", 60),
  t("serious", "body", 54),
  t("blush", "body", 76),
  t("closed eyes", "body", 58),
  t("open mouth", "body", 66),

  // --- pose ----------------------------------------------------------------
  t("hand on hip", "composition", 72),
  t("hands on hips", "composition", 70),
  t("arms crossed", "composition", 64),
  t("sitting", "composition", 80),
  t("standing", "composition", 86),
  t("lying", "composition", 58),
  t("walking", "composition", 62),
  t("running", "composition", 50),
  t("jumping", "composition", 44),
  t("leaning forward", "composition", 46),
  t("crossed legs", "composition", 48),
  t("outstretched arm", "composition", 42),

  // --- clothing ------------------------------------------------------------
  t("dress", "clothing", 90),
  t("school uniform", "clothing", 88),
  t("serafuku", "clothing", 66),
  t("business suit", "clothing", 62),
  t("jacket", "clothing", 78),
  t("dark jacket", "clothing", 52),
  t("leather jacket", "clothing", 56),
  t("hoodie", "clothing", 70),
  t("t-shirt", "clothing", 74),
  t("shirt", "clothing", 84),
  t("skirt", "clothing", 86),
  t("pleated skirt", "clothing", 68),
  t("shorts", "clothing", 66),
  t("jeans", "clothing", 60),
  t("thighhighs", "clothing", 82),
  t("pantyhose", "clothing", 64),
  t("boots", "clothing", 74),
  t("high heels", "clothing", 68),
  t("gloves", "clothing", 76),
  t("elbow gloves", "clothing", 54),
  t("armor", "clothing", 60),
  t("cape", "clothing", 52),
  t("hat", "clothing", 70),
  t("glasses", "clothing", 72),
  t("scarf", "clothing", 50),
  t("bodysuit", "clothing", 58),
  t("superhero costume", "clothing", 44),
  t("kimono", "clothing", 56),
  t("hair ornament", "clothing", 74),
  t("jewelry", "clothing", 62),
  t("earrings", "clothing", 60),

  // --- scene ---------------------------------------------------------------
  t("simple background", "scene", 90),
  t("white background", "scene", 76),
  t("gradient background", "scene", 58),
  t("detailed background", "scene", 72),
  t("outdoors", "scene", 84),
  t("indoors", "scene", 78),
  t("cityscape", "scene", 66),
  t("city street", "scene", 62),
  t("cyberpunk city", "scene", 58),
  t("night", "scene", 74),
  t("day", "scene", 60),
  t("sunset", "scene", 64),
  t("beach", "scene", 62),
  t("ocean", "scene", 56),
  t("forest", "scene", 60),
  t("mountains", "scene", 48),
  t("rain", "scene", 54),
  t("snow", "scene", 50),
  t("cherry blossoms", "scene", 58),
  t("classroom", "scene", 52),
  t("cafe", "scene", 46),
  t("bedroom", "scene", 48),
  t("rooftop", "scene", 44),
  t("space", "scene", 40),
  t("ruins", "scene", 38),
  t("floating particles", "scene", 52),
  t("sparkle", "scene", 50),
  t("wind", "scene", 42),
];

const TAG_INDEX = new Map<string, Tag>(TAGS.map((tag) => [tag.name, tag]));

export function findTag(name: string): Tag | undefined {
  return TAG_INDEX.get(name.toLowerCase().trim());
}

/** Prefix-first, then substring; ties broken by curated weight. */
export function searchTags(query: string, limit = 12): Tag[] {
  const q = query.toLowerCase().trim();
  if (!q) return [];
  const scored: { tag: Tag; score: number }[] = [];
  for (const tag of TAGS) {
    const name = tag.name.toLowerCase();
    let score = -1;
    if (name.startsWith(q)) score = 1000 + tag.weight;
    else if (name.includes(q)) score = 500 + tag.weight;
    else if (tag.alias?.some((a) => a.includes(q))) score = 250 + tag.weight;
    else if (name.split(" ").some((w) => w.startsWith(q))) score = 400 + tag.weight;
    if (score > 0) scored.push({ tag, score });
  }
  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, limit).map((s) => s.tag);
}

/* ------------------------------------------------------------------ */
/* Prompt Helper                                                       */
/* ------------------------------------------------------------------ */

/**
 * Natural-language phrases mapped to the tag vocabulary the Illustrious family
 * was trained on. Ordering matters: longer phrases are matched first so
 * "young woman" wins over "woman".
 */
const LEXICON: [RegExp, string][] = [
  [/\b(?:a\s+)?young\s+wom(?:a|e)n\b|\byoung\s+lady\b/gi, "1girl, solo, mature female"],
  [/\b(?:a\s+)?wom(?:a|e)n\b|\bfemale\b|\bgirl\b|女性|女の子/gi, "1girl, solo"],
  [/\b(?:a\s+)?m(?:a|e)n\b|\bmale\b|\bguy\b|男性|男の子/gi, "1boy, solo"],
  [/\bwalking\b|歩(?:い|く)/gi, "walking"],
  [/\brunning\b|走/gi, "running"],
  [/\bsitting\b|座/gi, "sitting"],
  [/\bstanding\b|立/gi, "standing"],
  [/\bon the beach\b|\bat the beach\b|ビーチ|砂浜/gi, "beach, ocean, outdoors"],
  [/\bin the city\b|\bcity street\b|街|都市/gi, "cityscape, city street, outdoors"],
  [/\bcyberpunk\b|サイバーパンク/gi, "cyberpunk city, neon lights, night"],
  [/\bin the forest\b|森/gi, "forest, outdoors, dappled sunlight"],
  [/\bat sunset\b|\bsunset\b|夕焼け|夕暮れ/gi, "sunset, golden hour, outdoors"],
  [/\bat night\b|\bnight\b|夜/gi, "night, moonlight"],
  [/\braining\b|\bin the rain\b|雨/gi, "rain, wet, reflective ground"],
  [/\bsnow(?:ing|y)?\b|雪/gi, "snow, winter"],
  [/\bsmiling\b|\bsmile\b|笑顔/gi, "smile, looking at viewer"],
  [/\bserious\b|真剣/gi, "serious, closed mouth"],
  [/\bclose[- ]?up\b|アップ/gi, "close-up, portrait"],
  [/\bfull body\b|全身/gi, "full body"],
  [/\bupper body\b|上半身/gi, "upper body"],
  [/\bfrom behind\b|後ろ/gi, "from behind"],
  [/\bfrom above\b|俯瞰/gi, "from above"],
  [/\blong hair\b|ロングヘア/gi, "long hair"],
  [/\bshort hair\b|ショートヘア/gi, "short hair"],
  [/\bblue hair\b|青(?:い)?髪/gi, "blue hair"],
  [/\bblonde\b|金髪/gi, "blonde hair"],
  [/\bred hair\b|赤(?:い)?髪/gi, "red hair"],
  [/\bblack hair\b|黒髪/gi, "black hair"],
  [/\bbrown hair\b|茶髪/gi, "brown hair"],
  [/\bwhite hair\b|白髪/gi, "white hair"],
  [/\bblue eyes\b|青い目/gi, "blue eyes"],
  [/\bred eyes\b|赤い目/gi, "red eyes"],
  [/\bwearing a dress\b|\bin a dress\b|ドレス/gi, "dress"],
  [/\bschool uniform\b|制服/gi, "school uniform"],
  [/\bsuit\b|スーツ/gi, "business suit"],
  [/\bjacket\b|ジャケット/gi, "jacket"],
  [/\barmor\b|鎧/gi, "armor"],
  [/\bkimono\b|着物/gi, "kimono"],
  [/\bglasses\b|眼鏡|メガネ/gi, "glasses"],
  [/\bsuperhero(?:ine)?\b|ヒーロー|ヒロイン/gi, "superhero costume, dynamic pose"],
  [/\bcinematic\b|映画/gi, "cinematic lighting, dramatic lighting"],
  [/\bphotoreal(?:istic)?\b|\bphoto\b|写真/gi, "photorealistic, realistic, film grain"],
  [/\banime\b|アニメ/gi, "anime screencap, cel shading"],
  [/\bwatercolou?r\b|水彩/gi, "watercolor, traditional media"],
  [/\bportrait\b|ポートレート/gi, "portrait, upper body, depth of field"],
  [/\bdetailed\b|\bhigh detail\b|精密/gi, "ultra detailed, intricate details"],
  [/\bsimple background\b|シンプルな背景/gi, "simple background"],
];

export interface PromptSuggestion {
  prompt: string;
  added: string[];
  kept: string;
}

/**
 * Rewrites free-form description into a comma-separated tag prompt.
 * Recognised phrases become tags; anything left over is kept verbatim so the
 * user never silently loses intent.
 */
export function naturalLanguageToTags(input: string): PromptSuggestion {
  const original = input.trim();
  if (!original) return { prompt: "", added: [], kept: "" };

  let remainder = ` ${original} `;
  const added: string[] = [];

  for (const [pattern, tags] of LEXICON) {
    pattern.lastIndex = 0;
    if (pattern.test(remainder)) {
      pattern.lastIndex = 0;
      remainder = remainder.replace(pattern, " ");
      for (const tag of tags.split(",").map((s) => s.trim())) {
        if (tag && !added.includes(tag)) added.push(tag);
      }
    }
  }

  // Whatever the lexicon did not consume: strip filler, keep the nouns.
  const kept = remainder
    .replace(/\b(?:a|an|the|of|with|and|is|are|in|on|at|to|her|his|their|its|that|this|very)\b/gi, " ")
    .replace(/[.,!?;:]+/g, " ")
    // Japanese particles and punctuation are separators, not content.
    .replace(/[\u3001\u3002\uFF0C\uFF0E\u30FB\u300C\u300D\uFF08\uFF09]+/g, " ")
    .split(/\s+/)
    .map((word) =>
      // Trim the kana that glue a Japanese phrase together, keeping the kanji
      // or katakana core: "のような照明" becomes "照明".
      word.replace(/^[\u3040-\u309F]+/, "").replace(/[\u3040-\u309F]+$/, ""),
    )
    .filter((word) => word.length > 1 || /[A-Za-z0-9\u4E00-\u9FFF]/.test(word))
    .filter(Boolean)
    .join(" ")
    .trim();

  const parts = [...added];
  if (kept) parts.push(kept);

  return { prompt: parts.join(", "), added, kept };
}
