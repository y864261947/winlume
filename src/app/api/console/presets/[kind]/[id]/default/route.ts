import { consoleError, consoleJson, requireConsoleContext } from "@/lib/console/server";
import { parsePresetKind, setConsolePresetDefault } from "@/lib/console/presets";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(
  _request: Request,
  context: { params: Promise<{ kind: string; id: string }> },
) {
  try {
    const { kind, id } = await context.params;
    const preset = await setConsolePresetDefault(await requireConsoleContext(), parsePresetKind(kind), id);
    return consoleJson({ preset });
  } catch (error) {
    return consoleError(error);
  }
}
