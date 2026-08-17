import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createWebFileStore } from "@/lib/host/web/file-store";
import type { GatewayChatStream } from "./provider/gateway";
import { runAgentTurn } from "./runtime";

vi.mock("@/lib/agent/provider/studio-token", () => ({
  resolveStudioToken: vi.fn(async () => "sk-test-studio"),
}));

const providerMocks = vi.hoisted(() => ({
  invokeToolCapability: vi.fn(),
}));

const gatewayMocks = vi.hoisted(() => ({
  generateImage: vi.fn(),
}));

vi.mock("@/lib/agent/tools/providers/registry", () => ({
  invokeToolCapability: providerMocks.invokeToolCapability,
}));

vi.mock("@/lib/agent/provider/gateway", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/agent/provider/gateway")>();
  return { ...actual, generateImage: gatewayMocks.generateImage };
});

describe("runAgentTurn chunk mapping", () => {
  const directories: string[] = [];

  afterEach(() => {
    for (const directory of directories) {
      rmSync(directory, { recursive: true, force: true });
    }
    directories.length = 0;
    providerMocks.invokeToolCapability.mockReset();
    gatewayMocks.generateImage.mockReset();
  });

  it("surfaces reasoning/thinking chunks as thinking events, kept out of the final answer text", async () => {
    const root = mkdtempSync(join(tmpdir(), "reizo-runtime-thinking-"));
    directories.push(root);
    const store = createWebFileStore(root);
    await store.sessions.createSession({
      id: "session-1",
      userId: "user-1",
      title: "Thinking",
      model: "gpt-4o-mini",
    });

    const streamChat: GatewayChatStream = async function* () {
      yield { kind: "thinking", text: "分析一下用户的问题：" };
      yield { kind: "thinking", text: "需要先确认范围。" };
      yield { kind: "text", text: "这是最终答案。" };
    };

    const events = [];
    for await (const event of runAgentTurn({
      userId: "user-1",
      sessionId: "session-1",
      userText: "帮我分析一下",
      runId: "run-1",
      sessions: store.sessions,
      artifacts: store.artifacts,
      streamChat,
    })) {
      events.push(event);
    }

    expect(events).toContainEqual({
      type: "thinking",
      text: "分析一下用户的问题：",
    });
    expect(events).toContainEqual({ type: "thinking", text: "需要先确认范围。" });
    expect(events).toContainEqual({ type: "text_delta", text: "这是最终答案。" });

    const messages = await store.sessions.listMessages("user-1", "session-1");
    const assistant = messages.find((m) => m.role === "assistant");
    expect(assistant?.content).toBe("这是最终答案。");
    expect(assistant?.content).not.toContain("分析一下");
  });

  it("exposes and executes background removal from the Composer tool loop", async () => {
    const root = mkdtempSync(join(tmpdir(), "reizo-runtime-background-removal-"));
    directories.push(root);
    const store = createWebFileStore(root);
    await store.sessions.createSession({
      id: "session-1",
      userId: "user-1",
      title: "Background removal",
      model: "gpt-4o-mini",
    });
    const source = await store.artifacts.write(
      {
        id: "source-image",
        userId: "user-1",
        sessionId: "previous-session",
        name: "shoe.jpg",
        kind: "image",
        mimeType: "image/jpeg",
        storageKey: "",
        status: "ready",
        createdAt: new Date().toISOString(),
      },
      Buffer.from("source-jpeg"),
    );
    providerMocks.invokeToolCapability.mockResolvedValueOnce({
      status: "completed",
      outputs: [{ bytes: Buffer.from("transparent-png"), mimeType: "image/png" }],
    });

    let round = 0;
    const streamChat: GatewayChatStream = async function* (params) {
      if (round++ === 0) {
        expect(params.tools).toEqual(expect.arrayContaining([
          expect.objectContaining({
            function: expect.objectContaining({ name: "remove_background" }),
          }),
        ]));
        yield {
          kind: "tool_calls",
          calls: [{
            id: "call-remove-background",
            name: "remove_background",
            arguments: JSON.stringify({ sourceArtifactId: source.id, subject: "person" }),
          }],
        };
        return;
      }
      yield { kind: "text", text: "已完成抠图。" };
    };

    const events = [];
    for await (const event of runAgentTurn({
      userId: "user-1",
      sessionId: "session-1",
      userText: "把这张鞋子的背景去掉",
      runId: "run-1",
      sessions: store.sessions,
      artifacts: store.artifacts,
      referencedArtifactIds: [source.id],
      streamChat,
    })) {
      events.push(event);
    }

    expect(providerMocks.invokeToolCapability).toHaveBeenCalledWith(
      "image.background_removal",
      {
        images: [{ bytes: Buffer.from("source-jpeg"), mimeType: "image/jpeg" }],
        params: { subject: "person" },
      },
    );
    const output = (await store.artifacts.listBySession("user-1", "session-1"))[0];
    expect(output).toMatchObject({
      name: "shoe（已抠图）.png",
      kind: "image",
      mimeType: "image/png",
      status: "ready",
    });
    expect(await store.artifacts.readContent("user-1", output!.id)).toEqual(
      Buffer.from("transparent-png"),
    );
    expect(events).toContainEqual(expect.objectContaining({
      type: "artifact",
      artifactId: output!.id,
    }));
  });

  it("exposes and dispatches the additional image editing tools", async () => {
    const root = mkdtempSync(join(tmpdir(), "reizo-runtime-image-editing-"));
    directories.push(root);
    const store = createWebFileStore(root);
    await store.sessions.createSession({
      id: "session-1",
      userId: "user-1",
      title: "Image editing",
      model: "gpt-4o-mini",
    });
    const source = await store.artifacts.write(
      {
        id: "source-image",
        userId: "user-1",
        sessionId: "previous-session",
        name: "scene.jpg",
        kind: "image",
        mimeType: "image/jpeg",
        storageKey: "",
        status: "ready",
        createdAt: new Date().toISOString(),
      },
      Buffer.from("source-jpeg"),
    );
    providerMocks.invokeToolCapability
      .mockResolvedValueOnce({
        status: "completed",
        outputs: [{ bytes: Buffer.from("upscaled-jpeg"), mimeType: "image/jpeg" }],
      })
      .mockResolvedValueOnce({
        status: "completed",
        outputs: [{ bytes: Buffer.from("cleaned-png"), mimeType: "image/png" }],
      });

    let round = 0;
    const streamChat: GatewayChatStream = async function* (params) {
      if (round++ === 0) {
        expect(params.tools).toEqual(expect.arrayContaining([
          expect.objectContaining({ function: expect.objectContaining({ name: "upscale_image" }) }),
          expect.objectContaining({
            function: expect.objectContaining({ name: "remove_watermark_or_subtitles" }),
          }),
        ]));
        yield {
          kind: "tool_calls",
          calls: [{
            id: "call-upscale",
            name: "upscale_image",
            arguments: JSON.stringify({ sourceArtifactId: source.id, mode: "standard" }),
          }],
        };
        return;
      }
      if (round === 2) {
        yield {
          kind: "tool_calls",
          calls: [{
            id: "call-cleanup",
            name: "remove_watermark_or_subtitles",
            arguments: JSON.stringify({
              sourceArtifactId: source.id,
              target: "subtitles",
              rightsConfirmed: true,
            }),
          }],
        };
        return;
      }
      yield { kind: "text", text: "已完成图片处理。" };
    };

    for await (const _event of runAgentTurn({
      userId: "user-1",
      sessionId: "session-1",
      userText: "把图变清晰并清理我有权移除的字幕",
      runId: "run-1",
      sessions: store.sessions,
      artifacts: store.artifacts,
      referencedArtifactIds: [source.id],
      streamChat,
    })) {
      // Iterating starts the tool loop and persists its artifacts.
    }

    expect(providerMocks.invokeToolCapability).toHaveBeenNthCalledWith(1, "image.upscale", {
      images: [{ bytes: Buffer.from("source-jpeg"), mimeType: "image/jpeg" }],
      params: { mode: "standard" },
    });
    expect(providerMocks.invokeToolCapability).toHaveBeenNthCalledWith(
      2,
      "image.watermark_text_removal",
      {
        images: [{ bytes: Buffer.from("source-jpeg"), mimeType: "image/jpeg" }],
        params: { target: "subtitles", rightsConfirmed: true },
      },
    );
  });

  it("exposes and starts two-image fusion from the Composer tool loop", async () => {
    const root = mkdtempSync(join(tmpdir(), "reizo-runtime-image-fusion-"));
    directories.push(root);
    const store = createWebFileStore(root);
    await store.sessions.createSession({
      id: "session-1",
      userId: "user-1",
      title: "Image fusion",
      model: "gpt-4o-mini",
    });
    const base = await store.artifacts.write(
      {
        id: "base-image",
        userId: "user-1",
        sessionId: "previous-session",
        name: "scene.png",
        kind: "image",
        mimeType: "image/png",
        storageKey: "",
        status: "ready",
        createdAt: new Date().toISOString(),
      },
      Buffer.from("base-png"),
    );
    const subject = await store.artifacts.write(
      {
        id: "subject-image",
        userId: "user-1",
        sessionId: "previous-session",
        name: "product.jpg",
        kind: "image",
        mimeType: "image/jpeg",
        storageKey: "",
        status: "ready",
        createdAt: new Date().toISOString(),
      },
      Buffer.from("subject-jpeg"),
    );
    gatewayMocks.generateImage.mockImplementation(() => new Promise(() => {}));

    let round = 0;
    const streamChat: GatewayChatStream = async function* (params) {
      if (round++ === 0) {
        expect(params.tools).toEqual(expect.arrayContaining([
          expect.objectContaining({ function: expect.objectContaining({ name: "fuse_images" }) }),
        ]));
        yield {
          kind: "tool_calls",
          calls: [{
            id: "call-fuse-images",
            name: "fuse_images",
            arguments: JSON.stringify({
              name: "合成图",
              prompt: "保留第一张图的构图，将第二张图的产品融入场景。",
              size: "1536x1024",
              sourceArtifactIds: [base.id, subject.id],
            }),
          }],
        };
        return;
      }
      yield { kind: "text", text: "已开始生成融图。" };
    };

    for await (const _event of runAgentTurn({
      userId: "user-1",
      sessionId: "session-1",
      userText: "把这两张图融合，保留场景和产品细节",
      runId: "run-1",
      sessions: store.sessions,
      artifacts: store.artifacts,
      referencedArtifactIds: [base.id, subject.id],
      streamChat,
    })) {
      // Iterating starts the asynchronous image job.
    }

    await vi.waitFor(() => expect(gatewayMocks.generateImage).toHaveBeenCalledOnce());
    expect(gatewayMocks.generateImage).toHaveBeenCalledWith(expect.objectContaining({
      size: "1536x1024",
      sourceImages: [
        { bytes: Buffer.from("base-png"), mimeType: "image/png" },
        { bytes: Buffer.from("subject-jpeg"), mimeType: "image/jpeg" },
      ],
    }));
    const output = (await store.artifacts.listBySession("user-1", "session-1"))[0];
    expect(output).toMatchObject({
      name: "合成图",
      kind: "image",
      status: "pending",
    });
  });

  it("exposes and starts three independent e-commerce images from the Composer tool loop", async () => {
    const root = mkdtempSync(join(tmpdir(), "reizo-runtime-ecommerce-image-set-"));
    directories.push(root);
    const store = createWebFileStore(root);
    await store.sessions.createSession({
      id: "session-1",
      userId: "user-1",
      title: "E-commerce image set",
      model: "gpt-4o-mini",
    });
    const source = await store.artifacts.write(
      {
        id: "product-image",
        userId: "user-1",
        sessionId: "previous-session",
        name: "serum.png",
        kind: "image",
        mimeType: "image/png",
        storageKey: "",
        status: "ready",
        createdAt: new Date().toISOString(),
      },
      Buffer.from("product-png"),
    );
    providerMocks.invokeToolCapability.mockResolvedValueOnce({
      status: "completed",
      outputs: [{ bytes: Buffer.from("product-cutout-png"), mimeType: "image/png" }],
    });
    gatewayMocks.generateImage.mockImplementation(() => new Promise(() => {}));

    let round = 0;
    const streamChat: GatewayChatStream = async function* (params) {
      if (round++ === 0) {
        expect(params.tools).toEqual(expect.arrayContaining([
          expect.objectContaining({
            function: expect.objectContaining({ name: "generate_ecommerce_image_set" }),
          }),
        ]));
        yield {
          kind: "tool_calls",
          calls: [{
            id: "call-ecommerce-image-set",
            name: "generate_ecommerce_image_set",
            arguments: JSON.stringify({
              name: "护肤品套图",
              sourceArtifactId: source.id,
              template: "product",
              prompt: "极简护肤品牌，保持瓶身标签。",
              size: "1024x1024",
            }),
          }],
        };
        return;
      }
      yield { kind: "text", text: "已开始生成三张电商套图。" };
    };

    for await (const _event of runAgentTurn({
      userId: "user-1",
      sessionId: "session-1",
      userText: "为这款护肤品生成电商主图、场景图和细节图",
      runId: "run-1",
      sessions: store.sessions,
      artifacts: store.artifacts,
      toolJobs: store.toolJobs,
      referencedArtifactIds: [source.id],
      streamChat,
    })) {
      // Iterating starts every independent image job.
    }

    await vi.waitFor(() => expect(gatewayMocks.generateImage).toHaveBeenCalledTimes(3));
    expect(gatewayMocks.generateImage).toHaveBeenNthCalledWith(1, expect.objectContaining({
      sourceImages: [
        { bytes: Buffer.from("product-cutout-png"), mimeType: "image/png" },
        { bytes: Buffer.from("product-png"), mimeType: "image/png" },
      ],
      prompt: expect.stringContaining("marketplace hero image"),
    }));
    const output = await store.artifacts.listBySession("user-1", "session-1");
    expect(output).toHaveLength(3);
    expect(output.map((artifact) => artifact.name).sort()).toEqual([
      "护肤品套图 - 主图",
      "护肤品套图 - 场景图",
      "护肤品套图 - 细节图",
    ]);
    expect(output.every((artifact) => artifact.status === "pending")).toBe(true);
  });
});
