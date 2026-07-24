import { describe, expect, it } from "vitest";
import { toGatewayMessages } from "./runtime";
import type { Message } from "./types";

describe("toGatewayMessages", () => {
  it("includes system, user, assistant, tool rounds", () => {
    const history: Message[] = [
      {
        id: "u1",
        sessionId: "s",
        role: "user",
        content: "写大纲并保存",
        createdAt: "t1",
      },
      {
        id: "a1",
        sessionId: "s",
        role: "assistant",
        content: "",
        toolCalls: [
          {
            id: "call_1",
            name: "write_artifact",
            arguments: '{"name":"x","kind":"markdown","content":"# hi"}',
          },
        ],
        createdAt: "t2",
      },
      {
        id: "t1",
        sessionId: "s",
        role: "tool",
        content: '{"id":"art1"}',
        toolCallId: "call_1",
        createdAt: "t3",
      },
      {
        id: "a2",
        sessionId: "s",
        role: "assistant",
        content: "已保存",
        createdAt: "t4",
      },
    ];

    const msgs = toGatewayMessages("BASE", history);
    expect(msgs[0]).toEqual({ role: "system", content: "BASE" });
    expect(msgs[1]).toMatchObject({ role: "user", content: "写大纲并保存" });
    expect(msgs[2]).toMatchObject({
      role: "assistant",
      tool_calls: [
        {
          id: "call_1",
          type: "function",
          function: { name: "write_artifact" },
        },
      ],
    });
    expect(msgs[3]).toEqual({
      role: "tool",
      tool_call_id: "call_1",
      content: '{"id":"art1"}',
    });
    expect(msgs[4]).toEqual({ role: "assistant", content: "已保存" });
  });

  it("skips tool messages without toolCallId", () => {
    const history: Message[] = [
      {
        id: "t1",
        sessionId: "s",
        role: "tool",
        content: "orphan",
        createdAt: "t",
      },
    ];
    expect(toGatewayMessages("S", history)).toEqual([
      { role: "system", content: "S" },
    ]);
  });
});
