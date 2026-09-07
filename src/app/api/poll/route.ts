import { NextResponse } from "next/server";
import { advance } from "@/lib/engine";
import type { Job } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Advances running jobs.
 *
 * The browser owns its history, so it posts the jobs it is waiting on and gets
 * updated records back. Nothing in the body is trusted except the signed
 * handle, which is verified before any upstream call is made.
 */
export async function POST(request: Request) {
  let body: { jobs?: Job[] };
  try {
    body = (await request.json()) as { jobs?: Job[] };
  } catch {
    return NextResponse.json({ error: "Expected a JSON body." }, { status: 400 });
  }

  const jobs = Array.isArray(body.jobs) ? body.jobs.slice(0, 8) : [];
  if (jobs.length === 0) return NextResponse.json({ jobs: [] });

  const updated = await Promise.all(
    jobs.map(async (job) => {
      try {
        return await advance(job, request.signal);
      } catch (error) {
        console.error("[poll]", error);
        return {
          ...job,
          status: "failed" as const,
          error: `Polling failed: ${(error as Error).message}`,
          finishedAt: Date.now(),
        };
      }
    }),
  );

  return NextResponse.json({ jobs: updated });
}
