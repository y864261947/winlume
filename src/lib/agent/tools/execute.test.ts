import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createWebFileStore } from "@/lib/host/web/file-store";
import { parseCanvasContent } from "@/lib/agent/canvas-content";
import { getCell, parseSheetContent } from "@/lib/agent/sheet-content";
import {
  executeListArtifacts,
  executeReadArtifact,
  executeStudioTool,
  executeWriteArtifact,
  mimeTypeForKind,
  parseToolArgumentsJson,
  truncateForModel,
  READ_CONTENT_MAX_CHARS,
} from "./execute";

const providerMocks = vi.hoisted(() => ({
  invokeToolCapability: vi.fn(),
}));

vi.mock("./providers/registry", () => ({
  invokeToolCapability: providerMocks.invokeToolCapability,
}));

describe("mimeTypeForKind", () => {
  it("maps known kinds", () => {
    expect(mimeTypeForKind("markdown")).toContain("markdown");
    expect(mimeTypeForKind("html")).toContain("html");
    expect(mimeTypeForKind("json")).toContain("json");
    expect(mimeTypeForKind("text")).toContain("plain");
  });

  it("maps canvas", () => {
    expect(mimeTypeForKind("canvas")).toContain("canvas");
  });

  it("maps sheet", () => {
    expect(mimeTypeForKind("sheet")).toContain("sheet");
  });
});

describe("parseToolArgumentsJson", () => {
  it("parses valid JSON", () => {
    expect(parseToolArgumentsJson('{"a":1}')).toEqual({ a: 1 });
  });

  it("treats empty as {}", () => {
    expect(parseToolArgumentsJson("")).toEqual({});
    expect(parseToolArgumentsJson(null)).toEqual({});
  });

  it("throws on invalid JSON", () => {
    expect(() => parseToolArgumentsJson("{nope")).toThrow(/Invalid tool arguments/);
  });
});

describe("truncateForModel", () => {
  it("leaves short text alone", () => {
    expect(truncateForModel("hello")).toEqual({ text: "hello", truncated: false });
  });

  it("truncates long text", () => {
    const long = "x".repeat(READ_CONTENT_MAX_CHARS + 50);
    const r = truncateForModel(long);
    expect(r.truncated).toBe(true);
    expect(r.text.length).toBeLessThan(long.length);
    expect(r.text).toContain("truncated");
  });
});

describe("executeStudioTool + ArtifactStore", () => {
  const dirs: string[] = [];
  afterEach(() => {
    for (const d of dirs) rmSync(d, { recursive: true, force: true });
  });

  function setup() {
    const root = mkdtempSync(join(tmpdir(), "wl-art-"));
    dirs.push(root);
    const store = createWebFileStore(root);
    return {
      store,
      ctx: {
        userId: "u1",
        sessionId: "s1",
        artifacts: store.artifacts,
      },
    };
  }

  it("write_artifact validates and persists", async () => {
    const { ctx, store } = setup();
    const bad = await executeWriteArtifact({ name: "", kind: "markdown", content: "x" }, ctx);
    expect(bad.ok).toBe(false);

    const ok = await executeWriteArtifact(
      {
        name: "竞品调研大纲",
        kind: "markdown",
        content: "# 大纲\n\n- 市场\n- 产品",
      },
      ctx,
    );
    expect(ok.ok).toBe(true);
    expect(ok.artifact?.name).toBe("竞品调研大纲");
    expect(ok.events?.[0]).toMatchObject({
      type: "artifact",
      name: "竞品调研大纲",
      kind: "markdown",
    });

    const list = await store.artifacts.listBySession("u1", "s1");
    expect(list).toHaveLength(1);
    const content = await store.artifacts.readContent("u1", list[0].id);
    expect(content?.toString("utf8")).toContain("大纲");
  });

  it("read_artifact returns content and fails for missing", async () => {
    const { ctx } = setup();
    const missing = await executeReadArtifact({ id: "nope" }, ctx);
    expect(missing.ok).toBe(false);

    const written = await executeWriteArtifact(
      { name: "note", kind: "text", content: "hello artifact" },
      ctx,
    );
    const id = written.artifact!.id;
    const read = await executeReadArtifact({ id }, ctx);
    expect(read.ok).toBe(true);
    expect(read.content).toContain("hello artifact");
  });

  it("list_artifacts scopes session vs user", async () => {
    const { ctx, store } = setup();
    await executeWriteArtifact(
      { name: "a", kind: "text", content: "one" },
      ctx,
    );
    await store.artifacts.write(
      {
        id: "other-sess",
        userId: "u1",
        sessionId: "s2",
        name: "b",
        kind: "text",
        mimeType: "text/plain",
        storageKey: "",
        createdAt: new Date().toISOString(),
      },
      "two",
    );

    const sessionList = await executeListArtifacts({}, ctx);
    expect(sessionList.ok).toBe(true);
    expect(sessionList.content).toContain('"count":1');

    const userList = await executeListArtifacts({ scope: "user" }, ctx);
    expect(userList.content).toContain('"count":2');
  });

  it("executeStudioTool dispatches by name", async () => {
    const { ctx } = setup();
    const unknown = await executeStudioTool("nope", "{}", ctx);
    expect(unknown.ok).toBe(false);

    const res = await executeStudioTool(
      "write_artifact",
      JSON.stringify({ name: "x", kind: "json", content: "{}" }),
      ctx,
    );
    expect(res.ok).toBe(true);
    expect(res.summary).toContain("Saved artifact");
  });
});

