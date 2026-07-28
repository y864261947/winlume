import { describe, expect, it } from "vitest";
import {
  artifactNameFromTurn,
  looksLikeArtifactAckOnly,
  shouldAutoPersistArtifact,
  userIntentLooksDeliverable,
} from "./auto-artifact";

const longNotes = `下面继续给你 3 篇小红书风格种草笔记

**笔记 1**

**标题：**  
最近被这支新品手冲咖啡香迷糊了

**正文：**  
${"很长的正文内容。".repeat(40)}

**标签建议：**  
#新品咖啡 #手冲咖啡

**笔记 2**

**标题：**  
周末慢下来

**正文：**  
${"第二篇正文。".repeat(40)}
`;

describe("shouldAutoPersistArtifact", () => {
  it("saves xiaohongshu multi-note deliverables", () => {
    expect(
      shouldAutoPersistArtifact(
        "为新品手冲咖啡写三篇小红书种草笔记，含标题、正文和标签建议。",
        longNotes,
      ),
    ).toBe(true);
  });

  it("skips short chat replies", () => {
    expect(
      shouldAutoPersistArtifact("你好", "你好！有什么可以帮你的？"),
    ).toBe(false);
  });

  it("skips short saved-ack messages", () => {
    expect(
      shouldAutoPersistArtifact(
        "写报告",
        "已保存为作品「竞品调研提纲」，可在右侧预览。",
      ),
    ).toBe(false);
  });
});

describe("looksLikeArtifactAckOnly", () => {
  it("detects short save acks", () => {
    expect(
      looksLikeArtifactAckOnly(
        "已保存为作品「竞品调研提纲」，可在右侧预览。",
      ),
    ).toBe(true);
  });
});

describe("userIntentLooksDeliverable", () => {
  it("detects marketing note asks", () => {
    expect(
      userIntentLooksDeliverable(
        "为新品手冲咖啡写三篇小红书种草笔记，含标题、正文和标签建议。",
      ),
    ).toBe(true);
  });
});

describe("artifactNameFromTurn", () => {
  it("prefers markdown heading", () => {
    expect(
      artifactNameFromTurn("写点东西", "# 手冲咖啡种草笔记合集\n\n正文"),
    ).toBe("手冲咖啡种草笔记合集");
  });
});
