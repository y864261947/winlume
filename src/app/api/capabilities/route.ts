import { loadCapabilityCatalog } from "@/lib/studio/capabilities.server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const catalog = await loadCapabilityCatalog();
  return Response.json(catalog, {
    headers: { "Cache-Control": "no-store" },
  });
}