describe("executeGenerateCanvas", () => {
  const dirs: string[] = [];
  afterEach(() => {
    for (const dir of dirs) rmSync(dir, { recursive: true, force: true });
  });

  function setup() {
    const root = mkdtempSync(join(tmpdir(), "wl-canvas-"));
    dirs.push(root);
    const store = createWebFileStore(root);
    return {
      store,
      ctx: { userId: "u1", sessionId: "s1", artifacts: store.artifacts },
    };
  }

  it("creates a pending canvas artifact with the given Mermaid source", async () => {
    const { ctx, store } = setup();
    const result = await executeStudioTool(
      "generate_canvas",
      JSON.stringify({ name: "上线流程", mermaid: "flowchart TD\nA-->B" }),
      ctx,
    );

    expect(result.ok).toBe(true);
    expect(result.artifact?.kind).toBe("canvas");
    expect(result.artifact?.status).toBe("pending");

    const buffer = await store.artifacts.readContent("u1", result.artifact!.id);
    const content = parseCanvasContent(buffer!.toString("utf8"));
    expect(content?.mermaidSource).toBe("flowchart TD\nA-->B");
    expect(content?.scene).toBeUndefined();
  });

  it("rejects missing Mermaid", async () => {
    const { ctx } = setup();
    const result = await executeStudioTool(
      "generate_canvas",
      JSON.stringify({ name: "空图" }),
      ctx,
    );
    expect(result.ok).toBe(false);
  });

  it("updates an existing canvas while preserving its stored scene", async () => {
    const { ctx, store } = setup();
    const created = await executeStudioTool(
      "generate_canvas",
      JSON.stringify({ name: "v1", mermaid: "flowchart TD\nA-->B" }),
      ctx,
    );
    const id = created.artifact!.id;

    await store.artifacts.write(
      { ...created.artifact!, status: "ready" },
      JSON.stringify({
        mermaidSource: "flowchart TD\nA-->B",
        convertedFromMermaid: "flowchart TD\nA-->B",
        scene: { elements: [{ id: "n1" }], appState: {} },
      }),
    );

    const updated = await executeStudioTool(
      "generate_canvas",
      JSON.stringify({ name: "v2", mermaid: "flowchart TD\nA-->B-->C", sourceArtifactId: id }),
      ctx,
    );

    expect(updated.ok).toBe(true);
    expect(updated.artifact?.id).toBe(id);
    expect(updated.artifact?.name).toBe("v2");
    expect(updated.artifact?.status).toBe("pending");

    const buffer = await store.artifacts.readContent("u1", id);
    const content = parseCanvasContent(buffer!.toString("utf8"));
    expect(content?.mermaidSource).toBe("flowchart TD\nA-->B-->C");
    expect(content?.scene?.elements).toEqual([{ id: "n1" }]);
  });

  it("rejects sourceArtifactId pointing at a non-canvas artifact", async () => {
    const { ctx } = setup();
    const markdown = await executeWriteArtifact(
      { name: "doc", kind: "markdown", content: "hi" },
      ctx,
    );
    const result = await executeStudioTool(
      "generate_canvas",
      JSON.stringify({
        name: "x",
        mermaid: "flowchart TD\nA-->B",
        sourceArtifactId: markdown.artifact!.id,
      }),
      ctx,
    );
    expect(result.ok).toBe(false);
  });
});

