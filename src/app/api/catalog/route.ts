import { NextResponse } from "next/server";
import { ASPECT_RATIOS, CHECKPOINTS, LORAS, SAMPLERS, SCHEDULERS } from "@/lib/catalog";
import { BOOSTERS } from "@/lib/prompt";
import { providerStatuses } from "@/lib/providers";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const force = new URL(request.url).searchParams.has("refresh");
  const providers = await providerStatuses(force);

  return NextResponse.json({
    checkpoints: CHECKPOINTS,
    loras: LORAS,
    aspectRatios: ASPECT_RATIOS,
    boosters: BOOSTERS,
    samplers: SAMPLERS,
    schedulers: SCHEDULERS,
    providers,
  });
}
