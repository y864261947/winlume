import { describe, expect, it } from "vitest";
import {
  PORTAL_FRAME_SPECS,
  compactPortalImageAdjust,
  portalImageStyle,
  resolvePortalImageAdjust,
  type PortalPreviewKind,
} from "./image-framing";

const KINDS: PortalPreviewKind[] = [
  "carousel",
  "application-featured",
  "application-support",
  "capability",
];

describe("portal image framing", () => {
  it("covers every preview kind with a spec", () => {
    for (const kind of KINDS) expect(PORTAL_FRAME_SPECS[kind]).toBeDefined();
  });

  it("defaults every kind to cover so uploads never letterbox", () => {
    // `contain` was what produced the beige bars on the carousel.
    for (const kind of KINDS) {
      expect(PORTAL_FRAME_SPECS[kind].defaults.fit).toBe("cover");
    }
  });

  it("uses aspect ratios measured from the real desktop cards", () => {
    const ratio = (kind: PortalPreviewKind) => {
      const [w, h] = PORTAL_FRAME_SPECS[kind].aspectRatio.split("/").map((n) => Number(n.trim()));
      return w / h;
    };
    expect(ratio("carousel")).toBeCloseTo(631 / 360, 3);
    expect(ratio("application-featured")).toBeCloseTo(774 / 417, 3);
    expect(ratio("application-support")).toBeCloseTo(432 / 201, 3);
    expect(ratio("capability")).toBeCloseTo(545 / 224, 3);
  });

  it("keeps the capability subject clear of the white left scrim", () => {
    // The card paints a left-to-right white gradient over the artwork.
    expect(PORTAL_FRAME_SPECS.capability.defaults.x).toBe(100);
  });

  it("never applies a hidden zoom multiplier", () => {
    // The old CSS scaled uploads 1.08x/1.04x without showing it in the editor.
    for (const kind of KINDS) {
      expect(portalImageStyle(kind, undefined).transform).toBe("scale(1)");
    }
  });

  it("emits a complete style so stale CSS defaults cannot leak through", () => {
    const style = portalImageStyle("application-support", { x: 20, zoom: 1.5 });
    expect(style).toEqual({
      objectFit: "cover",
      objectPosition: "20% 50%",
      transform: "scale(1.5)",
    });
  });

  it("resolves partial adjustments against the kind's defaults", () => {
    expect(resolvePortalImageAdjust("capability", { y: 10 })).toEqual({
      fit: "cover",
      x: 100,
      y: 10,
      zoom: 1,
    });
  });

  it("round-trips a compacted adjustment to the same rendered style", () => {
    const adjust = { fit: "cover" as const, x: 100, y: 50, zoom: 1 };
    const compact = compactPortalImageAdjust("capability", adjust);
    expect(compact).toEqual({});
    expect(portalImageStyle("capability", compact)).toEqual(
      portalImageStyle("capability", adjust),
    );
  });

  it("retains non-default values when compacting", () => {
    expect(compactPortalImageAdjust("carousel", { fit: "contain", x: 50, zoom: 1.2 })).toEqual({
      fit: "contain",
      zoom: 1.2,
    });
  });
});