describe("executeGenerateSheet", () => {
  const dirs: string[] = [];
  afterEach(() => {
    for (const dir of dirs) rmSync(dir, { recursive: true, force: true });
  });

  function setup() {
    const root = mkdtempSync(join(tmpdir(), "wl-sheet-"));
    dirs.push(root);
    const store = createWebFileStore(root);
    return {
      store,
      ctx: { userId: "u1", sessionId: "s1", artifacts: store.artifacts },
    };
  }

  it("creates a ready workbook from a values grid", async () => {
    const { ctx, store } = setup();
    const result = await executeStudioTool(
      "generate_sheet",
      JSON.stringify({
        name: "预算",
        sheets: [{ name: "收入", values: [["月份", "金额"], ["1月", 100]] }],
      }),
      ctx,
    );

    expect(result.ok).toBe(true);
    expect(result.artifact?.kind).toBe("sheet");
    expect(result.artifact?.status).toBe("ready");

    const buffer = await store.artifacts.readContent("u1", result.artifact!.id);
    const content = parseSheetContent(buffer!.toString("utf8"));
    expect(content?.sheets[0]?.name).toBe("收入");
    expect(getCell(content!.sheets[0]!, 1, 1)?.v).toBe(100);
  });

  it("patches an existing workbook without wiping earlier cells", async () => {
    const { ctx, store } = setup();
    const created = await executeStudioTool(
      "generate_sheet",
      JSON.stringify({
        name: "预算",
        sheets: [{ name: "收入", values: [["月份", "金额"], ["1月", 100]] }],
      }),
      ctx,
    );
    const id = created.artifact!.id;
    const updated = await executeStudioTool(
      "generate_sheet",
      JSON.stringify({
        name: "预算",
        sourceArtifactId: id,
        operations: [{ op: "setValues", start: "A3", values: [["2月", 120]] }],
      }),
      ctx,
    );

    expect(updated.ok).toBe(true);
    expect(updated.artifact?.id).toBe(id);
    const buffer = await store.artifacts.readContent("u1", id);
    const content = parseSheetContent(buffer!.toString("utf8"));
    expect(getCell(content!.sheets[0]!, 1, 1)?.v).toBe(100);
    expect(getCell(content!.sheets[0]!, 2, 0)?.v).toBe("2月");
    expect(content?.revision).toBe(2);
  });

  it("rejects sourceArtifactId pointing at a non-sheet artifact", async () => {
    const { ctx } = setup();
    const markdown = await executeWriteArtifact(
      { name: "doc", kind: "markdown", content: "hi" },
      ctx,
    );
    const result = await executeStudioTool(
      "generate_sheet",
      JSON.stringify({
        name: "x",
        sourceArtifactId: markdown.artifact!.id,
        operations: [{ op: "setValues", start: "A1", values: [["1"]] }],
      }),
      ctx,
    );
    expect(result.ok).toBe(false);
  });

  it("rejects a patch with no operations", async () => {
    const { ctx } = setup();
    const created = await executeStudioTool(
      "generate_sheet",
      JSON.stringify({
        name: "预算",
        sheets: [{ name: "收入", values: [["a"]] }],
      }),
      ctx,
    );
    const result = await executeStudioTool(
      "generate_sheet",
      JSON.stringify({ name: "预算", sourceArtifactId: created.artifact!.id }),
      ctx,
    );
    expect(result.ok).toBe(false);
  });
});

import { generateImage } from "../provider/gateway";
import {
  executeEcommerceImageSet,
  executeFuseImages,
  executeGenerateImage,
  runImageGenerationJob,
} from "./execute";

vi.mock("../provider/gateway", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../provider/gateway")>();
  return { ...actual, generateImage: vi.fn() };
});

vi.mock("../provider/studio-token", () => ({
  resolveStudioToken: vi.fn(async () => "sk-test-studio"),
}));

