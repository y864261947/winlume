import { NextResponse } from "next/server";
import { getPortalContent } from "@/lib/portal/content-config";

export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json(await getPortalContent(), { headers: { "cache-control": "no-store" } });
}
