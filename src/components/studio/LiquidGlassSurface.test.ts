import { describe, expect, it } from "vitest";
import { isLiquidGlassEligible } from "./LiquidGlassSurface";

describe("isLiquidGlassEligible", () => {
  it("requires WebGL on a fine-pointer display without reduced transparency", () => {
    expect(
      isLiquidGlassEligible({
        hasWebGl: true,
        coarsePointer: false,
        reducedTransparency: false,
      }),
    ).toBe(true);
  });

  it.each([
    { hasWebGl: false, coarsePointer: false, reducedTransparency: false },
    { hasWebGl: true, coarsePointer: true, reducedTransparency: false },
    { hasWebGl: true, coarsePointer: false, reducedTransparency: true },
  ])("falls back to CSS when %o", (capability) => {
    expect(isLiquidGlassEligible(capability)).toBe(false);
  });
});
