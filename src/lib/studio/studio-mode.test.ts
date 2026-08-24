import { describe, expect, it } from "vitest";
import {
  DEFAULT_DRAW_TOOL_ID,
  DRAW_FAMILY_ITEMS,
  isDrawToolId,
  studioDrawHref,
  studioModeFromPathname,
  studioShowsSessionSidebar,
  studioToolHref,
} from "./studio-mode";

describe("studio modes", () => {
  it("maps chat, project, and home routes to the workbench", () => {
    expect(studioModeFromPathname("/studio")).toBe("workbench");
    expect(studioModeFromPathname("/studio/c/abc")).toBe("workbench");
    expect(studioModeFromPathname("/studio/p/proj")).toBe("workbench");
    expect(studioModeFromPathname("/studio/inspire")).toBe("workbench");
  });

  it("maps draw and the asset library as first-class modes", () => {
    expect(studioModeFromPathname("/studio/draw")).toBe("draw");
    expect(studioModeFromPathname("/studio/draw/ecommerce-image-set")).toBe("draw");
    expect(studioModeFromPathname("/studio/artifacts")).toBe("artifacts");
  });

  it("keeps the catalog inside the workbench after removing 工具 from the rail", () => {
    expect(studioModeFromPathname("/studio/tools/c/visual-media")).toBe("workbench");
    expect(studioModeFromPathname("/studio/skills")).toBe("workbench");
  });

  it("hides the session sidebar only in draw mode", () => {
    expect(studioShowsSessionSidebar("workbench")).toBe(true);
    expect(studioShowsSessionSidebar("tools")).toBe(true);
    expect(studioShowsSessionSidebar("artifacts")).toBe(true);
    expect(studioShowsSessionSidebar("draw")).toBe(false);
  });

  it("sends image tools into the draw workbench and leaves others on the catalog", () => {
    expect(isDrawToolId(DEFAULT_DRAW_TOOL_ID)).toBe(true);
    expect(studioDrawHref()).toBe("/studio/draw/ecommerce-image-set");
    expect(studioToolHref("background-removal")).toBe("/studio/draw/background-removal");
    expect(studioToolHref("not-a-tool")).toBe("/studio/tools/not-a-tool");
  });

  it("keeps coming-soon family items off the live routes", () => {
    const soon = DRAW_FAMILY_ITEMS.filter((item) => item.soon);
    expect(soon.map((item) => item.label)).toEqual(["复刻", "扩图"]);
    expect(soon.every((item) => item.href === null)).toBe(true);
  });
});
