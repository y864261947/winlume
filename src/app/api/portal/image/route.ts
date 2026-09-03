import { NextRequest, NextResponse } from "next/server";
import { getPortalImage } from "@/lib/portal/content-config";

export const dynamic = "force-dynamic";

/** Serve managed portal images separately so the content JSON stays small. */
export async function GET(request: NextRequest) {
  const section = request.nextUrl.searchParams.get("section") ?? "";
  const id = request.nextUrl.searchParams.get("id") ?? "";
  const image = await getPortalImage(section, id);
  if (!image) return new NextResponse("Not found", { status: 404 });
  return new NextResponse(new Uint8Array(image.data), {
    headers: {
      "content-type": image.mimeType,
      "cache-control": "public, max-age=3600, stale-while-revalidate=86400",
      etag: `"${section}-${id}-${request.nextUrl.searchParams.get("v") ?? "current"}"`,
    },
  });
}
