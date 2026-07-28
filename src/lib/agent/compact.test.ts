import { describe, expect, it } from "vitest";
import { compactMessagesForGateway, groupMessageBlocks } from "./compact";
import type { Message } from "./types";

function m(
  partial: Partial<Message> & Pick<Message, "id" | "role" | "content">,
): Message {
  return {
    sessionId: "s1",
    createdAt: new Date().toISOString(),
    ...partial,
  };
}

describe("groupMessageBlocks", () => {
  it("keeps tool chain together", () => {
    const messages: Message[] = [
      m({ id: "u1", role: "user", content: "hi" }),
      m({
        id: "a1",
        role: "assistant",
        content: "",
        toolCalls: [{ id: "c1", name: "list_artifacts", arguments: "{}" }],
      }),
      m({ id: "t1", role: "tool", content: "[]", toolCallId: "c1" }),
      m({ id: "a2", role: "assistant", content: "done" }),
    ];
    const blocks = groupMessageBlocks(messages);
    expect(blocks).toHaveLength(3);
    expect(blocks[1]).toHaveLength(2);
  });
});

describe("compactMessagesForGateway", () => {
  it("no-ops when under limit", () => {
    const messages = [m({ id: "1", role: "user", content: "a" })];
    expect(compactMessagesForGateway(messages, { maxMessages: 10 })).toBe(
      messages,
    );
  });

  it("inserts summary and keeps recent", () => {
    const messages: Message[] = [];
    for (let i = 0; i < 40; i++) {
      messages.push(m({ id: `u${i}`, role: "user", content: `q${i}` }));
      messages.push(
        m({ id: `a${i}`, role: "assistant", content: `ans${i}` }),
      );
    }
    const out = compactMessagesForGateway(messages, {
      maxMessages: 20,
      keepRecent: 10,
      sessionId: "s1",
    });
    expect(out[0]?.role).toBe("system");
    expect(out[0]?.content).toContain("system-reminder");
    expect(out.length).toBeLessThan(messages.length);
    expect(out[out.length - 1]?.content).toContain("ans");
  });
});
