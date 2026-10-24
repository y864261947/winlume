import { consoleError } from "@/lib/console/server";
import { desktopCashier } from "@/lib/platform/desktop-wallet";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET(request: Request) {
  try { return await desktopCashier(request); } catch (error) { return consoleError(error); }
}
