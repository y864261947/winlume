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
      internalToken: "test-internal-token",
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
        headers: { "x-winlume-internal-token": "test-internal-token" },
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

  it("does not call the protected model endpoint without an internal token", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValue(Response.json({ configured: [{ family: "openai" }] }));

    const catalog = await loadCapabilityCatalog({
      baseUrl: "http://gateway.test",
      internalToken: "",
      fetchImpl: fetchImpl as typeof fetch,
    });

    expect(fetchImpl).toHaveBeenCalledOnce();
    expect(catalog.models).toEqual([]);
    expect(
      catalog.capabilities.find((entry) => entry.id === "chat")?.availability,
    ).toBe("degraded");
  });
});
