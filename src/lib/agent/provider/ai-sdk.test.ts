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
    vi.stubEnv("WINLUME_AUTH_MODE", "winlume");
    vi.stubEnv("NEW_API_URL", "https://retired-new-api.example");
    vi.stubEnv("WINLUME_GATEWAY_TOKEN", "retired-token");
    vi.stubEnv("WINLUME_GATEWAY_INTERNAL_TOKEN", "retired-internal-token");
    vi.stubEnv("WINLUME_SERVICE_KEY", "wl_service_native");
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
    expect(headers.get("x-winlume-internal-token")).toBeNull();
    expect(headers.get("x-winlume-internal-user-id")).toBeNull();
    vi.unstubAllEnvs();
  });
});
