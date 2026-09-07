import { NextResponse } from "next/server";
import { saveUpload } from "@/lib/images";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_BYTES = 12 * 1024 * 1024;
const ALLOWED = new Set(["image/png", "image/jpeg", "image/webp"]);

export async function POST(request: Request) {
  const form = await request.formData().catch(() => null);
  const file = form?.get("image");

  if (!(file instanceof File)) {
    return NextResponse.json({ error: "Attach an image under the field name 'image'." }, { status: 400 });
  }
  if (file.size > MAX_BYTES) {
    return NextResponse.json({ error: "Reference images are limited to 12 MB." }, { status: 413 });
  }
  if (!ALLOWED.has(file.type)) {
    return NextResponse.json({ error: "PNG, JPEG or WebP only." }, { status: 415 });
  }

  const bytes = new Uint8Array(await file.arrayBuffer());

  // Trust the magic bytes rather than the declared content type.
  const isPng = bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47;
  const isJpeg = bytes[0] === 0xff && bytes[1] === 0xd8;
  const isWebp = bytes[8] === 0x57 && bytes[9] === 0x45 && bytes[10] === 0x42 && bytes[11] === 0x50;
  if (!isPng && !isJpeg && !isWebp) {
    return NextResponse.json({ error: "That file is not a PNG, JPEG or WebP image." }, { status: 415 });
  }

  try {
    const id = await saveUpload(bytes, file.type);
    return NextResponse.json({ id, size: bytes.length, mimeType: file.type });
  } catch (error) {
    console.error("[upload]", error);
    return NextResponse.json(
      { error: `Could not store the reference image: ${(error as Error).message}` },
      { status: 500 },
    );
  }
}
