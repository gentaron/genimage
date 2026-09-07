import { NextResponse } from "next/server";
import { checkPrompt } from "@/lib/safety";
import { naturalLanguageToTags } from "@/lib/tags";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Prompt Helper. Rewrites a natural-language description into the Danbooru-style
 * tag prompt the Illustrious family expects.
 *
 * Set `PROMPT_HELPER_URL` (any OpenAI-compatible chat completions endpoint) and
 * `PROMPT_HELPER_KEY` to route this through an LLM instead; the rule-based
 * lexicon is the fallback and needs no credentials.
 */

const LLM_URL = process.env.PROMPT_HELPER_URL ?? "";
const LLM_KEY = process.env.PROMPT_HELPER_KEY ?? "";
const LLM_MODEL = process.env.PROMPT_HELPER_MODEL ?? "gpt-4o-mini";

const SYSTEM_PROMPT =
  "You rewrite image descriptions into Danbooru-style tag prompts for anime SDXL checkpoints. " +
  "Reply with a single comma-separated line of lowercase tags, most important first. " +
  "No prose, no quality tags, no explanation. Never describe minors in a sexual context.";

async function viaLlm(text: string, signal: AbortSignal): Promise<string | null> {
  if (!LLM_URL || !LLM_KEY) return null;
  try {
    const res = await fetch(LLM_URL, {
      method: "POST",
      signal,
      headers: { "content-type": "application/json", authorization: `Bearer ${LLM_KEY}` },
      body: JSON.stringify({
        model: LLM_MODEL,
        temperature: 0.4,
        max_tokens: 300,
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: text },
        ],
      }),
    });
    if (!res.ok) return null;
    const json = (await res.json()) as { choices?: { message?: { content?: string } }[] };
    const content = json.choices?.[0]?.message?.content?.trim();
    return content ? content.replace(/^["'`]|["'`]$/g, "") : null;
  } catch {
    return null;
  }
}

export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as { text?: string };
  const text = String(body.text ?? "").trim();
  if (!text) return NextResponse.json({ error: "Nothing to expand." }, { status: 400 });
  if (text.length > 2000) return NextResponse.json({ error: "That is too long to expand." }, { status: 400 });

  const safety = checkPrompt(text);
  if (!safety.ok) return NextResponse.json({ error: safety.reason }, { status: 400 });

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 20_000);
  try {
    const llm = await viaLlm(text, controller.signal);
    if (llm) {
      const verdict = checkPrompt(llm);
      // Never hand back a model-written prompt that fails the same gate.
      if (verdict.ok) return NextResponse.json({ prompt: llm, source: "llm" });
    }
  } finally {
    clearTimeout(timer);
  }

  const suggestion = naturalLanguageToTags(text);
  return NextResponse.json({ prompt: suggestion.prompt, added: suggestion.added, source: "lexicon" });
}
