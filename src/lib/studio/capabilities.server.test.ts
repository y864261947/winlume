import { describe, expect, it, vi } from "vitest";
import { loadCapabilityCatalog } from "./capabilities.server";

describe("loadCapabilityCatalog", () => {
  it("marks chat available only when the gateway exposes a model", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(
        Response.json({
          configured: [{ family: "openai" }, { family: "images" }],
        }),
      )
      .mockResolvedValueOnce(Response.json({ data: [{ id: "gpt-test" }] }));

    const catalog = await loadCapabilityCatalog({
      baseUrl: "http://gateway.test",
      authToken: "test-admin-token",
      fetchImpl: fetchImpl as typeof fetch,
    });

    expect(catalog.models).toEqual(["gpt-test"]);
    expect(
      catalog.capabilities.find((entry) => entry.id === "chat")?.availability,
    ).toBe("available");
    expect(
      catalog.capabilities.find((entry) => entry.id === "image.generate")
        ?.availability,
    ).toBe("available");
    expect(fetchImpl).toHaveBeenNthCalledWith(
      2,
      "http://gateway.test/v1/models",
      expect.objectContaining({
        headers: { Authorization: "Bearer test-admin-token" },
      }),
    );
  });

  it("never exposes gateway credentials, upstream URLs, or thrown transport text", async () => {
    const catalog = await loadCapabilityCatalog({
      baseUrl: "https://upstream.example/secret-path",
      fetchImpl: vi
        .fn()
        .mockRejectedValue(new Error("Authorization: Bearer test-secret-token")) as typeof fetch,
    });

    const serialized = JSON.stringify(catalog);
    expect(serialized).not.toMatch(/token|authorization|upstream|secret-path/i);
    expect(
      catalog.capabilities.find((entry) => entry.id === "chat")?.availability,
    ).toBe("degraded");
  });

  it("does not call the protected model endpoint without an auth token when capabilities lists openai", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(Response.json({ configured: [{ family: "openai" }] }))
      .mockResolvedValueOnce(Response.json({ data: [] }));

    const catalog = await loadCapabilityCatalog({
      baseUrl: "http://gateway.test",
      authToken: "",
      fetchImpl: fetchImpl as typeof fetch,
    });

    expect(fetchImpl).toHaveBeenCalledTimes(2);
    expect(catalog.models).toEqual([]);
    expect(
      catalog.capabilities.find((entry) => entry.id === "chat")?.availability,
    ).toBe("degraded");
  });

  it("falls back to /v1/models when /capabilities is unavailable (new-api)", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(new Response(null, { status: 404 }))
      .mockResolvedValueOnce(Response.json({ data: [{ id: "gpt-new-api" }] }));

    const catalog = await loadCapabilityCatalog({
      baseUrl: "https://v2api.top",
      authToken: "admin-pat",
      fetchImpl: fetchImpl as typeof fetch,
    });

    expect(catalog.models).toEqual(["gpt-new-api"]);
    expect(
      catalog.capabilities.find((entry) => entry.id === "chat")?.availability,
    ).toBe("available");
  });

  it("treats a new-api HTML shell as an unavailable capability probe", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(new Response("<!doctype html><html></html>", { status: 200 }))
      .mockResolvedValueOnce(Response.json({ data: [{ id: "gpt-chat" }, { id: "gpt-image-2" }] }));

    const catalog = await loadCapabilityCatalog({
      baseUrl: "https://v2api.top",
      authToken: "user-studio-token",
      fetchImpl: fetchImpl as typeof fetch,
    });

    expect(catalog.models).toEqual(["gpt-chat", "gpt-image-2"]);
    expect(catalog.capabilities.find((entry) => entry.id === "chat")?.availability).toBe("available");
    expect(catalog.capabilities.find((entry) => entry.id === "image.generate")?.availability).toBe("available");
    expect(fetchImpl).toHaveBeenNthCalledWith(
      2,
      "https://v2api.top/v1/models",
      expect.objectContaining({
        headers: { Authorization: "Bearer user-studio-token" },
      }),
    );
  });

  it("uses the legacy gateway token when no user token is supplied", async () => {
    const original = process.env.REIZO_GATEWAY_TOKEN;
    process.env.REIZO_GATEWAY_TOKEN = "legacy-gateway-token";
    try {
      const fetchImpl = vi
        .fn()
        .mockResolvedValueOnce(new Response("<!doctype html>", { status: 200 }))
        .mockResolvedValueOnce(Response.json({ data: [{ id: "gpt-chat" }] }));

      const catalog = await loadCapabilityCatalog({
        baseUrl: "https://v2api.top",
        fetchImpl: fetchImpl as typeof fetch,
      });

      expect(catalog.capabilities.find((entry) => entry.id === "chat")?.availability).toBe("available");
      expect(fetchImpl).toHaveBeenNthCalledWith(
        2,
        "https://v2api.top/v1/models",
        expect.objectContaining({
          headers: { Authorization: "Bearer legacy-gateway-token" },
        }),
      );
    } finally {
      if (original === undefined) delete process.env.REIZO_GATEWAY_TOKEN;
      else process.env.REIZO_GATEWAY_TOKEN = original;
    }
  });
});
