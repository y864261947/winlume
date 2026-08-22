import { loadCapabilityCatalog } from "@/lib/studio/capabilities.server";
import { getCurrentUserId } from "@/lib/auth/session";
import { resolveStudioToken } from "@/lib/agent/provider/studio-token";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  let authToken: string | undefined;
  const userId = await getCurrentUserId();
  if (userId) {
    try {
      authToken = await resolveStudioToken(userId);
    } catch {
      // The public catalog can still fall back to the server-level probe.
    }
  }
  const catalog = await loadCapabilityCatalog(authToken ? { authToken } : {});
  return Response.json(catalog, {
    headers: { "Cache-Control": "no-store" },
  });
}
