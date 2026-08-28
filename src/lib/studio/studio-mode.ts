import type { StudioToolId } from "./tool-catalog";

export const STUDIO_MODE_IDS = ["workbench", "draw", "tools", "artifacts"] as const;
export type StudioModeId = (typeof STUDIO_MODE_IDS)[number];

export const DEFAULT_DRAW_TOOL_ID = "ecommerce-image-set" satisfies StudioToolId;

export const DRAW_TOOL_IDS = [
  "ecommerce-image-set",
  "background-removal",
  "image-clarity",
  "watermark-subtitle-removal",
  "image-fusion",
] as const satisfies readonly StudioToolId[];

export type DrawToolId = (typeof DRAW_TOOL_IDS)[number];

export function isDrawToolId(toolId: string): toolId is DrawToolId {
  return (DRAW_TOOL_IDS as readonly string[]).includes(toolId);
}

export function studioDrawHref(toolId: string = DEFAULT_DRAW_TOOL_ID): string {
  return `/studio/draw/${encodeURIComponent(toolId)}`;
}

export function studioToolHref(toolId: string): string {
  return isDrawToolId(toolId) ? studioDrawHref(toolId) : `/studio/tools/${encodeURIComponent(toolId)}`;
}

export const STUDIO_MODE_HREFS: Record<StudioModeId, string> = {
  workbench: "/studio",
  draw: studioDrawHref(),
  tools: "/studio/tools",
  artifacts: "/studio/artifacts",
};

export const STUDIO_MODE_ITEMS: readonly {
  id: StudioModeId;
  label: string;
  href: string;
  dividerAfter?: boolean;
}[] = [
  { id: "workbench", label: "工作台", href: STUDIO_MODE_HREFS.workbench, dividerAfter: true },
  { id: "draw", label: "生图", href: STUDIO_MODE_HREFS.draw, dividerAfter: true },
  { id: "artifacts", label: "资产库", href: STUDIO_MODE_HREFS.artifacts },
];

export const DRAW_FAMILY_ITEMS: readonly {
  id: string;
  label: string;
  href: string | null;
  soon: boolean;
}[] = [
  { id: "ecommerce-image-set", label: "套图", href: studioDrawHref("ecommerce-image-set"), soon: false },
  { id: "background-removal", label: "抠图", href: studioDrawHref("background-removal"), soon: false },
  { id: "image-clarity", label: "清晰", href: studioDrawHref("image-clarity"), soon: false },
  { id: "watermark-subtitle-removal", label: "水印", href: studioDrawHref("watermark-subtitle-removal"), soon: false },
  { id: "image-fusion", label: "融图", href: studioDrawHref("image-fusion"), soon: false },
  { id: "hot-image", label: "复刻", href: null, soon: true },
  { id: "expand-image", label: "扩图", href: null, soon: true },
];

export function studioModeFromPathname(pathname: string): StudioModeId {
  if (pathname === "/studio/draw" || pathname.startsWith("/studio/draw/")) return "draw";
  if (pathname === "/studio/artifacts" || pathname.startsWith("/studio/artifacts/")) {
    return "artifacts";
  }
  return "workbench";
}

/** Home / session / project canvas that owns WorkspaceTabsHost. Catalog routes stay workbench but must not be covered by that canvas. */
export function isStudioCanvasPath(pathname: string): boolean {
  if (pathname === "/studio") return true;
  if (pathname.startsWith("/studio/c/")) return true;
  if (pathname.startsWith("/studio/p/")) return true;
  if (pathname === "/studio/inspire" || pathname.startsWith("/studio/inspire/")) return true;
  return false;
}

export function studioShowsSessionSidebar(mode: StudioModeId): boolean {
  return mode !== "draw";
}
