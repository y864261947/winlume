type ChatRole = "assistant" | "user" | "system" | "tool";

/**
 * Tool rounds are durable assistant records, but adjacent assistant records
 * are one continuous response from the user's perspective.
 */
export function showsMessageAvatar(
  messages: readonly { role: ChatRole }[],
  index: number,
): boolean {
  const message = messages[index];
  if (!message) return false;
  return message.role !== "assistant" || messages[index - 1]?.role !== "assistant";
}
