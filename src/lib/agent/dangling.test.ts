import { describe, expect, it } from "vitest";
import {
  buildRepairToolMessages,
  findDanglingToolCalls,
} from "./dangling";
import type { Message } from "./types";

function msg(partial: Partial<Message> & Pick<Message, "id" | "role">): Message {
  return {
    sessionId: "s1",
    content: "",
    createdAt: new Date().toISOString(),
    ...partial,
  };
}

describe("findDanglingToolCalls", () => {
  it("detects missing tool results", () => {
    const messages: Message[] = [
      msg({
        id: "a1",
        role: "assistant",
        content: "",
        toolCalls: [
          { id: "c1", name: "write_artifact", arguments: "{}" },
          { id: "c2", name: "todo_write", arguments: "{}" },
        ],
      }),
      msg({
        id: "t1",
        role: "tool",
        content: "ok",
        toolCallId: "c1",
      }),
    ];
    expect(findDanglingToolCalls(messages)).toEqual([
      { id: "c2", name: "todo_write" },
    ]);
  });

  it("returns empty when all paired", () => {
    const messages: Message[] = [
      msg({
        id: "a1",
        role: "assistant",
        toolCalls: [{ id: "c1", name: "list_artifacts", arguments: "{}" }],
      }),
      msg({ id: "t1", role: "tool", toolCallId: "c1", content: "[]" }),
    ];
    expect(findDanglingToolCalls(messages)).toEqual([]);
  });
});

describe("buildRepairToolMessages", () => {
  it("emits tool role messages for each dangling id", () => {
    const repairs = buildRepairToolMessages(
      "s1",
      [{ id: "c9", name: "write_artifact" }],
      "cancelled",
    );
    expect(repairs).toHaveLength(1);
    expect(repairs[0]?.role).toBe("tool");
    expect(repairs[0]?.toolCallId).toBe("c9");
    expect(repairs[0]?.content).toContain("cancelled");
  });
});
