import { describe, expect, it } from "vitest";
import type { Artifact } from "@/lib/agent/types";
import type { ImageAttachment } from "@/lib/studio/composer-attachments";
import {
  buildMentionCandidates,
  extractAtMentionNames,
  filterMentionCandidates,
  insertMentionToken,
  nameLocalImageBatch,
  resolvePendingLocalMentions,
  resolveReferencedArtifactIds,
} from "./image-mentions";

function img(partial: Partial<ImageAttachment> & { id: string }): ImageAttachment {
  return {
    name: partial.name ?? "x.png",
    mimeType: "image/png",
    size: 10,
    dataUrl: "data:image/png;base64,aa",
    ...partial,
  };
}

describe("nameLocalImageBatch", () => {
  it("names a first batch 图片1, 图片2", () => {
    const named = nameLocalImageBatch([], [img({ id: "a" }), img({ id: "b" })]);
    expect(named.map((i) => i.name)).toEqual(["图片1", "图片2"]);
  });

  it("continues after existing local names", () => {
    const named = nameLocalImageBatch(
      [img({ id: "0", name: "图片1" })],
      [img({ id: "a" })],
    );
    expect(named[0]?.name).toBe("图片2");
  });
});

describe("buildMentionCandidates", () => {
  it("lists local images first and skips duplicate artifact names", () => {
    const images = [
      img({ id: "l1", name: "图片1", artifactId: "art-1" }),
    ];
    const artifacts: Artifact[] = [
      {
        id: "art-1",
        userId: "u",
        sessionId: "s",
        name: "图片1",
        kind: "image",
        mimeType: "image/png",
        storageKey: "",
        createdAt: "t",
        status: "ready",
      },
      {
        id: "art-2",
        userId: "u",
        sessionId: "s",
        name: "Sunset",
        kind: "image",
        mimeType: "image/png",
        storageKey: "",
        createdAt: "t",
        status: "ready",
      },
    ];
    const list = buildMentionCandidates(images, artifacts);
    expect(list.map((c) => c.name)).toEqual(["图片1", "Sunset"]);
    expect(list[0]?.source).toBe("local");
  });

  it('maps a failed local upload to status "failed" instead of stuck pending', () => {
    const candidates = buildMentionCandidates(
      [img({ id: "l1", name: "图片1", uploadFailed: true })],
      [],
    );
    expect(candidates[0]).toMatchObject({ name: "图片1", status: "failed" });
  });

  it("includes canvases without treating their JSON as an image thumbnail", () => {
    const artifacts: Artifact[] = [
      {
        id: "canvas-1",
        userId: "u",
        sessionId: "s",
        name: "上线流程",
        kind: "canvas",
        mimeType: "application/vnd.reizo.canvas+json",
        storageKey: "",
        createdAt: "t",
        status: "ready",
      },
      {
        id: "note-1",
        userId: "u",
        sessionId: "s",
        name: "说明",
        kind: "markdown",
        mimeType: "text/markdown",
        storageKey: "",
        createdAt: "t",
      },
    ];

    expect(buildMentionCandidates([], artifacts)).toEqual([
      expect.objectContaining({
        artifactId: "canvas-1",
        name: "上线流程",
        kind: "canvas",
        thumbSrc: undefined,
      }),
    ]);
  });
});

describe("extractAtMentionNames", () => {
  it("extracts multiple @图片N tokens in order", () => {
    expect(extractAtMentionNames("将@图片1 和@图片2 合并起来")).toEqual([
      "图片1",
      "图片2",
    ]);
  });
});

describe("resolveReferencedArtifactIds", () => {
  it("maps @图片N to artifact ids from local attachments", () => {
    const images = [
      img({ id: "l1", name: "图片1", artifactId: "a1" }),
      img({ id: "l2", name: "图片2", artifactId: "a2" }),
    ];
    expect(
      resolveReferencedArtifactIds("合并@图片1和@图片2", images, []),
    ).toEqual(["a1", "a2"]);
  });

  it("maps a named canvas mention to its artifact id", () => {
    const artifacts: Artifact[] = [
      {
        id: "canvas-1",
        userId: "u",
        sessionId: "s",
        name: "上线流程",
        kind: "canvas",
        mimeType: "application/vnd.reizo.canvas+json",
        storageKey: "",
        createdAt: "t",
        status: "ready",
      },
    ];
    expect(resolveReferencedArtifactIds("更新 @上线流程", [], artifacts)).toEqual(["canvas-1"]);
  });
});

describe("resolvePendingLocalMentions", () => {
  it("returns mentioned locals still missing artifactId", () => {
    const images = [
      img({ id: "l1", name: "图片1" }),
      img({ id: "l2", name: "图片2", artifactId: "a2" }),
    ];
    const pending = resolvePendingLocalMentions("用@图片1 和@图片2", images);
    expect(pending.map((i) => i.id)).toEqual(["l1"]);
  });
});

describe("insertMentionToken", () => {
  it("replaces the @query range with @图片1 and keeps surrounding text", () => {
    const { text, cursor } = insertMentionToken(
      "将@图合并",
      { start: 1, end: 3 },
      "图片1",
    );
    expect(text).toBe("将@图片1 合并");
    expect(cursor).toBe("将@图片1 ".length);
  });

  it("does not double spaces when a space already follows the query", () => {
    const { text } = insertMentionToken(
      "将@图 合并",
      { start: 1, end: 3 },
      "图片1",
    );
    expect(text).toBe("将@图片1 合并");
  });
});

describe("filterMentionCandidates", () => {
  it("filters by name substring", () => {
    const c = buildMentionCandidates(
      [img({ id: "1", name: "图片1" }), img({ id: "2", name: "图片2" })],
      [],
    );
    expect(filterMentionCandidates(c, "2").map((x) => x.name)).toEqual(["图片2"]);
  });
});
