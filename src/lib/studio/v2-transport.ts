/**
 * Pure request-shaping for `useStudioChatV2`'s `DefaultChatTransport`,
 * pulled out of the hook so it's testable without mounting React/`useChat` —
 * the part of Phase 3 most worth verifying automatically, since nothing
 * here can be exercised by a browser click-through either (it's what
 * produces the fetch call, not what renders after it).
 */

type UIMessageLike = {
  id: string;
  role?: string;
  parts?: Array<{ type: string; text?: string }>;
};

function messageText(message: UIMessageLike | undefined): string {
  return (message?.parts ?? [])
    .filter((p): p is { type: "text"; text: string } => p.type === "text" && typeof p.text === "string")
    .map((p) => p.text)
    .join("");
}

export function extractLastMessageText(messages: UIMessageLike[]): string {
  return messageText(messages[messages.length - 1]);
}

/**
 * The session page's layout effect may have already synchronously painted a
 * `pending-user-${sessionId}` bubble (readHandoffBootstrap, before any React
 * effect runs) for the exact same handed-off text. Returns that bubble's id
 * so `prepare()` can reuse it instead of appending a second, duplicate one —
 * undefined when there's nothing to reuse.
 */
export function findReusableOptimisticUserMessageId(
  prev: UIMessageLike[],
  text: string,
): string | undefined {
  const last = prev[prev.length - 1];
  if (last?.role === "user" && last.id.startsWith("pending-user-") && messageText(last) === text) {
    return last.id;
  }
  return undefined;
}

export function buildSendRequestBody(
  sessionId: string,
  messages: UIMessageLike[],
  overrideBody: Record<string, unknown> | undefined,
): { sessionId: string; message: string; [key: string]: unknown } {
  return {
    sessionId,
    message: extractLastMessageText(messages),
    ...(overrideBody ?? {}),
  };
}

/**
 * DefaultChatTransport doesn't send an idempotency-key on its own. Without
 * one, a retried request (flaky connection, browser back-forward cache
 * revive) joins a fresh run instead of the still-active one from the first
 * attempt — route.ts's activeRun 409 branch keys off this exact header.
 * Keyed off the user message's own id so retries of the *same* send share
 * one key, while a genuinely new message gets a new one.
 */
export function buildIdempotencyHeaders(
  messages: UIMessageLike[],
  fallbackMessageId: string | undefined,
): { "idempotency-key": string } | undefined {
  const key = messages[messages.length - 1]?.id ?? fallbackMessageId;
  return key ? { "idempotency-key": key } : undefined;
}

export function buildReconnectApi(runId: string | null): string {
  if (!runId) {
    throw new Error("No active run to reconnect to");
  }
  return `/api/runs/${runId}/stream`;
}
