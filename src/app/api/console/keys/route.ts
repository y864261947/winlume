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
    const organizations = await listConsoleOrganizations(context);
    const requested = new URL(request.url).searchParams.get("organizationId") || null;
    const platformUser = requested ? null : await context.repositories.users.findById(context.userId);
    const currentOrganizationId = platformUser?.currentOrganizationId ?? null;
    const organizationId = requested
      ?? (currentOrganizationId && organizations.some((organization) => organization.id === currentOrganizationId)
        ? currentOrganizationId
        : organizations[0]?.id ?? null);
    if (organizationId) {
      await requireConsoleOrganization(context, organizationId);
    }
    const keys = organizationId ? await listConsoleApiKeys(context, organizationId) : [];
    return consoleJson({ keys, organizations, organizationId });
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
