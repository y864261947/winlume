import {
  consoleError,
  consoleJson,
  ensureOrganizationKeyManager,
  listConsoleApiKeys,
  mapConsoleApiKey,
  parseConsoleKeyInput,
  requireConsoleContext,
} from "@/lib/console/server";
import { listConsoleOrganizations, requireConsoleOrganization } from "@/lib/console/workspace";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const context = await requireConsoleContext();
    const organizationId = new URL(request.url).searchParams.get("organizationId") || null;
    if (organizationId) {
      // Throws 403/404 if the caller isn't a member of this organization.
      await requireConsoleOrganization(context, organizationId);
    }
    const [keys, organizations] = await Promise.all([
      listConsoleApiKeys(context, organizationId),
      listConsoleOrganizations(context),
    ]);
    return consoleJson({ keys, organizations });
  } catch (error) {
    return consoleError(error);
  }
}

export async function POST(request: Request) {
  try {
    const context = await requireConsoleContext();
    // organizationId is required (design §5.3/§5.4): only org-scoped virtual keys exist.
    const input = parseConsoleKeyInput(await request.json());
    const selected = await requireConsoleOrganization(context, input.organizationId);
    ensureOrganizationKeyManager(selected.membership.role);
    const { record, plaintext } = await context.repositories.apiKeys.create({
      userId: context.userId,
      organizationId: input.organizationId,
      name: input.name,
      expiresAt: input.expiresAt,
      allowedModels: input.allowedModels,
      ipAllowlist: input.ipAllowlist,
    });
    return consoleJson({ key: mapConsoleApiKey(record), secret: plaintext }, { status: 201 });
  } catch (error) {
    return consoleError(error);
  }
}
