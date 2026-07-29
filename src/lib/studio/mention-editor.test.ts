import { describe, expect, it } from "vitest";
import {
  hasMentionToken,
  segmentsToText,
  textToSegments,
  type MentionChipMeta,
} from "./mention-editor";

const resolve = (name: string): MentionChipMeta | null => {
  if (name === "图片1" || name === "图片2" || name === "Sunset") {
    return { name, thumbSrc: `thumb:${name}` };
  }
  return null;
};

describe("textToSegments / segmentsToText", () => {
  it("round-trips plain text", () => {
    const segs = textToSegments("hello world", resolve);
    expect(segmentsToText(segs)).toBe("hello world");
  });

  it("turns known @图片N into mention segments", () => {
    const segs = textToSegments("将@图片1 和@图片2 合并", resolve);
    expect(segs).toEqual([
      { type: "text", text: "将" },
      { type: "mention", name: "图片1", thumbSrc: "thumb:图片1" },
      { type: "text", text: " 和" },
      { type: "mention", name: "图片2", thumbSrc: "thumb:图片2" },
      { type: "text", text: " 合并" },
    ]);
    expect(segmentsToText(segs)).toBe("将@图片1 和@图片2 合并");
  });

  it("leaves unknown @tokens as plain text", () => {
    const segs = textToSegments("email a@b.com and @未知", resolve);
    expect(segmentsToText(segs)).toBe("email a@b.com and @未知");
    expect(segs.every((s) => s.type === "text")).toBe(true);
  });

  it("supports non-图片 artifact names when resolved", () => {
    const segs = textToSegments("edit @Sunset please", resolve);
    expect(segs.some((s) => s.type === "mention" && s.name === "Sunset")).toBe(
      true,
    );
  });
});

describe("hasMentionToken", () => {
  it("detects an @ mention token", () => {
    expect(hasMentionToken("帮我把 @图片1 的背景换成蓝色")).toBe(true);
  });

  it("returns false for plain text with no @ token", () => {
    expect(hasMentionToken("画一只坐在窗台上的猫")).toBe(false);
  });

  it("ignores a bare @ with no following non-space characters", () => {
    expect(hasMentionToken("email me @ noon")).toBe(false);
  });
});
