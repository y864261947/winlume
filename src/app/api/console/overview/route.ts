import { consoleError, consoleJson, getConsoleOverview, requireConsoleContext } from "@/lib/console/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    return consoleJson(await getConsoleOverview(await requireConsoleContext()));
  } catch (error) {
    return consoleError(error);
  }
}
