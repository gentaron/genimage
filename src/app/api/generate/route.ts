import { NextResponse } from "next/server";
import { RequestError, submit } from "@/lib/engine";
import type { GenerationRequest } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  let body: Partial<GenerationRequest>;
  try {
    body = (await request.json()) as Partial<GenerationRequest>;
  } catch {
    return NextResponse.json({ error: "Expected a JSON body." }, { status: 400 });
  }

  try {
    const job = await submit(body, request.signal);
    // 200 even for a failed job: the request itself succeeded, and the job
    // record carries the error so the browser can show it in place.
    return NextResponse.json({ job });
  } catch (error) {
    if (error instanceof RequestError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    console.error("[generate]", error);
    return NextResponse.json(
      { error: `Could not start the job: ${(error as Error).message}` },
      { status: 500 },
    );
  }
}
