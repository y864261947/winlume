import { describe, expect, it } from "vitest";
import {
  buildPastedPreview,
  composeOutboundMessage,
  countTextLines,
  createPastedBlock,
  hasComposerPayload,
  nextUploadImageNames,
  parseDataUrl,
  shouldCollapsePaste,
} from "./composer-attachments";

describe("shouldCollapsePaste", () => {
  it("collapses long char counts", () => {
    expect(shouldCollapsePaste("x".repeat(400))).toBe(true);
    expect(shouldCollapsePaste("short")).toBe(false);
  });

  it("collapses many lines", () => {
    const lines = Array.from({ length: 10 }, (_, i) => `line ${i}`).join("\n");
    expect(shouldCollapsePaste(lines)).toBe(true);
    expect(countTextLines(lines)).toBe(10);
  });
});

describe("buildPastedPreview", () => {
  it("truncates with ellipsis", () => {
    const full = Array.from({ length: 20 }, (_, i) => `L${i}`).join("\n");
    const preview = buildPastedPreview(full, 3);
    expect(preview).toContain("L0");
    expect(preview).toContain("…");
    expect(preview).not.toContain("L19");
  });
});

describe("composeOutboundMessage", () => {
  it("joins draft and pasted blocks", () => {
    const block = createPastedBlock("alpha\nbeta", { name: "log.txt" });
    const msg = composeOutboundMessage({
      draft: "请分析",
      pasted: [block],
      images: [],
      files: [],
    });
    expect(msg).toContain("请分析");
    expect(msg).toContain("log.txt");
    expect(msg).toContain("alpha");
  });

  it("hasComposerPayload detects attachments only", () => {
    expect(
      hasComposerPayload({
        draft: "",
        pasted: [createPastedBlock("hello world enough text here")],
        images: [],
        files: [],
      }),
    ).toBe(true);
  });

  it("does not dump --- 图片 --- blobs into the outbound message", () => {
    const msg = composeOutboundMessage({
      draft: "将@图片1 和@图片2 合并起来",
      pasted: [],
      images: [
        {
          id: "a",
          name: "图片1",
          mimeType: "image/png",
          size: 1000,
          dataUrl: "data:image/png;base64,aaa",
        },
        {
          id: "b",
          name: "图片2",
          mimeType: "image/png",
          size: 2000,
          dataUrl: "data:image/png;base64,bbb",
        },
      ],
      files: [],
    });
    expect(msg).toBe("将@图片1 和@图片2 合并起来");
    expect(msg).not.toContain("--- 图片");
    expect(msg).not.toContain("未内联完整 base64");
  });

  it("uses @图片N labels when only images are attached", () => {
    const msg = composeOutboundMessage({
      draft: "",
      pasted: [],
      images: [
        {
          id: "a",
          name: "图片1",
          mimeType: "image/png",
          size: 1000,
          dataUrl: "data:image/png;base64,aaa",
        },
      ],
      files: [],
    });
    expect(msg).toBe("@图片1");
  });
});


describe("nextUploadImageNames", () => {
  it("starts at 图片1 when there are no existing upload names", () => {
    expect(nextUploadImageNames([], 2)).toEqual(["图片1", "图片2"]);
  });

  it("continues from the count of existing 图片N-pattern names", () => {
    expect(nextUploadImageNames(["图片1", "图片2", "Fox"], 2)).toEqual([
      "图片3",
      "图片4",
    ]);
  });

  it("ignores names that don't match the 图片N pattern when counting", () => {
    expect(nextUploadImageNames(["Fox", "Sunset"], 1)).toEqual(["图片1"]);
  });

  it("returns an empty array for count 0", () => {
    expect(nextUploadImageNames(["图片1"], 0)).toEqual([]);
  });

  it("supports reserving one batch before naming a rapid subsequent batch", () => {
    const first = nextUploadImageNames([], 2);
    expect(nextUploadImageNames(first, 2)).toEqual(["图片3", "图片4"]);
  });
});

describe("parseDataUrl", () => {
  it("parses a valid base64 image data URL", () => {
    const b64 = Buffer.from("hello").toString("base64");
    const result = parseDataUrl(`data:image/png;base64,${b64}`);
    expect(result).toEqual({ mimeType: "image/png", bytes: Buffer.from("hello") });
  });

  it("returns null for a non-data URL", () => {
    expect(parseDataUrl("https://example.com/a.png")).toBeNull();
  });

  it("returns null for a data URL missing the base64 marker", () => {
    expect(parseDataUrl("data:image/png,rawtext")).toBeNull();
  });

  it("returns null for an empty base64 payload", () => {
    expect(parseDataUrl("data:image/png;base64,")).toBeNull();
  });

  it("returns null for an illegal base64 payload", () => {
    expect(parseDataUrl("data:image/png;base64,not-base64!")).toBeNull();
  });
});
