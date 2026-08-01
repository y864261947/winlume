import {
  consoleError,
  consoleJson,
  listConsoleApiKeys,
  mapConsoleApiKey,
  parseConsoleKeyInput,
  requireConsoleContext,
} from "@/lib/console/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    return consoleJson({ keys: await listConsoleApiKeys(await requireConsoleContext()) });
  } catch (error) {
    return consoleError(error);
  }
}

export async function POST(request: Request) {
  try {
    const context = await requireConsoleContext();
    const input = parseConsoleKeyInput(await request.json());
    const { record, plaintext } = await context.repositories.apiKeys.create({
      userId: context.userId,
      name: input.name,
      expiresAt: input.expiresAt,
      quotaLimitMicrocredits: input.quotaLimitMicrocredits,
      allowedModels: input.allowedModels,
      ipAllowlist: input.ipAllowlist,
    });
    return consoleJson({ key: mapConsoleApiKey(record), secret: plaintext }, { status: 201 });
  } catch (error) {
    return consoleError(error);
  }
}
