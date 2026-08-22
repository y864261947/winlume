import { describe, expect, it, vi } from "vitest";
import { streamAiSdkGatewayChat, toAiSdkMessages } from "./ai-sdk";
import type { ChatChunk } from "./gateway";

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

describe("streamAiSdkGatewayChat auth", () => {
  it("ignores userId/internalToken and legacy env vars, sending only the Authorization bearer token", async () => {
    vi.stubEnv("REIZO_AUTH_MODE", "reizo");
    vi.stubEnv("NEW_API_URL", "https://retired-new-api.example");
    vi.stubEnv("REIZO_GATEWAY_TOKEN", "retired-token");
    vi.stubEnv("REIZO_GATEWAY_INTERNAL_TOKEN", "retired-internal-token");
    vi.stubEnv("REIZO_SERVICE_KEY", "wl_service_native");
    const fetchImpl = vi.fn(async () => new Response("data: [DONE]\n\n", {
      status: 200,
      headers: { "content-type": "text/event-stream" },
    }));

    const chunks: ChatChunk[] = [];
    for await (const chunk of streamAiSdkGatewayChat({
      model: "gpt-4o-mini",
      messages: [{ role: "user", content: "x" }],
      userId: "user-1",
      internalToken: "studio-secret",
      baseUrl: "https://gateway.test",
      chatPath: "/v1/chat/completions",
      fetchImpl: fetchImpl as unknown as typeof fetch,
    })) {
      chunks.push(chunk);
    }
    void chunks;

    expect(fetchImpl).toHaveBeenCalled();
    const [, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    const headers = new Headers(init.headers as HeadersInit);
    expect(headers.get("Authorization")).toBe("Bearer wl_service_native");
    expect(headers.get("New-Api-User")).toBeNull();
    expect(headers.get("x-reizo-internal-token")).toBeNull();
    expect(headers.get("x-reizo-internal-user-id")).toBeNull();
    vi.unstubAllEnvs();
  });

  it("forwards reasoning effort and maps gateway reasoning_content to thinking", async () => {
    const response = [
      'data: {"id":"chatcmpl-1","choices":[{"index":0,"delta":{"reasoning_content":"先分析约束","content":"这是最终答案"},"finish_reason":null}]}',
      "",
      'data: {"id":"chatcmpl-1","choices":[{"index":0,"delta":{},"finish_reason":"stop"}]}',
      "",
      "data: [DONE]",
      "",
    ].join("\n");
    const fetchImpl = vi.fn(async () => new Response(response, {
      status: 200,
      headers: { "content-type": "text/event-stream" },
    }));
    const chunks: ChatChunk[] = [];

    for await (const chunk of streamAiSdkGatewayChat({
      model: "gpt-5.4",
      messages: [{ role: "user", content: "x" }],
      reasoningEffort: "medium",
      baseUrl: "https://gateway.test",
      chatPath: "/v1/chat/completions",
      fetchImpl: fetchImpl as unknown as typeof fetch,
    })) {
      chunks.push(chunk);
    }

    expect(chunks).toEqual([
      { kind: "thinking", text: "先分析约束" },
      { kind: "text", text: "这是最终答案" },
    ]);
    const [, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect(JSON.parse(String(init.body))).toMatchObject({
      reasoning_effort: "medium",
    });
  });
});
