import { describe, it, expect, vi } from "vitest";
import {
  parseSseDataPayload,
  parseSseBody,
  createSseLineParser,
  streamGatewayChat,
  type ChatChunk,
} from "./gateway";

function textChunks(chunks: ChatChunk[]): string[] {
  return chunks.filter((c): c is Extract<ChatChunk, { kind: "text" }> => c.kind === "text").map((c) => c.text);
}

describe("parseSseDataPayload", () => {
  it("parses a content delta", () => {
    const data = JSON.stringify({
      id: "chatcmpl-1",
      choices: [{ index: 0, delta: { content: "你好" }, finish_reason: null }],
    });
    expect(parseSseDataPayload(data)).toEqual([{ kind: "text", text: "你好" }]);
  });

  it("returns empty for [DONE]", () => {
    expect(parseSseDataPayload("[DONE]")).toEqual([]);
  });

  it("maps JSON error objects", () => {
    const data = JSON.stringify({ error: { message: "quota exceeded" } });
    expect(parseSseDataPayload(data)).toEqual([
      { kind: "error", message: "quota exceeded" },
    ]);
  });

  it("emits tool_call_delta from function stream fragments", () => {
    const data = JSON.stringify({
      choices: [
        {
          delta: {
            tool_calls: [
              {
                index: 0,
                id: "call_1",
                function: { name: "search", arguments: '{"q"' },
              },
            ],
          },
        },
      ],
    });
    expect(parseSseDataPayload(data)).toEqual([
      {
        kind: "tool_call_delta",
        id: "call_1",
        name: "search",
        argumentsDelta: '{"q"',
      },
    ]);
  });
});

describe("parseSseBody / createSseLineParser", () => {
  const fixtureTwoChunks = [
    'data: {"id":"c1","choices":[{"index":0,"delta":{"content":"Hello"},"finish_reason":null}]}',
    "",
    'data: {"id":"c1","choices":[{"index":0,"delta":{"content":" world"},"finish_reason":null}]}',
    "",
    'data: {"id":"c1","choices":[{"index":0,"delta":{},"finish_reason":"stop"}]}',
    "",
    "data: [DONE]",
    "",
  ].join("\n");

  it("parses a fixture string of two SSE text chunks", () => {
    const chunks = parseSseBody(fixtureTwoChunks);
    expect(textChunks(chunks)).toEqual(["Hello", " world"]);
    expect(chunks.every((c) => c.kind === "text")).toBe(true);
  });

  it("handles partial network frames across push() calls", () => {
    const parser = createSseLineParser();
    const a = parser.push('data: {"choices":[{"delta":{"content":"Hel');
    expect(a).toEqual([]);
    const b = parser.push('lo"}}]}\n');
    expect(b).toEqual([{ kind: "text", text: "Hello" }]);
    const c = parser.push(
      'data: {"choices":[{"delta":{"content":"!"},"finish_reason":"stop"}]}\n\ndata: [DONE]\n',
    );
    expect(c).toEqual([{ kind: "text", text: "!" }]);
    expect(parser.flush()).toEqual([]);
  });

  it("accepts CRLF line endings", () => {
    const body =
      'data: {"choices":[{"delta":{"content":"A"}}]}\r\n\r\ndata: {"choices":[{"delta":{"content":"B"}}]}\r\n';
    expect(textChunks(parseSseBody(body))).toEqual(["A", "B"]);
  });
});

describe("streamGatewayChat", () => {
  it("POSTs to gateway and yields text from a mock SSE body", async () => {
    const sse = [
      'data: {"choices":[{"delta":{"content":"Hi"},"finish_reason":null}]}',
      "",
      'data: {"choices":[{"delta":{"content":"!"},"finish_reason":"stop"}]}',
      "",
      "data: [DONE]",
      "",
    ].join("\n");

    const fetchImpl = vi.fn(async () => {
      return new Response(sse, {
        status: 200,
        headers: { "content-type": "text/event-stream" },
      });
    });

    const out: ChatChunk[] = [];
    for await (const chunk of streamGatewayChat({
      model: "gpt-4o-mini",
      messages: [{ role: "user", content: "ping" }],
      token: "test-token",
      userId: "42",
      baseUrl: "https://gateway.test",
      fetchImpl: fetchImpl as unknown as typeof fetch,
    })) {
      out.push(chunk);
    }

    expect(textChunks(out)).toEqual(["Hi", "!"]);
    expect(fetchImpl).toHaveBeenCalledOnce();
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://gateway.test/v1/chat/completions");
    expect(init.method).toBe("POST");
    const headers = init.headers as Record<string, string>;
    expect(headers.Authorization).toBe("Bearer test-token");
    expect(headers["New-Api-User"]).toBe("42");
    const body = JSON.parse(String(init.body)) as {
      model: string;
      stream: boolean;
      messages: unknown[];
    };
    expect(body.model).toBe("gpt-4o-mini");
    expect(body.stream).toBe(true);
    expect(body.messages).toEqual([{ role: "user", content: "ping" }]);
  });

  it("yields error for non-OK JSON bodies", async () => {
    const fetchImpl = vi.fn(async () => {
      return new Response(JSON.stringify({ error: { message: "invalid api key" } }), {
        status: 401,
        headers: { "content-type": "application/json" },
      });
    });

    const out: ChatChunk[] = [];
    for await (const chunk of streamGatewayChat({
      model: "gpt-4o-mini",
      messages: [{ role: "user", content: "x" }],
      baseUrl: "https://gateway.test",
      fetchImpl: fetchImpl as unknown as typeof fetch,
    })) {
      out.push(chunk);
    }

    expect(out).toEqual([{ kind: "error", message: "invalid api key" }]);
  });

  it("handles non-stream JSON success bodies", async () => {
    const fetchImpl = vi.fn(async () => {
      return new Response(
        JSON.stringify({
          choices: [{ message: { role: "assistant", content: "full reply" } }],
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      );
    });

    const out: ChatChunk[] = [];
    for await (const chunk of streamGatewayChat({
      model: "gpt-4o-mini",
      messages: [{ role: "user", content: "x" }],
      baseUrl: "https://gateway.test",
      fetchImpl: fetchImpl as unknown as typeof fetch,
    })) {
      out.push(chunk);
    }

    expect(out).toEqual([{ kind: "text", text: "full reply" }]);
  });
});
