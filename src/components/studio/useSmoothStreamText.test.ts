import { describe, expect, it } from "vitest";
import { nextRevealChunk } from "./useSmoothStreamText";

describe("nextRevealChunk", () => {
  it("returns an empty chunk for empty input", () => {
    expect(nextRevealChunk("")).toBe("");
  });

  it("reveals one CJK character per tick", () => {
    expect(nextRevealChunk("你好世界")).toBe("你");
    expect(nextRevealChunk("好世界")).toBe("好");
  });

  it("reveals a whole Latin word plus trailing space per tick", () => {
    expect(nextRevealChunk("hello world")).toBe("hello ");
    expect(nextRevealChunk("world")).toBe("world");
  });

  it("keeps punctuation attached to the preceding word", () => {
    expect(nextRevealChunk("hello, world!")).toBe("hello, ");
    expect(nextRevealChunk("world!")).toBe("world!");
  });

  it("reveals leading whitespace/newline runs immediately, in one chunk", () => {
    expect(nextRevealChunk("\n\nNext paragraph")).toBe("\n\n");
    expect(nextRevealChunk("   indented")).toBe("   ");
  });

  it("stops a Latin word chunk at a CJK boundary without swallowing it", () => {
    expect(nextRevealChunk("API你好")).toBe("API");
    expect(nextRevealChunk("你好API")).toBe("你");
  });

  it("reveals numbers as part of the same word chunk", () => {
    expect(nextRevealChunk("GPT-4o mini")).toBe("GPT-4o ");
  });

  it("never returns an empty chunk for non-empty input, guaranteeing progress", () => {
    for (const sample of ["a", "中", " ", ".", "😀 wave", "混合mix文本"]) {
      let remaining = sample;
      let guard = 0;
      while (remaining.length > 0 && guard < 100) {
        const chunk = nextRevealChunk(remaining);
        expect(chunk.length).toBeGreaterThan(0);
        remaining = remaining.slice(chunk.length);
        guard++;
      }
      expect(remaining).toBe("");
    }
  });
});
