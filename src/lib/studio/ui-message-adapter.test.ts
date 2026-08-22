import { describe, expect, it } from "vitest";
import {
  messageToStudioUIMessage,
  messagesToStudioUIMessage,
} from "./ui-message-adapter";

describe("durable StudioUIMessage hydration", () => {
  it("filters tool receipt rows and rebuilds assistant tool parts", () => {
    const messages = [
      {
        id: "u1",
        sessionId: "s1",
        role: "user" as const,
        content: "做一下",
        createdAt: "2026-01-01",
      },
      {
        id: "a1",
        sessionId: "s1",
        role: "assistant" as const,
        content: "",
        toolCalls: [{ id: "call-1", name: "read_artifact", arguments: '{"id":"a1"}' }],
        createdAt: "2026-01-01",
      },
      {
        id: "t1",
        sessionId: "s1",
        role: "tool" as const,
        toolCallId: "call-1",
        content: '{"summary":"读取成功"}',
        createdAt: "2026-01-01",
      },
    ];

    const hydrated = messagesToStudioUIMessage(messages);
    expect(hydrated).toHaveLength(2);
    expect(hydrated[1]?.parts).toContainEqual(
      expect.objectContaining({
        type: "dynamic-tool",
        toolName: "read_artifact",
        toolCallId: "call-1",
        state: "output-available",
      }),
    );
  });

  it("preserves durable parts instead of flattening them", () => {
    const message = {
      id: "a1",
      sessionId: "s1",
      role: "assistant" as const,
      content: "完成",
      parts: [
        { type: "reasoning" as const, text: "分析中" },
        { type: "text" as const, text: "完成" },
        {
          type: "data-plan" as const,
          id: "plan" as const,
          data: { todos: [{ id: "t1", content: "整理内容", status: "completed" as const }] },
        },
      ],
      createdAt: "2026-01-01",
    };

    const hydrated = messageToStudioUIMessage(message);
    expect(hydrated?.parts).toEqual(message.parts);
  });

  it("returns null for a standalone persisted tool receipt", () => {
    expect(
      messageToStudioUIMessage({
        id: "tool-1",
        sessionId: "s1",
        role: "tool",
        content: "raw receipt",
        createdAt: "2026-01-01",
      }),
    ).toBeNull();
  });
});
