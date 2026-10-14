/**
 * Offline copywriter. Used when no ANTHROPIC_API_KEY is configured or the API
 * call fails: pulls SEO keywords out of the text by frequency and position,
 * and gives Eureka a line from a set of first-person reactions.
 */
import { LIMITS, sanitizeCopy, stripBanned, type ThumbCopy } from "./copy";

const STOP = new Set([
  "自分", "今回", "以下", "以上", "場合", "必要", "本当", "記事", "可能", "部分", "全部", "結果",
  "問題", "理由", "内容", "最初", "最後", "一番", "感じ", "意味", "状態", "実際", "今日", "毎日",
  "時間", "人間", "世界", "自身", "他人", "全て", "方法", "簡単", "大切", "重要", "紹介", "解説",
  "一つ", "二つ", "三つ", "何か", "誰か", "同時", "普通", "基本", "具体", "特徴", "参考", "一方",
  "the", "and", "for", "with", "this", "that", "from", "you", "your", "are", "was", "but", "not",
  "have", "has", "can", "will", "about", "into", "more", "what", "how", "why", "when", "then",
  "https", "http", "www", "com",
]);

const TOKEN =
  /[ァ-ヴー]{2,}(?:[・=][ァ-ヴー]{2,})*|[一-龠々〆ヵヶ]{2,}|[A-Za-z][A-Za-z0-9.+#'-]*[A-Za-z0-9+#]|\d+(?:\.\d+)?(?:つ|選|個|%|％|倍|万円|円|年|日|分|時間|ステップ|STEP)/g;

function firstLine(text: string): string {
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.replace(/^#+\s*/, "").replace(/^title\s*[:：]\s*/i, "").trim();
    if (line) return line;
  }
  return "";
}

interface Scored {
  word: string;
  score: number;
}

export function keywords(text: string): Scored[] {
  const clean = stripBanned(text);
  const head = firstLine(clean);
  const counts = new Map<string, Scored>();
  const add = (w: string, bonus: number) => {
    const key = w.toLowerCase();
    if (STOP.has(key) || STOP.has(w)) return;
    if (/^ー+$/.test(w)) return;
    const cur = counts.get(key) ?? { word: w, score: 0 };
    cur.score += 1 + bonus;
    counts.set(key, cur);
  };
  for (const m of head.matchAll(TOKEN)) add(m[0], 4);
  for (const m of clean.matchAll(TOKEN)) add(m[0], 0);
  // Words the author put in brackets are what they meant to stress.
  for (const m of clean.matchAll(/[「『【〈《]([^」』】〉》\n]{2,12})[」』】〉》]/g)) add(m[1].trim(), 2);

  return [...counts.values()]
    .map((s) => ({ ...s, score: s.score * (1 + Math.min(Array.from(s.word).length, 8) / 8) }))
    .sort((a, b) => b.score - a.score);
}

const REACTIONS: ((kw: string) => string)[] = [
  (k) => `${k}、正直かなり刺さった`,
  (k) => `私は${k}、断然アリ派`,
  (k) => `${k}って、思ってたより深い`,
  (k) => `これは${k}を見る目が変わる`,
  (k) => `${k}、知らないと損だと思う`,
  () => `ここ、本気で見落としがち`,
  () => `読んだ瞬間、ひらめいた`,
  () => `この発想、私は好きだな`,
  () => `正直、ここが一番アツい`,
  () => `今すぐ試したくなった！`,
];

export function reaction(kw: string, seed: number): string {
  const short = Array.from(kw).length <= 8 ? kw : "";
  const pool = short ? REACTIONS : REACTIONS.slice(5);
  const line = pool[Math.abs(seed) % pool.length](short);
  return Array.from(line).length <= LIMITS.comment ? line : REACTIONS[6]("");
}

export function extractLocal(text: string, seed = 0): ThumbCopy {
  const ranked = keywords(text);
  const words = ranked.map((r) => r.word);
  const head = stripBanned(firstLine(text))
    .replace(/[【\[][^】\]]*[】\]]/g, "")
    .replace(/[。.!！?？]+$/, "")
    .trim();
  const headLen = Array.from(head).length;

  let main: string;
  if (headLen >= 4 && headLen <= LIMITS.main) main = head;
  else if (words.length >= 2 && Array.from(words[0] + words[1]).length <= 14) main = `${words[0]}×${words[1]}`;
  else main = words[0] ?? "ひらめき";

  const flat = main.replace(/\s/g, "");
  const tags = words.filter((w) => !flat.includes(w) && Array.from(w).length <= LIMITS.tag).slice(0, 3);

  // A bracketed prefix like 【保存版】 makes a good strap line.
  const bracket = firstLine(text).match(/[【\[]([^】\]]{2,12})[】\]]/);
  const sub = bracket ? bracket[1] : "";

  const topic = words.find((w) => w !== sub) ?? "";
  return sanitizeCopy({ main, sub, tags, comment: reaction(topic, seed) });
}
