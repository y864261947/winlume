import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/platform", () => ({
  getPlatformRepositories: vi.fn(() => ({
    apiKeys: {
      findActiveByPlaintext: vi.fn(async (plaintext: string) =>
        plaintext === "wl_valid"
          ? { id: "key-1", newApiKeyCiphertext: "enc(sk-real)", status: "active" }
          : null,
      ),
      touchLastUsed: vi.fn(async () => {}),
    },
  })),
}));
vi.mock("@/lib/newapi/crypto", () => ({
  decryptSecret: vi.fn((value: string) => value.replace(/^enc\(|\)$/g, "")),
}));

import { POST } from "./route";

describe("POST /api/v1/[...path]", () => {
  it("rejects requests with no bearer key", async () => {
    const request = new Request("https://reizo.example/api/v1/chat/completions", { method: "POST" });
    const response = await POST(request, { params: Promise.resolve({ path: ["chat", "completions"] }) });
    expect(response.status).toBe(401);
  });

  it("rejects an unknown key", async () => {
    const request = new Request("https://reizo.example/api/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: "Bearer wl_unknown" },
    });
    const response = await POST(request, { params: Promise.resolve({ path: ["chat", "completions"] }) });
    expect(response.status).toBe(401);
  });

  it("forwards a valid request to new-api with the decrypted key", async () => {
    process.env.NEW_API_URL = "https://v2api.top";
    const fetchMock = vi.fn().mockResolvedValue(new Response("ok", { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    const request = new Request("https://reizo.example/api/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: "Bearer wl_valid", "Content-Type": "application/json" },
      body: JSON.stringify({ model: "gpt-4o", messages: [] }),
    });
    const response = await POST(request, { params: Promise.resolve({ path: ["chat", "completions"] }) });

    expect(response.status).toBe(200);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://v2api.top/v1/chat/completions");
    expect(new Headers(init.headers as HeadersInit).get("Authorization")).toBe("Bearer sk-real");

    vi.unstubAllGlobals();
  });
});
