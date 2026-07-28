import { describe, expect, it } from "vitest";
import {
  formatCharCount,
  friendlyToolGroupSummary,
  friendlyToolView,
} from "./tool-display";

describe("friendlyToolView todo_write", () => {
  it("shows progress copy", () => {
    const view = friendlyToolView("todo_write", {
      status: "done",
      ok: true,
      summary: "进度更新 · 进行中：写三篇笔记",
    });
    expect(view.actionLabel).toBe("进度已更新");
    expect(view.resultLine).toContain("写三篇笔记");
  });
});

describe("friendlyToolView write_artifact", () => {
  it("hides id/kind noise and shows title", () => {
    const view = friendlyToolView("write_artifact", {
      status: "done",
      ok: true,
      summary:
        'Saved artifact "新品手冲咖啡小红书种草笔记 3 篇" (id=0639241b-fd64-4601-ac40-0d7ba2d7e8f3, kind=markdown, 1675 chars)',
    });
    expect(view.actionLabel).toBe("已保存「新品手冲咖啡小红书种草笔记 3 篇」");
    expect(view.artifactId).toBe("0639241b-fd64-4601-ac40-0d7ba2d7e8f3");
    expect(view.resultLine).toContain("Markdown");
    expect(view.resultLine).not.toMatch(/id=/i);
    expect(view.resultLine).not.toMatch(/0639241b/);
  });

  it("shows running state without technical name", () => {
    const view = friendlyToolView("write_artifact", {
      status: "running",
      input: { name: "竞品报告" },
    });
    expect(view.actionLabel).toContain("竞品报告");
    expect(view.actionLabel).not.toContain("write_artifact");
  });
});

describe("formatCharCount", () => {
  it("formats thousands", () => {
    expect(formatCharCount(1675)).toMatch(/千字|1675/);
  });
});

describe("friendlyToolGroupSummary", () => {
  it("uses friendly labels", () => {
    const s = friendlyToolGroupSummary([
      {
        name: "write_artifact",
        status: "done",
        ok: true,
        resultSummary:
          'Saved artifact "A" (id=x, kind=markdown, 100 chars)',
      },
    ]);
    expect(s).toContain("已保存");
    expect(s).not.toContain("write_artifact");
  });
});
