import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createWebFileStore } from "@/lib/host/web/file-store";
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

describe("mimeTypeForKind", () => {
  it("maps known kinds", () => {
    expect(mimeTypeForKind("markdown")).toContain("markdown");
    expect(mimeTypeForKind("html")).toContain("html");
    expect(mimeTypeForKind("json")).toContain("json");
    expect(mimeTypeForKind("text")).toContain("plain");
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

import { generateImage } from "../provider/gateway";
import {
  executeGenerateImage,
  runImageGenerationJob,
} from "./execute";

vi.mock("../provider/gateway", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../provider/gateway")>();
  return { ...actual, generateImage: vi.fn() };
});

describe("executeGenerateImage", () => {
  const dirs: string[] = [];
  afterEach(() => {
    for (const d of dirs) rmSync(d, { recursive: true, force: true });
    vi.mocked(generateImage).mockReset();
  });

  function makeStore() {
    const dir = mkdtempSync(join(tmpdir(), "winlume-imagegen-"));
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

  it("reads a valid sourceArtifactId's bytes/mimeType and forwards them as sourceImage", async () => {
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
        sourceImage: { bytes: sourceBytes, mimeType: "image/png" },
      }),
    );
  });
});

describe("runImageGenerationJob", () => {
  const dirs: string[] = [];
  afterEach(() => {
    for (const d of dirs) rmSync(d, { recursive: true, force: true });
    vi.mocked(generateImage).mockReset();
  });

  function makeStore() {
    const dir = mkdtempSync(join(tmpdir(), "winlume-imagegen-job-"));
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
