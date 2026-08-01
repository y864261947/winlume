import { consoleError, consoleJson, requireConsoleContext } from "@/lib/console/server";
import { createConsolePreset, getConsolePresets } from "@/lib/console/presets";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const organizationId = new URL(request.url).searchParams.get("organizationId");
    return consoleJson(await getConsolePresets(await requireConsoleContext(), organizationId));
  } catch (error) {
    return consoleError(error);
  }
}

export async function POST(request: Request) {
  try {
    const result = await createConsolePreset(await requireConsoleContext(), await request.json());
    return consoleJson(result, { status: 201 });
  } catch (error) {
    return consoleError(error);
  }
}
