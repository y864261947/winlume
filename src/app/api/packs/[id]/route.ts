import { NextRequest, NextResponse } from "next/server";
import { getCurrentUserId } from "@/lib/auth/session";
import {
  getProductionPack,
  toProductionPackMeta,
} from "@/lib/agent/production-packs/registry";
import { resolveProductionPackAvailability } from "@/lib/agent/production-packs/availability";
import { loadCapabilityCatalog } from "@/lib/studio/capabilities.server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type IdContext = { params: Promise<{ id: string }> };

export async function GET(_request: NextRequest, context: IdContext) {
  const userId = await getCurrentUserId();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await context.params;
  const pack = await getProductionPack(id);
  if (!pack) {
    return NextResponse.json({ error: "Pack not found" }, { status: 404 });
  }

  const capabilityCatalog = await loadCapabilityCatalog();
  return NextResponse.json({
    pack: {
      ...toProductionPackMeta(pack),
      availability: resolveProductionPackAvailability(pack, capabilityCatalog),
    },
  });
}
