import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import { z } from "zod";
import { LIMITS, sanitizeCopy } from "@/lib/copy";

export const maxDuration = 60;

const MODEL = process.env.THUMB_MODEL || "claude-opus-5-5";
const MAX_INPUT = 40_000;

const Copy = z.object({
  main: z.string().describe(`見出し。記事の名前かSEOキーワード。最大${LIMITS.main}文字。2行に分けたい位置があれば \\n を1つだけ入れる`),
  sub: z.string().describe(`補足の一言(数字・ベネフィット)。最大${LIMITS.sub}文字。不要なら空文字`),
  tags: z.array(z.string()).describe(`検索されやすい短いキーワード0〜3個。各${LIMITS.tag}文字以内。見出しと重複させない`),
  comment: z.string().describe(`ミナ・エウレカ本人の主観的な感想セリフ。一人称の話し言葉で最大${LIMITS.comment}文字`),
});

const SYSTEM = `あなたはブログサムネイル(1280×670)に載せる文字だけを考えるコピーライター。
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

export async function POST(req: Request) {
  let text = "";
  try {
    const body = (await req.json()) as { text?: unknown };
    text = typeof body.text === "string" ? body.text.trim() : "";
  } catch {
    return Response.json({ error: "JSON body expected" }, { status: 400 });
  }
  if (!text) return Response.json({ error: "text is empty" }, { status: 400 });
  if (text.length > MAX_INPUT) {
    return Response.json({ error: `text is longer than ${MAX_INPUT} characters` }, { status: 413 });
  }

  // No credentials configured: tell the browser to use its offline extractor.
  if (!process.env.ANTHROPIC_API_KEY && !process.env.ANTHROPIC_AUTH_TOKEN) {
    return Response.json({ error: "ANTHROPIC_API_KEY is not set" }, { status: 503 });
  }

  const client = new Anthropic();
  try {
    const response = await client.beta.messages.parse({
      model: MODEL,
      max_tokens: 16000,
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      output_config: { effort: "low", format: betaZodOutputFormat(Copy) },
      system: SYSTEM,
      messages: [
        {
          role: "user",
          content: `次の文章からサムネイルの文字を作って。\n\n<article>\n${text}\n</article>`,
        },
      ],
    });

    if (response.stop_reason === "refusal" || !response.parsed_output) {
      return Response.json({ error: "the model returned no usable copy" }, { status: 502 });
    }
    return Response.json({ copy: sanitizeCopy(response.parsed_output), source: "claude" });
  } catch (error) {
    if (error instanceof Anthropic.AuthenticationError) {
      return Response.json({ error: "Anthropic API key was rejected" }, { status: 503 });
    }
    if (error instanceof Anthropic.RateLimitError) {
      return Response.json({ error: "rate limited, try again shortly" }, { status: 429 });
    }
    if (error instanceof Anthropic.APIError) {
      return Response.json({ error: `Anthropic API error ${error.status}` }, { status: 502 });
    }
    return Response.json({ error: "could not reach the Anthropic API" }, { status: 502 });
  }
}
