import { describe, expect, it, vi } from "vitest";
import type { Artifact } from "@/lib/agent/types";
import { getStudioTool } from "@/lib/studio/tool-catalog";
import { ToolProviderError } from "./providers/types";
import { executeStudioTool } from "./tool-execution";

const source: Artifact = {
  id: "source-image",
  userId: "user-1",
  sessionId: "tool:background-removal",
  projectId: "project-1",
  name: "shoe.jpg",
  kind: "image",
  mimeType: "image/jpeg",
  storageKey: "source-image",
  createdAt: "2026-08-15T00:00:00.000Z",
};

describe("executeStudioTool", () => {
  it("writes a ready image that inherits the source scope", async () => {
    const write = vi.fn(async (meta: Artifact) => meta);
    const invokeCapability = vi.fn().mockResolvedValue({
      status: "completed",
      outputs: [{ bytes: Buffer.from("png"), mimeType: "image/png" }],
    });
    const artifact = await executeStudioTool(
      { tool: getStudioTool("background-removal")!, userId: "user-1", sourceArtifactId: source.id },
      {
        artifacts: {
          get: vi.fn().mockResolvedValue(source),
          readContent: vi.fn().mockResolvedValue(Buffer.from("source")),
          write,
        } as never,
        invokeCapability,
      },
    );

    expect(invokeCapability).toHaveBeenCalledWith("image.background_removal", {
      images: [{ bytes: Buffer.from("source"), mimeType: "image/jpeg" }],
    });
    expect(artifact).toEqual(
      expect.objectContaining({
        userId: "user-1",
        sessionId: "tool:background-removal",
        projectId: "project-1",
        name: "shoe（已抠图）.png",
        kind: "image",
        mimeType: "image/png",
        status: "ready",
      }),
    );
  });

  it("does not call a provider for an inaccessible source image", async () => {
    const invokeCapability = vi.fn();
    await expect(
      executeStudioTool(
        { tool: getStudioTool("background-removal")!, userId: "user-1", sourceArtifactId: "missing" },
        {
          artifacts: { get: vi.fn().mockResolvedValue(null) } as never,
          invokeCapability,
        },
      ),
    ).rejects.toMatchObject({
      status: 404,
      code: "source_not_found",
    });
    expect(invokeCapability).not.toHaveBeenCalled();
  });

  it("does not call a provider for a GIF source artifact", async () => {
    const invokeCapability = vi.fn();
    await expect(
      executeStudioTool(
        { tool: getStudioTool("background-removal")!, userId: "user-1", sourceArtifactId: source.id },
        {
          artifacts: {
            get: vi.fn().mockResolvedValue({ ...source, mimeType: "image/gif" }),
          } as never,
          invokeCapability,
        },
      ),
    ).rejects.toMatchObject({
      status: 400,
      code: "invalid_source",
    });
    expect(invokeCapability).not.toHaveBeenCalled();
  });

  it("forwards a non-default subject to the provider", async () => {
    const invokeCapability = vi.fn().mockResolvedValue({
      status: "completed",
      outputs: [{ bytes: Buffer.from("png"), mimeType: "image/png" }],
    });
    await executeStudioTool(
      {
        tool: getStudioTool("background-removal")!,
        userId: "user-1",
        sourceArtifactId: source.id,
        subject: "person",
      },
      {
        artifacts: {
          get: vi.fn().mockResolvedValue(source),
          readContent: vi.fn().mockResolvedValue(Buffer.from("source")),
          write: vi.fn(async (meta: Artifact) => meta),
        } as never,
        invokeCapability,
      },
    );

    expect(invokeCapability).toHaveBeenCalledWith("image.background_removal", {
      images: [{ bytes: Buffer.from("source"), mimeType: "image/jpeg" }],
      params: { subject: "person" },
    });
  });

  it("turns a configuration failure into a non-retryable setup response", async () => {
    await expect(
      executeStudioTool(
        { tool: getStudioTool("background-removal")!, userId: "user-1", sourceArtifactId: source.id },
        {
          artifacts: {
            get: vi.fn().mockResolvedValue(source),
            readContent: vi.fn().mockResolvedValue(Buffer.from("source")),
          } as never,
          invokeCapability: vi.fn().mockRejectedValue(
            new ToolProviderError("configuration", "商品抠图服务尚未配置，请联系管理员完成服务接入。"),
          ),
        },
      ),
    ).rejects.toMatchObject({
      status: 503,
      code: "tool_unavailable",
    });
  });
});
