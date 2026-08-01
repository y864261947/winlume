import { ConsoleRequestError, consoleError, consoleJson, mapConsoleApiKey, requireConsoleContext } from "@/lib/console/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function DELETE(_request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params;
    const requestContext = await requireConsoleContext();
    const key = await requestContext.repositories.apiKeys.findById(id);
    if (!key || key.userId !== requestContext.userId) {
      throw new ConsoleRequestError("未找到该 API Key。", 404, "api_key_not_found");
    }
    const revoked = await requestContext.repositories.apiKeys.revoke(id);
    if (!revoked) throw new ConsoleRequestError("未找到该 API Key。", 404, "api_key_not_found");
    return consoleJson({ key: mapConsoleApiKey(revoked) });
  } catch (error) {
    return consoleError(error);
  }
}
