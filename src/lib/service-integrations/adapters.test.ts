import { describe, expect, it, vi } from "vitest";
import { callProvider } from "./adapters";
import { DEFAULT_SERVICE_OPTIONS as options } from "./catalog";

describe("direct service adapters", () => {
  it("uses Tavily's actual search endpoint and reports credits", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(Response.json({ results: [{ title: "result", url: "https://example.com" }], usage: { credits: 1 } }));
    const result = await callProvider("tavily", "private-key", options, "query", fetcher);
    expect(result.usage).toBe("1 credits");
    expect(fetcher).toHaveBeenCalledWith("https://api.tavily.com/search", expect.objectContaining({ redirect: "error", headers: expect.objectContaining({ Authorization: "Bearer private-key" }) }));
  });
  it("extracts Jina Reader content and rejects invalid target URLs before fetching", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(Response.json({ data: { content: "Example page", usage: { tokens: 20 } } }));
    expect(await callProvider("jina-reader", "key", options, "https://example.com", fetcher)).toMatchObject({ content: "Example page", usage: "20 tokens" });
    fetcher.mockClear();
    await expect(callProvider("jina-reader", "key", options, "file:///etc/passwd", fetcher)).rejects.toThrow("HTTPS");
    expect(fetcher).not.toHaveBeenCalled();
  });
  it("synthesizes actual audio rather than only checking the account", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(new Response(new Uint8Array([73, 68, 51]), { headers: { "content-type": "audio/mpeg" } }));
    const result = await callProvider("elevenlabs", "key", options, "你好", fetcher);
    expect(result.content).toBeInstanceOf(Uint8Array);
    expect(result.usage).toContain("2 字符");
    expect(fetcher.mock.calls[0][1]?.body).toContain(options.model);
  });
  it("sanitizes upstream failures and network errors", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(new Response("private-key confidential", { status: 401 }));
    await expect(callProvider("tavily", "private-key", options, "query", fetcher)).rejects.toThrow("HTTP 401");
    fetcher.mockRejectedValue(new Error("connection failed Authorization: private-key"));
    await expect(callProvider("tavily", "private-key", options, "query", fetcher)).rejects.toThrow("连接失败或响应格式异常");
  });
  it("does not treat malformed successful responses as healthy", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(Response.json({ error: "bad" }));
    await expect(callProvider("tavily", "key", options, "query", fetcher)).rejects.toThrow("格式不正确");
    fetcher.mockResolvedValue(Response.json({ ok: true }));
    await expect(callProvider("elevenlabs", "key", options, "hello", fetcher)).rejects.toThrow("有效音频");
  });
});
