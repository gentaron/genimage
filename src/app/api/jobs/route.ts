import { NextResponse } from "next/server";
import { queueDepth } from "@/lib/engine";
import { countJobs, listJobs } from "@/lib/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const limit = Math.min(100, Math.max(1, Number(url.searchParams.get("limit") ?? 24)));
  const offset = Math.max(0, Number(url.searchParams.get("offset") ?? 0));

  const [jobs, total] = await Promise.all([listJobs(limit, offset), countJobs()]);
  return NextResponse.json({ jobs, total, queueDepth: queueDepth() });
}
