import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getCurrentUserId: vi.fn(),
  executeStudioTool: vi.fn(),
}));

vi.mock("@/lib/auth/session", () => ({
  getCurrentUserId: mocks.getCurrentUserId,
}));

vi.mock("@/lib/host/web/store-singleton", () => ({
  webStore: { artifacts: {} },
}));

vi.mock("@/lib/agent/tools/providers/registry", () => ({
  invokeToolCapability: vi.fn(),
}));

vi.mock("@/lib/agent/tools/tool-execution", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/agent/tools/tool-execution")>();
  return { ...actual, executeStudioTool: mocks.executeStudioTool };
});

import { StudioToolExecutionError } from "@/lib/agent/tools/tool-execution";
import { POST } from "./route";

const context = { params: Promise.resolve({ toolId: "background-removal" }) };

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getCurrentUserId.mockResolvedValue("user-1");
  mocks.executeStudioTool.mockResolvedValue({ id: "result-image", kind: "image" });
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
        "商品抠图服务尚未配置，请联系管理员完成服务接入。",
        503,
        "tool_unavailable",
      ),
    );
    const response = await POST(
      new NextRequest("http://localhost/api/tools/background-removal/run", {
        method: "POST",
        body: JSON.stringify({ sourceArtifactId: "source-image" }),
      }),
      context,
    );

    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({
      error: "商品抠图服务尚未配置，请联系管理员完成服务接入。",
      code: "tool_unavailable",
    });
  });
});
