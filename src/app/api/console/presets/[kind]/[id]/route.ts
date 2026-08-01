import { consoleError, consoleJson, requireConsoleContext } from "@/lib/console/server";
import {
  deleteConsolePreset,
  parsePresetKind,
  updateConsolePreset,
} from "@/lib/console/presets";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function PATCH(
  request: Request,
  context: { params: Promise<{ kind: string; id: string }> },
) {
  try {
    const { kind, id } = await context.params;
    const preset = await updateConsolePreset(
      await requireConsoleContext(),
      parsePresetKind(kind),
      id,
      await request.json(),
    );
    return consoleJson({ preset });
  } catch (error) {
    return consoleError(error);
  }
}

export async function DELETE(
  _request: Request,
  context: { params: Promise<{ kind: string; id: string }> },
) {
  try {
    const { kind, id } = await context.params;
    await deleteConsolePreset(await requireConsoleContext(), parsePresetKind(kind), id);
    return consoleJson({ ok: true });
  } catch (error) {
    return consoleError(error);
  }
}
