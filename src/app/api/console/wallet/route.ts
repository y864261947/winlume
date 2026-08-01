import { consoleError, consoleJson, getConsoleWalletDetails, requireConsoleContext } from "@/lib/console/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    return consoleJson(await getConsoleWalletDetails(await requireConsoleContext()));
  } catch (error) {
    return consoleError(error);
  }
}
