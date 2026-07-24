import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
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
