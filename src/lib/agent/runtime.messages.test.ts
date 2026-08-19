import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { serializeCanvasContent } from "@/lib/agent/canvas-content";
import { serializeSheetContent, workbookFromCreateSheets } from "@/lib/agent/sheet-content";
import { createWebFileStore } from "@/lib/host/web/file-store";
import type { ArtifactStore } from "@/lib/host/ports";
import {
  buildCanvasReferenceReminder,
  buildSheetReferenceReminder,
  buildProjectReminder,
  buildReferencedArtifactReminder,
  buildReferencedArtifactsReminder,
  selectRuntimeSkillIds,
  selectStudioTools,
  toGatewayMessages,
} from "./runtime";
import type { Artifact, Message } from "./types";

describe("toGatewayMessages", () => {
  it("includes system, user, assistant, tool rounds", () => {
    const history: Message[] = [
      {
        id: "u1",
        sessionId: "s",
        role: "user",
        content: "写大纲并保存",
        createdAt: "t1",
      },
      {
        id: "a1",
        sessionId: "s",
        role: "assistant",
        content: "",
        toolCalls: [
          {
            id: "call_1",
            name: "write_artifact",
            arguments: '{"name":"x","kind":"markdown","content":"# hi"}',
          },
        ],
        createdAt: "t2",
      },
      {
        id: "t1",
        sessionId: "s",
        role: "tool",
        content: '{"id":"art1"}',
        toolCallId: "call_1",
        createdAt: "t3",
      },
      {
        id: "a2",
        sessionId: "s",
        role: "assistant",
        content: "已保存",
        createdAt: "t4",
      },
    ];

    const msgs = toGatewayMessages("BASE", history);
    expect(msgs[0]).toEqual({ role: "system", content: "BASE" });
    expect(msgs[1]).toMatchObject({ role: "user", content: "写大纲并保存" });
    expect(msgs[2]).toMatchObject({
      role: "assistant",
      tool_calls: [
        {
          id: "call_1",
          type: "function",
          function: { name: "write_artifact" },
        },
      ],
    });
    expect(msgs[3]).toEqual({
      role: "tool",
      tool_call_id: "call_1",
      content: '{"id":"art1"}',
    });
    expect(msgs[4]).toEqual({ role: "assistant", content: "已保存" });
  });

  it("skips tool messages without toolCallId", () => {
    const history: Message[] = [
      {
        id: "t1",
        sessionId: "s",
        role: "tool",
        content: "orphan",
        createdAt: "t",
      },
    ];
    expect(toGatewayMessages("S", history)).toEqual([
      { role: "system", content: "S" },
    ]);
  });
});

describe("Workflow execution policy", () => {
  it("replaces pinned Skills and exposes only explicitly allowed tools", () => {
    expect(
      selectRuntimeSkillIds(
        ["project-pinned", "session-pinned"],
        ["pack-stage"],
        "replace",
      ),
    ).toEqual(["pack-stage"]);
    expect(
      selectStudioTools(["read_artifact", "write_artifact"]).map(
        (tool) => tool.function.name,
      ),
    ).toEqual(["write_artifact", "read_artifact"]);
  });
});

describe("buildReferencedArtifactReminder", () => {
  it("returns empty string when there is no referenced artifact", () => {
    expect(buildReferencedArtifactReminder(null)).toBe("");
  });

  it("names the artifact and its id, and instructs the model not to guess", () => {
    const artifact: Artifact = {
      id: "art-42",
      userId: "u1",
      sessionId: "s1",
      name: "Fox",
      kind: "image",
      mimeType: "image/png",
      storageKey: "",
      createdAt: "t1",
    };
    const reminder = buildReferencedArtifactReminder(artifact);
    expect(reminder).toContain("<system-reminder>");
    expect(reminder).toContain("Fox");
    expect(reminder).toContain("art-42");
    expect(reminder).toContain("sourceArtifactId");
    expect(reminder).toContain("do not invent");
  });

  it("lists multiple @-mentioned artifacts", () => {
    const artifacts: Artifact[] = [
      {
        id: "a1",
        userId: "u1",
        sessionId: "s1",
        name: "图片1",
        kind: "image",
        mimeType: "image/png",
        storageKey: "",
        createdAt: "t1",
      },
      {
        id: "a2",
        userId: "u1",
        sessionId: "s1",
        name: "图片2",
        kind: "image",
        mimeType: "image/png",
        storageKey: "",
        createdAt: "t1",
      },
    ];
    const reminder = buildReferencedArtifactsReminder(artifacts);
    expect(reminder).toContain("@图片1");
    expect(reminder).toContain("@图片2");
    expect(reminder).toContain("a1");
    expect(reminder).toContain("a2");
    expect(reminder).toContain('sourceArtifactIds containing the needed ids from this list (["a1","a2"])');
    expect(reminder).toContain("send every image");
    expect(reminder).not.toContain("describe every listed id in the prompt");
  });

  it("treats a marked annotation image as targeting guidance for its base image", () => {
    const artifacts: Artifact[] = [
      {
        id: "base-image",
        userId: "u1",
        sessionId: "s1",
        name: "原始设计图",
        kind: "image",
        mimeType: "image/png",
        storageKey: "",
        createdAt: "t1",
      },
      {
        id: "annotation-image",
        userId: "u1",
        sessionId: "s1",
        name: "修改标注图",
        kind: "image",
        mimeType: "image/png",
        storageKey: "",
        createdAt: "t1",
        visibility: "hidden",
        purpose: "annotation",
      },
    ];

    const reminder = buildReferencedArtifactsReminder(artifacts);

    expect(reminder).toContain("base-image");
    expect(reminder).toContain("editable base canvas");
    expect(reminder).toContain("annotation-image");
    expect(reminder).toContain("marked targeting reference");
    expect(reminder).toContain('sourceArtifactIds exactly ["base-image","annotation-image"]');
    expect(reminder).toContain("Do not reproduce or retain annotation marks");
  });
});

