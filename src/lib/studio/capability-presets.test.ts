import { describe, expect, it } from "vitest";
import { resolveCapabilityPreset } from "./capability-presets";

const catalog = {
  models: ["gpt-test"],
  capabilities: [
    { id: "chat", availability: "available", supportedTools: [] },
    {
      id: "image.generate",
      availability: "needs_setup",
      supportedTools: [],
    },
    {
      id: "canvas.generate",
      availability: "available",
      supportedTools: ["generate_canvas"],
    },
    {
      id: "video.generate",
      availability: "unavailable",
      supportedTools: [],
    },
  ],
} as const;

describe("capability presets", () => {
  it("allows an available chat model and rejects a missing media capability", () => {
    expect(resolveCapabilityPreset("chat-default", catalog)).toMatchObject({
      model: "gpt-test",
    });
    expect(resolveCapabilityPreset("image-default", catalog)).toBeNull();
  });

  it("rejects unknown ids and never binds an unlisted model", () => {
    expect(resolveCapabilityPreset("../chat-default", catalog)).toBeNull();
    expect(
      resolveCapabilityPreset("chat-default", {
        ...catalog,
        models: [],
      }),
    ).toBeNull();
  });
});
