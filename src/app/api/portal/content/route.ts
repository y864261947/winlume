import { NextResponse } from "next/server";
import { getPublicPortalContent } from "@/lib/portal/content-config";

export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json(await getPublicPortalContent(), { headers: { "cache-control": "public, max-age=60, stale-while-revalidate=300" } });
}
