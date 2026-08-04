import { NextRequest, NextResponse } from "next/server";
import { getCurrentUserId } from "@/lib/auth/session";
import {
  listProductionPacks,
  listProductionPacksForScene,
  toProductionPackMeta,
} from "@/lib/agent/production-packs/registry";
import { resolveProductionPackAvailability } from "@/lib/agent/production-packs/availability";
import { loadCapabilityCatalog } from "@/lib/studio/capabilities.server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const userId = await getCurrentUserId();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const scene = request.nextUrl.searchParams.get("scene")?.trim();
  const [packs, capabilityCatalog] = await Promise.all([
    scene ? listProductionPacksForScene(scene) : listProductionPacks(),
    loadCapabilityCatalog(),
  ]);

  return NextResponse.json({
    packs: packs.map((pack) => ({
      ...toProductionPackMeta(pack),
      availability: resolveProductionPackAvailability(pack, capabilityCatalog),
    })),
  });
}
