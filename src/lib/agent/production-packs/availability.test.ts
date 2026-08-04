import { describe, expect, it } from "vitest";
import { resolveProductionPackAvailability } from "./availability";

describe("Production Pack availability", () => {
  it("reports every requirement and blocks launch when one capability needs setup", () => {
    const availability = resolveProductionPackAvailability(
      { requiredCapabilities: ["chat", "image.generate"] },
      {
        models: ["gpt-test"],
        capabilities: [
          {
            id: "chat",
            availability: "available",
            supportedTools: ["write_artifact"],
          },
          {
            id: "image.generate",
            availability: "needs_setup",
            supportedTools: [],
            reason: "尚未配置图像生成服务",
          },
        ],
      },
    );

    expect(availability).toEqual({
      available: false,
      missingCapabilityIds: ["image.generate"],
      requirements: [
        { id: "chat", availability: "available" },
        {
          id: "image.generate",
          availability: "needs_setup",
          reason: "尚未配置图像生成服务",
        },
      ],
    });
  });
});
