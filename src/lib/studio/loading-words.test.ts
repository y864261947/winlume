import { describe, expect, it } from "vitest";
import { LOADING_WORDS, nextLoadingWordIndex } from "./loading-words";

describe("LOADING_WORDS", () => {
  it("is a non-empty list of unique '中'-suffixed words", () => {
    expect(LOADING_WORDS.length).toBeGreaterThan(0);
    const unique = new Set(LOADING_WORDS);
    expect(unique.size).toBe(LOADING_WORDS.length);
    for (const word of LOADING_WORDS) {
      expect(word.endsWith("中")).toBe(true);
    }
  });
});

describe("nextLoadingWordIndex", () => {
  it("returns 0 when length <= 1", () => {
    expect(nextLoadingWordIndex(null, 0)).toBe(0);
    expect(nextLoadingWordIndex(null, 1)).toBe(0);
    expect(nextLoadingWordIndex(0, 1)).toBe(0);
  });

  it("returns an in-range index on first pick (prevIndex null)", () => {
    for (let i = 0; i < 50; i++) {
      const idx = nextLoadingWordIndex(null, 5);
      expect(idx).toBeGreaterThanOrEqual(0);
      expect(idx).toBeLessThan(5);
    }
  });

  it("never repeats the previous index when length > 1", () => {
    let prev: number | null = 0;
    for (let i = 0; i < 200; i++) {
      const next = nextLoadingWordIndex(prev, 5);
      expect(next).not.toBe(prev);
      expect(next).toBeGreaterThanOrEqual(0);
      expect(next).toBeLessThan(5);
      prev = next;
    }
  });
});