describe("buildProjectReminder", () => {
  it("injects shared project instructions and artifact context", () => {
    const reminder = buildProjectReminder(
      {
        id: "project-1",
        name: "Launch plan",
        description: "A shared launch workspace",
        instructions: "Use the brand voice and save final deliverables.",
        createdAt: "2026-01-01T00:00:00.000Z",
        updatedAt: "2026-01-01T00:00:00.000Z",
      },
      3,
    );

    expect(reminder).toContain("<project-context>");
    expect(reminder).toContain("Launch plan");
    expect(reminder).toContain("brand voice");
    expect(reminder).toContain("3 shared artifact");
    expect(reminder).toContain("scope=project");
  });
});

describe("buildCanvasReferenceReminder", () => {
  const dirs: string[] = [];
  afterEach(() => {
    for (const dir of dirs) rmSync(dir, { recursive: true, force: true });
  });

  function setup() {
    const root = mkdtempSync(join(tmpdir(), "wl-runtime-canvas-"));
    dirs.push(root);
    return createWebFileStore(root);
  }

  it("returns an empty string for no canvases", async () => {
    const store = setup();
    await expect(buildCanvasReferenceReminder([], store.artifacts, "u1")).resolves.toBe("");
  });

  it("includes the id, name, and structural summary for each canvas", async () => {
    const store = setup();
    const artifact = await store.artifacts.write(
      {
        id: "canvas-1",
        userId: "u1",
        sessionId: "s1",
        name: "上线流程",
        kind: "canvas",
        mimeType: "application/vnd.reizo.canvas+json",
        storageKey: "",
        status: "ready",
        createdAt: new Date().toISOString(),
      },
      serializeCanvasContent({
        mermaidSource: "flowchart TD\nA-->B",
        convertedFromMermaid: "flowchart TD\nA-->B",
        scene: {
          elements: [{ id: "1", type: "text", text: "上线" }],
          appState: {},
        },
      }),
    );

    const text = await buildCanvasReferenceReminder([artifact], store.artifacts, "u1");
    expect(text).toContain("canvas-1");
    expect(text).toContain("上线流程");
    expect(text).toContain("上线");
  });

  it("keeps the turn usable when one canvas cannot be read", async () => {
    const canvas: Artifact = {
      id: "unreadable-canvas",
      userId: "u1",
      sessionId: "s1",
      name: "损坏画布",
      kind: "canvas",
      mimeType: "application/vnd.reizo.canvas+json",
      storageKey: "",
      createdAt: new Date().toISOString(),
    };
    const artifacts = {
      readContent: async () => {
        throw new Error("disk unavailable");
      },
    } as unknown as ArtifactStore;

    const text = await buildCanvasReferenceReminder([canvas], artifacts, "u1");
    expect(text).toContain("损坏画布");
    expect(text).toContain("(content unavailable)");
  });
});

describe("buildSheetReferenceReminder", () => {
  const dirs: string[] = [];
  afterEach(() => {
    for (const dir of dirs) rmSync(dir, { recursive: true, force: true });
  });

  it("includes the id, name, and current grid", async () => {
    const root = mkdtempSync(join(tmpdir(), "wl-runtime-sheet-"));
    dirs.push(root);
    const store = createWebFileStore(root);
    const created = workbookFromCreateSheets([
      { name: "收入", values: [["月份", "金额"], ["1月", 100]] },
    ]);
    if (!("content" in created)) throw new Error(created.error);
    const artifact = await store.artifacts.write(
      {
        id: "sheet-1",
        userId: "u1",
        sessionId: "s1",
        name: "预算",
        kind: "sheet",
        mimeType: "application/vnd.reizo.sheet+json",
        storageKey: "",
        status: "ready",
        createdAt: new Date().toISOString(),
      },
      serializeSheetContent(created.content),
    );

    const text = await buildSheetReferenceReminder([artifact], store.artifacts, "u1");
    expect(text).toContain("sheet-1");
    expect(text).toContain("预算");
    expect(text).toContain("1月");
    expect(text).toContain("generate_sheet");
  });
});
