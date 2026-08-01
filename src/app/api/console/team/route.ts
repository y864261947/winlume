import { consoleError, consoleJson, requireConsoleContext } from "@/lib/console/server";
import { addConsoleTeamMember, getConsoleTeam } from "@/lib/console/team";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const organizationId = new URL(request.url).searchParams.get("organizationId");
    return consoleJson(await getConsoleTeam(await requireConsoleContext(), organizationId));
  } catch (error) {
    return consoleError(error);
  }
}

export async function POST(request: Request) {
  try {
    const context = await requireConsoleContext();
    const body = await request.json();
    const member = await addConsoleTeamMember(context, body);
    return consoleJson({ member }, { status: 201 });
  } catch (error) {
    return consoleError(error);
  }
}
