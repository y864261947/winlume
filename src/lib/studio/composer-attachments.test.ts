import { describe, expect, it } from "vitest";
import {
  buildPastedPreview,
  composeOutboundMessage,
  countTextLines,
  createPastedBlock,
  hasComposerPayload,
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
});
