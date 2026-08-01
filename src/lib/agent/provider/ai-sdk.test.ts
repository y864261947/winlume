import { describe, expect, it } from "vitest";
import { toAiSdkMessages } from "./ai-sdk";

describe("AI SDK gateway adapter", () => {
  it("preserves tool call names across assistant and tool messages", () => {
    const messages = toAiSdkMessages([
      { role: "system", content: "system" },
      { role: "user", content: "write something" },
      {
        role: "assistant",
        content: "working",
        tool_calls: [
          {
            id: "call-1",
            type: "function",
            function: {
              name: "write_artifact",
              arguments: '{"name":"Draft"}',
            },
          },
        ],
      },
      { role: "tool", tool_call_id: "call-1", content: "saved" },
    ]);

    expect(messages[0]).toEqual({ role: "system", content: "system" });
    expect(messages[2]).toMatchObject({
      role: "assistant",
      content: [
        { type: "text", text: "working" },
        {
          type: "tool-call",
          toolCallId: "call-1",
          toolName: "write_artifact",
          input: { name: "Draft" },
        },
      ],
    });
    expect(messages[3]).toMatchObject({
      role: "tool",
      content: [
        {
          type: "tool-result",
          toolCallId: "call-1",
          toolName: "write_artifact",
        },
      ],
    });
  });

  it("uses an empty object for malformed historical tool JSON", () => {
    const messages = toAiSdkMessages([
      {
        role: "assistant",
        tool_calls: [
          {
            id: "bad-call",
            type: "function",
            function: { name: "read_artifact", arguments: "{" },
          },
        ],
      },
    ]);

    expect(messages[0]).toMatchObject({
      content: [{ type: "tool-call", input: {} }],
    });
  });
});
