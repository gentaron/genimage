import { readOutput } from "@/lib/images";

export const runtime = "nodejs";

type Params = { params: Promise<{ id: string }> };

export async function GET(request: Request, { params }: Params) {
  const { id } = await params;
  const image = await readOutput(id);
  if (!image) return new Response("Not found", { status: 404 });

  const download = new URL(request.url).searchParams.has("download");
  const extension = image.mimeType.split("/")[1] ?? "png";

  return new Response(new Uint8Array(image.bytes), {
    headers: {
      "content-type": image.mimeType,
      "content-length": String(image.bytes.length),
      // Ids are minted per image, so the bytes behind one never change.
      "cache-control": "public, max-age=31536000, immutable",
      ...(download
        ? { "content-disposition": `attachment; filename="genimage-${id}.${extension}"` }
        : {}),
    },
  });
}
