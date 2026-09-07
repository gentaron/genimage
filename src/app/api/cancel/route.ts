import { NextResponse } from "next/server";
import { abandon } from "@/lib/engine";
import type { Job } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Stops a pending job on the backend that is running it. */
export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as { job?: Job };
  if (!body.job?.provider) {
    return NextResponse.json({ error: "Expected a job." }, { status: 400 });
  }
  await abandon(body.job, request.signal);
  return NextResponse.json({ cancelled: true });
}
