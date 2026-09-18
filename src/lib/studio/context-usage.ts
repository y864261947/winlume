import type { StudioUIMessage } from "./ui-message-adapter";

/**
 * A deliberately model-independent text heuristic, not provider usage:
 * roughly four ASCII characters or one non-ASCII code point per token.
 * Summing before rounding keeps text-part boundaries from inflating the count.
 */
export function estimateConversationTextTokens(
  messages: readonly StudioUIMessage[],
): number | null {
  let started = false;
  let tokenUnits = 0;
  for (const message of messages) {
    if (message.role !== "user" && message.role !== "assistant") continue;
    if (message.role === "user") started = true;
    for (const part of message.parts) {
      if (part.type !== "text") continue;
      for (const character of part.text) {
        tokenUnits += character.codePointAt(0)! <= 0x7f ? 1 : 4;
      }
    }
  }
  // Null means no conversation; zero can mean an image/tool-only conversation.
  return started ? Math.ceil(tokenUnits / 4) : null;
}

export function formatEstimatedTextTokens(tokens: number): string {
  return new Intl.NumberFormat("en", {
    notation: "compact",
    maximumFractionDigits: 1,
  }).format(tokens);
}