describe("executeGenerateImage", () => {
  const dirs: string[] = [];
  afterEach(() => {
    for (const d of dirs) rmSync(d, { recursive: true, force: true });
    vi.mocked(generateImage).mockReset();
    providerMocks.invokeToolCapability.mockReset();
  });

  function makeStore() {
    const dir = mkdtempSync(join(tmpdir(), "reizo-imagegen-"));
    dirs.push(dir);
    return createWebFileStore(dir).artifacts;
  }

  it("writes N pending image artifacts immediately and returns their ids", async () => {
    const artifacts = makeStore();
    // Never resolve: the background job must not be awaited by executeGenerateImage,
    // so nothing here should race a real generateImage() completion against the
    // assertions below (see self-review note in task-4-report.md).
    vi.mocked(generateImage).mockImplementation(() => new Promise(() => {}));
    const result = await executeGenerateImage(
      { name: "Fox", prompt: "a red fox", size: "1024x1024", count: 2 },
      { userId: "u1", sessionId: "s1", artifacts },
    );

    expect(result.ok).toBe(true);
    const parsed = JSON.parse(result.content) as {
      artifacts: { id: string; name: string; status: string }[];
    };
    expect(parsed.artifacts).toHaveLength(2);
    expect(parsed.artifacts.every((a) => a.status === "pending")).toBe(true);
    expect(result.events).toHaveLength(2);
    expect(result.events?.[0]).toMatchObject({ type: "artifact", kind: "image" });

    const stored = await artifacts.get("u1", parsed.artifacts[0]!.id);
    expect(stored?.status).toBe("pending");
    expect(stored?.kind).toBe("image");
  });

  it("rejects invalid arguments", async () => {
    const artifacts = makeStore();
    const result = await executeGenerateImage(
      { name: "Fox", prompt: "a red fox", size: "bogus", count: 2 },
      { userId: "u1", sessionId: "s1", artifacts },
    );
    expect(result.ok).toBe(false);
    expect(result.summary).toContain("validation failed");
  });

  it("fails cleanly when sourceArtifactId points at a nonexistent artifact", async () => {
    const artifacts = makeStore();
    const result = await executeGenerateImage(
      {
        name: "Fox",
        prompt: "a red fox",
        size: "1024x1024",
        count: 1,
        sourceArtifactId: "does-not-exist",
      },
      { userId: "u1", sessionId: "s1", artifacts },
    );
    expect(result.ok).toBe(false);
    expect(result.summary).toContain("Source artifact not found");
    expect(generateImage).not.toHaveBeenCalled();
  });

  it("fails cleanly when the source artifact has missing/empty content", async () => {
    const artifacts = makeStore();
    await artifacts.write(
      {
        id: "src-empty",
        userId: "u1",
        sessionId: "s1",
        name: "Empty Source",
        kind: "image",
        mimeType: "image/png",
        storageKey: "",
        createdAt: new Date().toISOString(),
      },
      Buffer.alloc(0),
    );

    const result = await executeGenerateImage(
      {
        name: "Fox",
        prompt: "a red fox",
        size: "1024x1024",
        count: 1,
        sourceArtifactId: "src-empty",
      },
      { userId: "u1", sessionId: "s1", artifacts },
    );
    expect(result.ok).toBe(false);
    expect(result.summary).toContain("Source artifact content missing");
    expect(generateImage).not.toHaveBeenCalled();
  });

  it("keeps legacy sourceArtifactId working and forwards its bytes/mimeType", async () => {
    const artifacts = makeStore();
    const sourceBytes = Buffer.from("SOURCE-PNG-BYTES");
    await artifacts.write(
      {
        id: "src-1",
        userId: "u1",
        sessionId: "s1",
        name: "Source Image",
        kind: "image",
        mimeType: "image/png",
        storageKey: "",
        status: "ready",
        createdAt: new Date().toISOString(),
      },
      sourceBytes,
    );

    // Never resolve: keep the background job from completing so the synchronous
    // part of the test can assert on the mock's call args deterministically.
    vi.mocked(generateImage).mockImplementation(() => new Promise(() => {}));

    const result = await executeGenerateImage(
      {
        name: "Fox edit",
        prompt: "add a hat",
        size: "1024x1024",
        count: 1,
        sourceArtifactId: "src-1",
      },
      { userId: "u1", sessionId: "s1", artifacts },
    );

    expect(result.ok).toBe(true);
    expect(generateImage).toHaveBeenCalledTimes(1);
    expect(generateImage).toHaveBeenCalledWith(
      expect.objectContaining({
        sourceImages: [{ bytes: sourceBytes, mimeType: "image/png" }],
      }),
    );
  });

  it("forwards every source artifact and the user's exact request for multi-image composition", async () => {
    const artifacts = makeStore();
    const baseBytes = Buffer.from("BASE-PNG-BYTES");
    const subjectBytes = Buffer.from("SUBJECT-JPEG-BYTES");
    for (const source of [
      { id: "base", bytes: baseBytes, mimeType: "image/png" },
      { id: "subject", bytes: subjectBytes, mimeType: "image/jpeg" },
    ]) {
      await artifacts.write(
        {
          id: source.id,
          userId: "u1",
          sessionId: "s1",
          name: source.id,
          kind: "image",
          mimeType: source.mimeType,
          storageKey: "",
          status: "ready",
          createdAt: new Date().toISOString(),
        },
        source.bytes,
      );
    }
    vi.mocked(generateImage).mockImplementation(() => new Promise(() => {}));

    const result = await executeGenerateImage(
      {
        name: "Composite",
        prompt: "Use the first image as the base and add the second image's subject.",
        size: "1024x1024",
        count: 1,
        sourceArtifactIds: ["base", "subject"],
      },
      {
        userId: "u1",
        sessionId: "s1",
        artifacts,
        userIntent: "将 @图片1 放入 @图片2 中",
      },
    );

    expect(result.ok).toBe(true);
    expect(generateImage).toHaveBeenCalledWith(
      expect.objectContaining({
        prompt: expect.stringContaining("将 @图片1 放入 @图片2 中"),
        sourceImages: [
          { bytes: baseBytes, mimeType: "image/png" },
          { bytes: subjectBytes, mimeType: "image/jpeg" },
        ],
      }),
    );
  });

  it("starts fusion with exactly two source images", async () => {
    const artifacts = makeStore();
    const baseBytes = Buffer.from("BASE-PNG-BYTES");
    const subjectBytes = Buffer.from("SUBJECT-JPEG-BYTES");
    for (const source of [
      { id: "base", bytes: baseBytes, mimeType: "image/png" },
      { id: "subject", bytes: subjectBytes, mimeType: "image/jpeg" },
    ]) {
      await artifacts.write(
        {
          id: source.id,
          userId: "u1",
          sessionId: "s1",
          name: source.id,
          kind: "image",
          mimeType: source.mimeType,
          storageKey: "",
          status: "ready",
          createdAt: new Date().toISOString(),
        },
        source.bytes,
      );
    }
    vi.mocked(generateImage).mockImplementation(() => new Promise(() => {}));

    const result = await executeFuseImages(
      {
        name: "AI 融图",
        prompt: "将图二的产品融合到图一场景中。",
        size: "1536x1024",
        sourceArtifactIds: ["base", "subject"],
      },
      { userId: "u1", sessionId: "tool:image-fusion", artifacts },
    );

    expect(result).toMatchObject({ ok: true, artifact: { status: "pending" } });
    expect(generateImage).toHaveBeenCalledWith(
      expect.objectContaining({
        size: "1536x1024",
        sourceImages: [
          { bytes: baseBytes, mimeType: "image/png" },
          { bytes: subjectBytes, mimeType: "image/jpeg" },
        ],
      }),
    );
  });

  it("rejects a fusion request that uses the same image twice", async () => {
    const artifacts = makeStore();
    const result = await executeFuseImages(
      {
        name: "AI 融图",
        prompt: "将图片融入场景。",
        size: "1024x1024",
        sourceArtifactIds: ["same-image", "same-image"],
      },
      { userId: "u1", sessionId: "tool:image-fusion", artifacts },
    );

    expect(result.ok).toBe(false);
    expect(result.summary).toContain("two different images");
    expect(generateImage).not.toHaveBeenCalled();
  });

  it("cuts out the product, then starts three listing images with ordered references", async () => {
    const dir = mkdtempSync(join(tmpdir(), "reizo-ecommerce-set-"));
    dirs.push(dir);
    const store = createWebFileStore(dir);
    const artifacts = store.artifacts;
    const sourceBytes = Buffer.from("PRODUCT-PNG-BYTES");
    const referenceBytes = Buffer.from("REFERENCE-PNG-BYTES");
    const cutoutBytes = Buffer.from("CUTOUT-PNG-BYTES");
    await artifacts.write(
      {
        id: "product",
        userId: "u1",
        sessionId: "s1",
        name: "serum.png",
        kind: "image",
        mimeType: "image/png",
        storageKey: "",
        status: "ready",
        createdAt: new Date().toISOString(),
      },
      sourceBytes,
    );
    await artifacts.write(
      {
        id: "reference",
        userId: "u1",
        sessionId: "s1",
        name: "reference.png",
        kind: "image",
        mimeType: "image/png",
        storageKey: "",
        status: "ready",
        createdAt: new Date().toISOString(),
      },
      referenceBytes,
    );
    providerMocks.invokeToolCapability.mockResolvedValue({
      status: "completed",
      outputs: [{ bytes: cutoutBytes, mimeType: "image/png" }],
    });
    vi.mocked(generateImage).mockImplementation(() => new Promise(() => {}));

    const result = await executeEcommerceImageSet(
      {
        name: "AI 电商套图",
        sourceArtifactId: "product",
        referenceArtifactId: "reference",
        template: "product",
        prompt: "极简护肤品，保持瓶身标签。",
        size: "1024x1024",
      },
      {
        userId: "u1",
        sessionId: "tool:ecommerce-image-set",
        artifacts,
        toolJobs: store.toolJobs,
      },
    );

    expect(result).toMatchObject({
      ok: true,
      artifacts: expect.any(Array),
      job: { stage: "generating", cutoutArtifactId: expect.any(String) },
    });
    expect(result.artifacts).toHaveLength(3);
    expect(result.artifacts?.map((artifact) => artifact.name)).toEqual([
      "AI 电商套图 - 主图",
      "AI 电商套图 - 场景图",
      "AI 电商套图 - 细节图",
    ]);
    expect(providerMocks.invokeToolCapability).toHaveBeenCalledWith(
      "image.background_removal",
      expect.objectContaining({
        images: [{ bytes: sourceBytes, mimeType: "image/png" }],
        params: { subject: "product" },
      }),
    );
    const cutout = await artifacts.get("u1", result.job!.cutoutArtifactId!);
    expect(cutout).toMatchObject({ visibility: "hidden", status: "ready" });
    expect(result.job?.plan?.referenceMode).toBe("style_only");
    expect(generateImage).toHaveBeenCalledTimes(3);
    expect(generateImage).toHaveBeenNthCalledWith(1, expect.objectContaining({
      sourceImages: [
        { bytes: cutoutBytes, mimeType: "image/png" },
        { bytes: sourceBytes, mimeType: "image/png" },
        { bytes: referenceBytes, mimeType: "image/png" },
      ],
      prompt: expect.stringContaining("marketplace hero image"),
    }));
  });
});

