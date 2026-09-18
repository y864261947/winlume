import type { PortalImageAdjust } from "./content-config";

/**
 * Single source of truth for how admin-uploaded portal images are framed.
 *
 * Both the homepage renderer (`ModelMarket`) and the admin preview dialog
 * (`PortalImageAdjustDialog`) import from here, so the "preview and adjust"
 * editor can no longer drift away from what the homepage actually paints.
 *
 * Ratios below are measured from the real desktop layout:
 *   canvas           --reizo-public-canvas: 1800px
 *   .portal-frame    padding 0 40px            -> 1720px content width
 *
 *   carousel             .portal-discovery-grid col 2 of
 *                        minmax(340px,.9fr) minmax(430px,1.1fr) minmax(390px,.95fr), gap 14
 *                        -> (1720 - 28) * 1.1/2.95 = 631px, row height 360px
 *   application-featured .portal-app-showcase-v2 padding 0 28px -> 1664px
 *                        .portal-featured-app-grid minmax(0,.883fr) minmax(0,1fr), gap 14
 *                        -> (1664 - 14) * .883/1.883 = 774px, height 417px
 *   application-support  support grid col = (1664 - 14) * 1/1.883 = 876px,
 *                        repeat(2, 1fr) gap 12 -> 432px, row height 201px
 *   capability           .portal-system-rail padding 0 28px -> 1664px
 *                        .portal-capability-showcase repeat(3, 1fr) gap 14
 *                        -> (1664 - 28)/3 = 545px, height 224px
 */
export type PortalPreviewKind =
  | "carousel"
  | "application-featured"
  | "application-support"
  | "capability";

export type PortalFrameSpec = {
  /** CSS aspect-ratio for the admin preview frame. */
  aspectRatio: string;
  /** Backdrop painted behind the image, matching the real card. */
  background: string;
  /** Default framing applied when the admin has not adjusted the image. */
  defaults: Required<Pick<PortalImageAdjust, "fit" | "x" | "y" | "zoom">>;
  /** Human label used in the dialog title. */
  label: string;
  /** Recommended upload size (2x), surfaced to the admin. */
  recommended: string;
};

export const PORTAL_FRAME_SPECS: Record<PortalPreviewKind, PortalFrameSpec> = {
  carousel: {
    aspectRatio: "631 / 360",
    background: "#ebe4d8",
    // Cover by default: `contain` is what produced the beige letterbox bars,
    // because uploads rarely match the wide 1.75 card ratio.
    defaults: { fit: "cover", x: 50, y: 50, zoom: 1 },
    label: "首页轮播图",
    recommended: "1262 × 720",
  },
  "application-featured": {
    aspectRatio: "774 / 417",
    background: "#172a55",
    defaults: { fit: "cover", x: 50, y: 50, zoom: 1 },
    label: "热门应用 · 主推大卡",
    recommended: "1548 × 834",
  },
  "application-support": {
    aspectRatio: "432 / 201",
    background: "#172a55",
    defaults: { fit: "cover", x: 50, y: 50, zoom: 1 },
    label: "热门应用 · 支撑小卡",
    recommended: "864 × 402",
  },
  capability: {
    aspectRatio: "545 / 224",
    background: "linear-gradient(115deg, #f8fbff 0%, #eef5ff 100%)",
    // The card paints a white left-to-right scrim over the artwork, so the
    // subject has to sit on the right edge to survive.
    defaults: { fit: "cover", x: 100, y: 50, zoom: 1 },
    label: "能力模块卡",
    recommended: "1090 × 448",
  },
};

/** Resolve an adjust record against the kind's defaults. */
export function resolvePortalImageAdjust(
  kind: PortalPreviewKind,
  adjust: PortalImageAdjust | undefined,
): Required<Pick<PortalImageAdjust, "fit" | "x" | "y" | "zoom">> {
  const { defaults } = PORTAL_FRAME_SPECS[kind];
  return {
    fit: adjust?.fit ?? defaults.fit,
    x: adjust?.x ?? defaults.x,
    y: adjust?.y ?? defaults.y,
    zoom: adjust?.zoom ?? defaults.zoom,
  };
}

/**
 * Build the inline style for an admin-managed image.
 *
 * Always returns a complete style so the homepage never silently falls back to
 * a stale CSS default (the previous `transform: scale(1.08)` / `object-position:
 * right center` rules cropped uploads in ways the editor never showed).
 */
export function portalImageStyle(
  kind: PortalPreviewKind,
  adjust: PortalImageAdjust | undefined,
): {
  objectFit: "contain" | "cover";
  objectPosition: string;
  transform: string;
} {
  const { fit, x, y, zoom } = resolvePortalImageAdjust(kind, adjust);
  return {
    objectFit: fit,
    objectPosition: `${x}% ${y}%`,
    transform: `scale(${Math.round(zoom * 1000) / 1000})`,
  };
}

/** Strip values that equal the kind's default so stored config stays minimal. */
export function compactPortalImageAdjust(
  kind: PortalPreviewKind,
  adjust: PortalImageAdjust,
): PortalImageAdjust {
  const { defaults } = PORTAL_FRAME_SPECS[kind];
  const next: PortalImageAdjust = { ...adjust };
  if (next.fit === defaults.fit) delete next.fit;
  if (next.x === defaults.x) delete next.x;
  if (next.y === defaults.y) delete next.y;
  if (next.zoom === defaults.zoom) delete next.zoom;
  return next;
}
