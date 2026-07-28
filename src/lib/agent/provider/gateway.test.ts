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

import { generateImage } from "./gateway";

describe("generateImage", () => {
  it("posts to /v1/images/generations and decodes a b64_json result", async () => {
    const fetchImpl = vi.fn(async () =>
      new Response(
        JSON.stringify({ data: [{ b64_json: Buffer.from("hello").toString("base64") }] }),
        { status: 200, headers: { "content-type": "application/json" } },
      ),
    );

    const result = await generateImage({
      prompt: "a red fox",
      size: "1024x1024",
      n: 1,
      token: "test-token",
      baseUrl: "https://gw.test",
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });

    expect(result).toEqual([{ bytes: Buffer.from("hello"), mimeType: "image/png" }]);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://gw.test/v1/images/generations");
    expect(init.method).toBe("POST");
    expect((init.headers as Record<string, string>).Authorization).toBe("Bearer test-token");
    const body = JSON.parse(init.body as string);
    expect(body).toEqual({
      model: "gpt-image-2",
      prompt: "a red fox",
      size: "1024x1024",
      n: 1,
    });
  });

  it("fetches image bytes when the API returns a url instead of b64_json", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ data: [{ url: "https://cdn.test/img.png" }] }), {
          status: 200,
          headers: { "content-type": "application/json" },
        }),
      )
      .mockResolvedValueOnce(
        new Response(new Uint8Array([1, 2, 3]), {
          status: 200,
          headers: { "content-type": "image/webp" },
        }),
      );

    const result = await generateImage({
      prompt: "a red fox",
      size: "1024x1024",
      n: 1,
      token: "test-token",
      baseUrl: "https://gw.test",
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });

    expect(result).toEqual([{ bytes: Buffer.from([1, 2, 3]), mimeType: "image/webp" }]);
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    expect(fetchImpl.mock.calls[1]?.[0]).toBe("https://cdn.test/img.png");
  });

  it("posts multipart to /v1/images/edits when sourceImage is set", async () => {
    const fetchImpl = vi.fn(async () =>
      new Response(
        JSON.stringify({ data: [{ b64_json: Buffer.from("edited").toString("base64") }] }),
        { status: 200, headers: { "content-type": "application/json" } },
      ),
    );

    await generateImage({
      prompt: "make the sky purple",
      size: "1024x1024",
      n: 1,
      token: "test-token",
      baseUrl: "https://gw.test",
      fetchImpl: fetchImpl as unknown as typeof fetch,
      sourceImage: { bytes: Buffer.from("orig"), mimeType: "image/png" },
    });

    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://gw.test/v1/images/edits");
    expect(init.body).toBeInstanceOf(FormData);
    const form = init.body as FormData;
    expect(form.get("prompt")).toBe("make the sky purple");
    expect(form.get("size")).toBe("1024x1024");
    expect(form.get("image")).toBeInstanceOf(Blob);
    // Content-Type must be left unset so fetch can add the multipart boundary itself.
    expect((init.headers as Record<string, string>)["Content-Type"]).toBeUndefined();
  });

  it("throws with the gateway's error message on a non-ok response", async () => {
    const fetchImpl = vi.fn(async () =>
      new Response(JSON.stringify({ error: { message: "quota exceeded" } }), {
        status: 429,
      }),
    );

    await expect(
      generateImage({
        prompt: "a red fox",
        size: "1024x1024",
        n: 1,
        token: "test-token",
        baseUrl: "https://gw.test",
        fetchImpl: fetchImpl as unknown as typeof fetch,
      }),
    ).rejects.toThrow("quota exceeded");
  });
});
