import { describe, expect, it } from "vitest";
import { listStudioTools } from "@/lib/studio/tool-catalog";
import {
  filterStudioTools,
  getSlashMenuItems,
  placeMenuAroundAnchor,
} from "./SkillSlashMenu";

describe("slash menu tools", () => {
  const tools = listStudioTools();

  it("matches 抠图 aliases before skills", () => {
    expect(filterStudioTools(tools, "抠图").map((tool) => tool.id)).toEqual([
      "background-removal",
    ]);
    expect(filterStudioTools(tools, "transparent").map((tool) => tool.id)).toEqual([]);
    expect(filterStudioTools(tools, "cutout")[0]?.id).toBe("background-removal");
  });

  it("puts the cutout tool at the top of the root menu", () => {
    const items = getSlashMenuItems([], [], "", { kind: "root" }, tools);
    expect(items[0]).toMatchObject({
      type: "tool",
      tool: { id: "background-removal" },
    });
  });

  it("surfaces the cutout tool when searching 去背景", () => {
    const items = getSlashMenuItems([], [], "去背景", { kind: "root" }, tools);
    expect(items.some((item) => item.type === "tool" && item.tool.id === "background-removal")).toBe(
      true,
    );
  });

  it("finds every image editing tool through its common intent", () => {
    expect(filterStudioTools(tools, "超分")[0]?.id).toBe("image-clarity");
    expect(filterStudioTools(tools, "去字幕")[0]?.id).toBe("watermark-subtitle-removal");
    expect(filterStudioTools(tools, "图片融合")[0]?.id).toBe("image-fusion");
    expect(filterStudioTools(tools, "商品套图")[0]?.id).toBe("ecommerce-image-set");
  });
});

describe("placeMenuAroundAnchor", () => {
  const viewport = { width: 1280, height: 800 };
  const menu = { width: 480, height: 384 };

  it("sits below the trigger without overlapping it when there is room", () => {
    const anchor = { top: 500, bottom: 536, left: 80 };
    const placed = placeMenuAroundAnchor(anchor, menu, viewport);
    expect(placed.placement).toBe("below");
    expect(placed.top).toBeGreaterThanOrEqual(anchor.bottom);
    expect(placed.top).toBeGreaterThanOrEqual(8);
  });

  it("shrinks below the trigger instead of covering it", () => {
    const anchor = { top: 200, bottom: 236, left: 80 };
    const placed = placeMenuAroundAnchor(anchor, menu, viewport);
    expect(placed.placement).toBe("below");
    expect(placed.top).toBeGreaterThanOrEqual(anchor.bottom);
  });

  it("flips above only when space below cannot hold a usable menu", () => {
    const anchor = { top: 720, bottom: 756, left: 80 };
    const placed = placeMenuAroundAnchor(anchor, menu, viewport);
    expect(placed.placement).toBe("above");
    expect(placed.top + Math.min(menu.height, placed.maxHeight)).toBeLessThanOrEqual(anchor.top);
  });

  it("uses the real short height so a small menu still hugs the trigger", () => {
    const anchor = { top: 400, bottom: 436, left: 80 };
    const placed = placeMenuAroundAnchor(anchor, { width: 480, height: 120 }, viewport);
    expect(placed.placement).toBe("below");
    expect(placed.top).toBe(436 + 8);
  });
});
