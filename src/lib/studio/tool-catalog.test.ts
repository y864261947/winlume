import { describe, expect, it } from "vitest";
import {
  getStudioTool,
  isStudioToolImageMimeType,
  listStudioTools,
  toolArtifactSessionId,
} from "./tool-catalog";

describe("Studio tool catalog", () => {
  it("exposes only the enabled image tool", () => {
    expect(listStudioTools()).toEqual([
      expect.objectContaining({ id: "background-removal", name: "商品抠图" }),
    ]);
    expect(getStudioTool("background-removal")?.category).toBe("图片处理");
    expect(getStudioTool("not-a-tool")).toBeNull();
  });

  it("uses a non-session scope for direct tool uploads", () => {
    expect(toolArtifactSessionId("background-removal")).toBe("tool:background-removal");
  });

  it("keeps the tool image contract limited to formats the provider supports", () => {
    expect(isStudioToolImageMimeType("image/png")).toBe(true);
    expect(isStudioToolImageMimeType("IMAGE/JPEG")).toBe(true);
    expect(isStudioToolImageMimeType("image/webp")).toBe(true);
    expect(isStudioToolImageMimeType("image/gif")).toBe(false);
    expect(isStudioToolImageMimeType("image/svg+xml")).toBe(false);
  });
});
