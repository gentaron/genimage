import { findImage, readOutput } from "@/lib/store";

export const runtime = "nodejs";

type Params = { params: Promise<{ id: string }> };

export async function GET(request: Request, { params }: Params) {
  const { id } = await params;
  const image = await findImage(id);
  if (!image) return new Response("Not found", { status: 404 });

  const bytes = await readOutput(image);
  if (!bytes) return new Response("Not found", { status: 404 });

  const download = new URL(request.url).searchParams.has("download");
  const extension = image.mimeType.split("/")[1] ?? "png";

  return new Response(new Uint8Array(bytes), {
    headers: {
      "content-type": image.mimeType,
      "content-length": String(bytes.length),
      // Image ids are content-addressed by creation, so the bytes never change.
      "cache-control": "public, max-age=31536000, immutable",
      ...(download
        ? { "content-disposition": `attachment; filename="genimage-${image.seed}.${extension}"` }
        : {}),
    },
  });
}
