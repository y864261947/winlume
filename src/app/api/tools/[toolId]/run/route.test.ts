import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getCurrentUserId: vi.fn(),
  executeEcommerceImageSet: vi.fn(),
  executeFuseImages: vi.fn(),
  executeStudioTool: vi.fn(),
}));

vi.mock("@/lib/auth/session", () => ({
  getCurrentUserId: mocks.getCurrentUserId,
}));

vi.mock("@/lib/host/web/store-singleton", () => ({
  webStore: { artifacts: {}, toolJobs: {} },
}));

vi.mock("@/lib/agent/tools/providers/registry", () => ({
  invokeToolCapability: vi.fn(),
}));

vi.mock("@/lib/agent/tools/tool-execution", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/agent/tools/tool-execution")>();
  return { ...actual, executeStudioTool: mocks.executeStudioTool };
});

vi.mock("@/lib/agent/tools/execute", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/agent/tools/execute")>();
  return {
    ...actual,
    executeEcommerceImageSet: mocks.executeEcommerceImageSet,
    executeFuseImages: mocks.executeFuseImages,
  };
});

import { StudioToolExecutionError } from "@/lib/agent/tools/tool-execution";
import { POST } from "./route";

const context = { params: Promise.resolve({ toolId: "background-removal" }) };
const clarityContext = { params: Promise.resolve({ toolId: "image-clarity" }) };
const cleanupContext = { params: Promise.resolve({ toolId: "watermark-subtitle-removal" }) };
const fusionContext = { params: Promise.resolve({ toolId: "image-fusion" }) };
const ecommerceSetContext = { params: Promise.resolve({ toolId: "ecommerce-image-set" }) };
const ecommerceJob = {
  id: "ecommerce-job-1",
  userId: "user-1",
  sessionId: "tool:ecommerce-image-set",
  toolId: "ecommerce-image-set" as const,
  pipelineVersion: "ecommerce-image-set@v1" as const,
  sourceArtifactId: "product-image",
  template: "product" as const,
  size: "1536x1024" as const,
  prompt: "极简护肤品，保持瓶身标签。",
  stage: "generating" as const,
  outputArtifactIds: ["set-hero", "set-scene", "set-detail"],
  usage: [],
  createdAt: "2026-08-17T00:00:00.000Z",
  updatedAt: "2026-08-17T00:00:00.000Z",
};

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getCurrentUserId.mockResolvedValue("user-1");
  mocks.executeStudioTool.mockResolvedValue({ id: "result-image", kind: "image" });
  mocks.executeFuseImages.mockResolvedValue({
    ok: true,
    artifact: { id: "pending-fusion", kind: "image", status: "pending" },
  });
  mocks.executeEcommerceImageSet.mockResolvedValue({
    ok: true,
    artifacts: [
      { id: "set-hero", kind: "image", status: "pending" },
      { id: "set-scene", kind: "image", status: "pending" },
      { id: "set-detail", kind: "image", status: "pending" },
    ],
    job: ecommerceJob,
  });
});

