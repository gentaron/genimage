import { NextResponse } from "next/server";
import { searchTags } from "@/lib/tags";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const query = new URL(request.url).searchParams.get("q") ?? "";
  return NextResponse.json({ tags: searchTags(query, 10) });
}
