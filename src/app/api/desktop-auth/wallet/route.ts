import { consoleError, consoleJson } from "@/lib/console/server";
import { createDesktopTopup, readDesktopWallet } from "@/lib/platform/desktop-wallet";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET(request: Request) {
  try { return consoleJson(await readDesktopWallet(request)); } catch (error) { return consoleError(error); }
}
export async function POST(request: Request) {
  try { return consoleJson(await createDesktopTopup(request), { status: 201 }); } catch (error) { return consoleError(error); }
}