describe("POST /api/tools/[toolId]/run", () => {
  it("rejects missing input without invoking a provider", async () => {
    const response = await POST(
      new NextRequest("http://localhost/api/tools/background-removal/run", {
        method: "POST",
        body: JSON.stringify({}),
      }),
      context,
    );

    expect(response.status).toBe(400);
    expect(mocks.executeStudioTool).not.toHaveBeenCalled();
  });

  it("returns a stable setup error when the provider is not configured", async () => {
    mocks.executeStudioTool.mockRejectedValueOnce(
      new StudioToolExecutionError(
        "图片编辑服务尚未配置，请联系管理员完成服务接入。",
        503,
        "tool_unavailable",
      ),
    );
    const response = await POST(
      new NextRequest("http://localhost/api/tools/background-removal/run", {
        method: "POST",
        body: JSON.stringify({
          sourceArtifactId: "source-image",
          params: { subject: "person" },
        }),
      }),
      context,
    );

    expect(response.status).toBe(503);
    expect(mocks.executeStudioTool).toHaveBeenCalledWith(
      expect.objectContaining({
        sourceArtifactId: "source-image",
        params: { subject: "person" },
      }),
      expect.any(Object),
    );
    expect(await response.json()).toEqual({
      error: "图片编辑服务尚未配置，请联系管理员完成服务接入。",
      code: "tool_unavailable",
    });
  });

  it("rejects an invalid clarity mode before invoking the provider", async () => {
    const response = await POST(
      new NextRequest("http://localhost/api/tools/image-clarity/run", {
        method: "POST",
        body: JSON.stringify({ sourceArtifactId: "source-image", params: { mode: "invalid" } }),
      }),
      clarityContext,
    );

    expect(response.status).toBe(400);
    expect(mocks.executeStudioTool).not.toHaveBeenCalled();
  });

  it("rejects an invalid segmentation subject before invoking the provider", async () => {
    const response = await POST(
      new NextRequest("http://localhost/api/tools/background-removal/run", {
        method: "POST",
        body: JSON.stringify({ sourceArtifactId: "source-image", params: { subject: "invalid" } }),
      }),
      context,
    );

    expect(response.status).toBe(400);
    expect(mocks.executeStudioTool).not.toHaveBeenCalled();
  });

  it("requires rights confirmation for watermark and subtitle cleanup", async () => {
    const response = await POST(
      new NextRequest("http://localhost/api/tools/watermark-subtitle-removal/run", {
        method: "POST",
        body: JSON.stringify({ sourceArtifactId: "source-image", params: { target: "watermark" } }),
      }),
      cleanupContext,
    );

    expect(response.status).toBe(400);
    expect(mocks.executeStudioTool).not.toHaveBeenCalled();
  });

  it("rejects invalid fusion input before starting image generation", async () => {
    const response = await POST(
      new NextRequest("http://localhost/api/tools/image-fusion/run", {
        method: "POST",
        body: JSON.stringify({
          sourceArtifactIds: ["same-image", "same-image"],
          prompt: "将图二融入图一",
          params: { size: "1024x1024" },
        }),
      }),
      fusionContext,
    );

    expect(response.status).toBe(400);
    expect(mocks.executeFuseImages).not.toHaveBeenCalled();
    expect(mocks.executeStudioTool).not.toHaveBeenCalled();
  });

  it("starts a two-image fusion job and returns its pending artifact", async () => {
    const response = await POST(
      new NextRequest("http://localhost/api/tools/image-fusion/run", {
        method: "POST",
        body: JSON.stringify({
          sourceArtifactIds: ["base-image", "subject-image"],
          prompt: "保留图一的光线和构图，将图二的产品放在画面中央。",
          params: { size: "1536x1024" },
        }),
      }),
      fusionContext,
    );

    expect(response.status).toBe(202);
    expect(await response.json()).toEqual({
      artifact: { id: "pending-fusion", kind: "image", status: "pending" },
    });
    expect(mocks.executeFuseImages).toHaveBeenCalledWith(
      {
        name: "AI 融图",
        prompt: "保留图一的光线和构图，将图二的产品放在画面中央。",
        size: "1536x1024",
        sourceArtifactIds: ["base-image", "subject-image"],
      },
      {
        userId: "user-1",
        sessionId: "tool:image-fusion",
        artifacts: {},
      },
    );
  });

  it("rejects e-commerce set input without starting image generation", async () => {
    const response = await POST(
      new NextRequest("http://localhost/api/tools/ecommerce-image-set/run", {
        method: "POST",
        body: JSON.stringify({ params: { template: "product", size: "1024x1024" } }),
      }),
      ecommerceSetContext,
    );

    expect(response.status).toBe(400);
    expect(mocks.executeEcommerceImageSet).not.toHaveBeenCalled();
  });

  it("starts three independent e-commerce image jobs", async () => {
    const response = await POST(
      new NextRequest("http://localhost/api/tools/ecommerce-image-set/run", {
        method: "POST",
        body: JSON.stringify({
          sourceArtifactId: "product-image",
          prompt: "极简护肤品，保持瓶身标签。",
          params: { template: "product", size: "1536x1024" },
        }),
      }),
      ecommerceSetContext,
    );

    expect(response.status).toBe(202);
    expect(await response.json()).toEqual({
      artifacts: [
        { id: "set-hero", kind: "image", status: "pending" },
        { id: "set-scene", kind: "image", status: "pending" },
        { id: "set-detail", kind: "image", status: "pending" },
      ],
      job: ecommerceJob,
    });
    expect(mocks.executeEcommerceImageSet).toHaveBeenCalledWith(
      {
        name: "AI 电商套图",
        sourceArtifactId: "product-image",
        template: "product",
        prompt: "极简护肤品，保持瓶身标签。",
        size: "1536x1024",
      },
      {
        userId: "user-1",
        sessionId: "tool:ecommerce-image-set",
        artifacts: {},
        toolJobs: {},
      },
    );
  });

  it("passes the optional reference image after the product image", async () => {
    const response = await POST(
      new NextRequest("http://localhost/api/tools/ecommerce-image-set/run", {
        method: "POST",
        body: JSON.stringify({
          sourceArtifactId: "product-image",
          referenceArtifactId: "reference-image",
          prompt: "参考图只用于光影和构图。",
          params: { template: "product", size: "1024x1024" },
        }),
      }),
      ecommerceSetContext,
    );

    expect(response.status).toBe(202);
    expect(mocks.executeEcommerceImageSet).toHaveBeenCalledWith(
      expect.objectContaining({
        sourceArtifactId: "product-image",
        referenceArtifactId: "reference-image",
      }),
      expect.any(Object),
    );
  });
});
