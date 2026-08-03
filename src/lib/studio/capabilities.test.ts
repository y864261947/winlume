import { describe, expect, it } from "vitest";
import { buildCapabilityCatalog, isAvailable } from "./capabilities";

describe("capabilities", () => {
  it("normalizes gateway families and exposes only known capability ids", () => {
    const catalog = buildCapabilityCatalog({
      configuredFamilies: ["openai", "images", "unknown", "images"],
      modelIds: ["gpt-test", "gpt-test", "  gpt-second  "],
    });

    expect(catalog.models).toEqual(["gpt-test", "gpt-second"]);
    expect(catalog.capabilities).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: "chat", availability: "available" }),
        expect.objectContaining({
          id: "image.generate",
          availability: "available",
        }),
        expect.objectContaining({
          id: "video.generate",
          availability: "needs_setup",
        }),
      ]),
    );
  });

  it("does not treat degraded or setup-required capability records as available", () => {
    const catalog = buildCapabilityCatalog({
      configuredFamilies: [],
      modelIds: [],
      gatewayReachable: false,
    });

    expect(isAvailable(catalog, "chat")).toBe(false);
    expect(
      catalog.capabilities.find((entry) => entry.id === "chat")?.availability,
    ).toBe("degraded");
  });
});
