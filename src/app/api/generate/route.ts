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
    const job = await submit(body);
    return NextResponse.json({ job }, { status: 202 });
  } catch (error) {
    if (error instanceof RequestError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    console.error("[generate]", error);
    return NextResponse.json(
      { error: `Could not queue the job: ${(error as Error).message}` },
      { status: 500 },
    );
  }
}
