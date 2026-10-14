/**
 * The free AI copywriters, tried in order until one answers:
 *
 *   Gemini       GEMINI_API_KEY               free tier (Google AI Studio key)
 *   Pollinations nothing                        free, keyless
 *
 * Paid services are deliberately not supported.
 *
 * Every one returns the same ThumbCopy; the browser's offline extractor is
 * the last resort when all of them fail.
 */
import { z } from "zod";
import { LIMITS, sanitizeCopy, type ThumbCopy } from "./copy";

export type ProviderId = "gemini" | "pollinations";

export const PROVIDER_LABEL: Record<ProviderId, string> = {
  gemini: "Gemini(無料枠)",
  pollinations: "Pollinations(無料)",
};

const Copy = z.object({
  main: z.string().describe(`見出し。記事の名前かSEOキーワード。最大${LIMITS.main}文字。2行に分けたい位置があれば \\n を1つだけ入れる`),
  sub: z.string().describe(`補足の一言(数字・ベネフィット)。最大${LIMITS.sub}文字。不要なら空文字`),
  tags: z.array(z.string()).describe(`検索されやすい短いキーワード0〜3個。各${LIMITS.tag}文字以内。見出しと重複させない`),
  comment: z.string().describe(`ミナ・エウレカ本人の主観的な感想セリフ。一人称の話し言葉で最大${LIMITS.comment}文字`),
});

export const SYSTEM = `あなたはブログサムネイル(1280×670)に載せる文字だけを考えるコピーライター。
感想セリフの話し手は、超巨大都市ギガポリスを拠点にするブロガー兼思想家「ミナ・エウレカ」(29歳)。
テーマは「ひらめきを真剣に生きる」。座右の銘は「来た、見た、勝った」。人生は主観で決まると考え、遊び心と真剣さを両方持つ。
落ち着いた大人の女性で、親しい年下に話すような面倒見のいい口調(〜だよ、〜だと思う、〜してみて)。自分を「姉」とは呼ばない。

ルール:
- 文字は少なく、強く。画像内の文字は SEO キーワード重視。紹介している物・人・作品・サービスの名前や特徴だけを拾う。
- メディア名・ブランド名(Genesis Vault など)やサイト名・著者名は絶対に入れない。
- 見出しは記事の主題そのもの。煽り文句より検索語を優先。
- 感想セリフは要約ではなくエウレカ自身の主観・評価・ひらめき。主観性を最重要視する。断定的でいい。
- 絵文字、ハッシュタグ記号、カギカッコで囲むことはしない。
- 入力と同じ言語で書く(基本は日本語)。`;

/** Spelled-out schema for the providers that only get a "reply in JSON" switch. */
const JSON_SPEC = `出力は次の形の JSON オブジェクトだけ。説明文やコードブロックは付けない。
{"main": "見出し(最大${LIMITS.main}文字、2行にするなら\\nを1つ)", "sub": "補足(最大${LIMITS.sub}文字、不要なら空文字)", "tags": ["キーワード(各${LIMITS.tag}文字以内、0〜3個)"], "comment": "エウレカの主観セリフ(最大${LIMITS.comment}文字)"}`;

const userPrompt = (text: string) => `次の文章からサムネイルの文字を作って。\n\n<article>\n${text}\n</article>`;

const TIMEOUT_MS = 40_000;

/** Pulls the first JSON object out of a free-form reply and validates it. */
function parseCopy(raw: string): ThumbCopy {
  const start = raw.indexOf("{");
  const end = raw.lastIndexOf("}");
  if (start < 0 || end <= start) throw new Error("no JSON in reply");
  const parsed = Copy.safeParse(JSON.parse(raw.slice(start, end + 1)));
  if (!parsed.success) throw new Error("reply did not match the schema");
  return parsed.data;
}

async function gemini(text: string): Promise<ThumbCopy> {
  const model = process.env.GEMINI_MODEL || "gemini-flash-latest";
  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`,
    {
      method: "POST",
      headers: { "content-type": "application/json", "x-goog-api-key": process.env.GEMINI_API_KEY ?? "" },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: `${SYSTEM}\n\n${JSON_SPEC}` }] },
        contents: [{ role: "user", parts: [{ text: userPrompt(text) }] }],
        generationConfig: { responseMimeType: "application/json", temperature: 0.9 },
      }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    },
  );
  if (!res.ok) throw new Error(`Gemini ${res.status}`);
  const data = (await res.json()) as {
    candidates?: { content?: { parts?: { text?: string }[] } }[];
  };
  const reply = data.candidates?.[0]?.content?.parts?.map((p) => p.text ?? "").join("") ?? "";
  return parseCopy(reply);
}

async function pollinations(text: string): Promise<ThumbCopy> {
  const headers: Record<string, string> = { "content-type": "application/json" };
  const res = await fetch(process.env.POLLINATIONS_URL || "https://text.pollinations.ai/openai", {
    method: "POST",
    headers,
    body: JSON.stringify({
      model: process.env.POLLINATIONS_MODEL || "openai",
      messages: [
        { role: "system", content: `${SYSTEM}\n\n${JSON_SPEC}` },
        { role: "user", content: userPrompt(text) },
      ],
      response_format: { type: "json_object" },
      referrer: "eureka-thumb",
      private: true,
    }),
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (!res.ok) throw new Error(`Pollinations ${res.status}`);
  const body = await res.text();
  // OpenAI-shaped reply normally; some models answer with the bare JSON.
  try {
    const data = JSON.parse(body) as { choices?: { message?: { content?: string } }[] };
    const content = data.choices?.[0]?.message?.content;
    if (content) return parseCopy(content);
  } catch {
    /* fall through to treating the body as the reply */
  }
  return parseCopy(body);
}

const RUNNERS: Record<ProviderId, (text: string) => Promise<ThumbCopy>> = { gemini, pollinations };

export function availableProviders(): ProviderId[] {
  const list: ProviderId[] = [];
  if (process.env.GEMINI_API_KEY) list.push("gemini");
  if (process.env.POLLINATIONS_DISABLED !== "1") list.push("pollinations");
  return list;
}

export interface WriteResult {
  copy: ThumbCopy;
  source: ProviderId;
  /** Providers that were tried first and failed, with why. */
  skipped: string[];
}

/** Runs `prefer` first if given, then the rest of the chain. */
export async function writeCopy(text: string, prefer?: ProviderId): Promise<WriteResult> {
  const chain = availableProviders();
  if (prefer && chain.includes(prefer)) chain.sort((a, b) => (a === prefer ? -1 : b === prefer ? 1 : 0));
  const skipped: string[] = [];
  for (const id of chain) {
    try {
      const copy = sanitizeCopy(await RUNNERS[id](text));
      if (!copy.main && !copy.comment) throw new Error("empty copy");
      return { copy, source: id, skipped };
    } catch (error) {
      const reason = error instanceof Error ? error.message : "error";
      skipped.push(`${PROVIDER_LABEL[id]}: ${reason}`);
    }
  }
  throw new AggregateError(skipped, skipped.join(" / ") || "no AI provider is enabled");
}
