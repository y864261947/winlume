import { consoleError, consoleJson, requireConsoleContext } from "@/lib/console/server";
import { parseTeamOrganizationId, removeConsoleTeamMember, updateConsoleTeamMember } from "@/lib/console/team";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function PATCH(
  request: Request,
  context: { params: Promise<{ userId: string }> },
) {
  try {
    const { userId } = await context.params;
    const member = await updateConsoleTeamMember(await requireConsoleContext(), userId, await request.json());
    return consoleJson({ member });
  } catch (error) {
    return consoleError(error);
  }
}

export async function DELETE(
  request: Request,
  context: { params: Promise<{ userId: string }> },
) {
  try {
    const { userId } = await context.params;
    const organizationId = new URL(request.url).searchParams.get("organizationId");
    await removeConsoleTeamMember(await requireConsoleContext(), userId, parseTeamOrganizationId(organizationId));
    return consoleJson({ ok: true });
  } catch (error) {
    return consoleError(error);
  }
}
