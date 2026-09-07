import { NextResponse } from "next/server";
import { cancel } from "@/lib/engine";
import { deleteJob, getJob } from "@/lib/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

export async function GET(_request: Request, { params }: Params) {
  const { id } = await params;
  const job = await getJob(id);
  if (!job) return NextResponse.json({ error: "No such job." }, { status: 404 });
  return NextResponse.json({ job });
}

/** `?action=cancel` stops a running job; the default removes it and its images. */
export async function DELETE(request: Request, { params }: Params) {
  const { id } = await params;
  const action = new URL(request.url).searchParams.get("action");

  if (action === "cancel") {
    const cancelled = await cancel(id);
    return NextResponse.json({ cancelled });
  }

  const removed = await deleteJob(id);
  if (!removed) return NextResponse.json({ error: "No such job." }, { status: 404 });
  return NextResponse.json({ deleted: true });
}
