import { describe, expect, it } from "vitest";
import {
  getStudioTool,
  initialStudioToolParams,
  isStudioToolImageMimeType,
  listStudioTools,
  listStudioToolsByCategory,
  toolArtifactSessionId,
  validateStudioToolParams,
} from "./tool-catalog";

describe("Studio tool catalog", () => {
  it("exposes the configured image editing tools", () => {
    expect(listStudioTools().map((tool) => tool.id)).toEqual([
      "background-removal",
      "image-clarity",
      "watermark-subtitle-removal",
      "image-fusion",
      "ecommerce-image-set",
    ]);
    expect(getStudioTool("background-removal")?.category).toBe("visual-media");
    expect(getStudioTool("ecommerce-image-set")?.category).toBe("ecommerce-sales");
    expect(listStudioToolsByCategory("visual-media").map((tool) => tool.id)).toEqual([
      "background-removal",
      "image-clarity",
      "watermark-subtitle-removal",
      "image-fusion",
    ]);
    expect(listStudioToolsByCategory("legal-finance")).toEqual([]);
    expect(getStudioTool("person-removal")).toBeNull();
    expect(getStudioTool("not-a-tool")).toBeNull();
  });

  it("applies defaults and rejects invalid editing parameters", () => {
    const backgroundRemoval = getStudioTool("background-removal")!;
    const clarity = getStudioTool("image-clarity")!;
    const cleanup = getStudioTool("watermark-subtitle-removal")!;
    const fusion = getStudioTool("image-fusion")!;
    const ecommerceSet = getStudioTool("ecommerce-image-set")!;

    expect(initialStudioToolParams(backgroundRemoval)).toEqual({ subject: "auto" });
    expect(validateStudioToolParams(backgroundRemoval, { subject: "auto" }).params).toEqual({
      subject: "auto",
    });
    expect(validateStudioToolParams(backgroundRemoval, { subject: "hair" }).params).toEqual({
      subject: "hair",
    });
    expect(validateStudioToolParams(backgroundRemoval, { subject: "invalid" }).error).toContain(
      "抠图模式",
    );
    expect(initialStudioToolParams(clarity)).toEqual({ mode: "standard" });
    expect(validateStudioToolParams(clarity, { mode: "invalid" }).error).toContain("增强方式");
    expect(validateStudioToolParams(cleanup, { target: "subtitles" }).error).toContain("必要权利");
    expect(
      validateStudioToolParams(cleanup, {
        target: "subtitles",
        rightsConfirmed: true,
      }).params,
    ).toEqual({ target: "subtitles", rightsConfirmed: true });
    expect(initialStudioToolParams(fusion)).toEqual({ size: "1024x1024" });
    expect(fusion.capability).toBeUndefined();
    expect(fusion.input).toMatchObject({ minImages: 2, maxImages: 2 });
    expect(fusion.input.prompt?.maxLength).toBe(1200);
    expect(fusion.composerPrompt).toContain("两张图融合");
    expect(initialStudioToolParams(ecommerceSet)).toEqual({
      template: "product",
      size: "1024x1024",
    });
    expect(ecommerceSet.input).toMatchObject({ minImages: 1, maxImages: 2 });
    expect(ecommerceSet.input.prompt?.required).toBeUndefined();
    expect(ecommerceSet.composerPrompt).toContain("电商主图");
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