describe("runImageGenerationJob", () => {
  const dirs: string[] = [];
  afterEach(() => {
    for (const d of dirs) rmSync(d, { recursive: true, force: true });
    vi.mocked(generateImage).mockReset();
  });

  function makeStore() {
    const dir = mkdtempSync(join(tmpdir(), "reizo-imagegen-job-"));
    dirs.push(dir);
    return createWebFileStore(dir).artifacts;
  }

  it("marks the artifact ready and writes the returned bytes on success", async () => {
    const artifacts = makeStore();
    const pending = await artifacts.write(
      {
        id: "art-1",
        userId: "u1",
        sessionId: "s1",
        name: "Fox",
        kind: "image",
        mimeType: "application/octet-stream",
        storageKey: "",
        status: "pending",
        createdAt: new Date().toISOString(),
      },
      Buffer.alloc(0),
    );
    vi.mocked(generateImage).mockResolvedValue([
      { bytes: Buffer.from("PNGDATA"), mimeType: "image/png" },
    ]);

    const received: unknown[] = [];
    const { subscribeArtifactEvents } = await import("../artifact-events");
    const unsubscribe = subscribeArtifactEvents("u1", (e) => received.push(e));

    await runImageGenerationJob({
      artifact: pending,
      ctx: { userId: "u1", sessionId: "s1", artifacts },
      prompt: "a red fox",
      size: "1024x1024",
    });
    unsubscribe();

    const stored = await artifacts.get("u1", "art-1");
    expect(stored?.status).toBe("ready");
    expect(stored?.mimeType).toBe("image/png");
    const content = await artifacts.readContent("u1", "art-1");
    expect(content?.toString()).toBe("PNGDATA");
    expect(received).toEqual([
      { type: "artifact_updated", artifactId: "art-1", status: "ready" },
    ]);
  });

  it("marks the artifact failed with an error message when generation throws", async () => {
    const artifacts = makeStore();
    const pending = await artifacts.write(
      {
        id: "art-2",
        userId: "u1",
        sessionId: "s1",
        name: "Fox",
        kind: "image",
        mimeType: "application/octet-stream",
        storageKey: "",
        status: "pending",
        createdAt: new Date().toISOString(),
      },
      Buffer.alloc(0),
    );
    vi.mocked(generateImage).mockRejectedValue(new Error("quota exceeded"));

    await runImageGenerationJob({
      artifact: pending,
      ctx: { userId: "u1", sessionId: "s1", artifacts },
      prompt: "a red fox",
      size: "1024x1024",
    });

    const stored = await artifacts.get("u1", "art-2");
    expect(stored?.status).toBe("failed");
    expect(stored?.error).toBe("quota exceeded");
  });
});
