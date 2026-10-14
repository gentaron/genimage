import { availableProviders, writeCopy, type ProviderId } from "@/lib/ai";

export const maxDuration = 60;

const MAX_INPUT = 40_000;
const IDS: ProviderId[] = ["claude", "gemini", "pollinations"];

/** Which AI copywriters this deployment can use. */
export async function GET() {
  return Response.json({ providers: availableProviders() });
}

export async function POST(req: Request) {
  let text = "";
  let prefer: ProviderId | undefined;
  try {
    const body = (await req.json()) as { text?: unknown; provider?: unknown };
    text = typeof body.text === "string" ? body.text.trim() : "";
    if (IDS.includes(body.provider as ProviderId)) prefer = body.provider as ProviderId;
  } catch {
    return Response.json({ error: "JSON body expected" }, { status: 400 });
  }
  if (!text) return Response.json({ error: "text is empty" }, { status: 400 });
  if (text.length > MAX_INPUT) {
    return Response.json({ error: `text is longer than ${MAX_INPUT} characters` }, { status: 413 });
  }

  try {
    return Response.json(await writeCopy(text, prefer));
  } catch (error) {
    // The browser falls back to its offline extractor on any non-200.
    return Response.json({ error: error instanceof Error ? error.message : "AI unavailable" }, { status: 503 });
  }
}
