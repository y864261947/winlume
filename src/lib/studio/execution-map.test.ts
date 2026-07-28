import { describe, expect, it } from "vitest";
import {
  createExecutionMap,
  executionMapLabels,
  reduceExecutionMap,
} from "./execution-map";

describe("reduceExecutionMap", () => {
  it("chat-only path: think → reply → done", () => {
    let s = createExecutionMap();
    s = reduceExecutionMap(s, { type: "reply" });
    s = reduceExecutionMap(s, { type: "finish" });
    expect(executionMapLabels(s)).toEqual([
      "理解任务:done",
      "整理回复:done",
      "完成:done",
    ]);
  });

  it("write_artifact path grows dynamically without todos", () => {
    let s = createExecutionMap();
    s = reduceExecutionMap(s, {
      type: "tool_start",
      callId: "c1",
      toolName: "write_artifact",
      label: "写入「笔记」",
    });
    expect(s.some((x) => x.label.includes("笔记"))).toBe(true);
    s = reduceExecutionMap(s, {
      type: "tool_end",
      callId: "c1",
      toolName: "write_artifact",
      ok: true,
    });
    s = reduceExecutionMap(s, { type: "reply" });
    s = reduceExecutionMap(s, { type: "finish" });
    const ids = s.map((x) => x.id);
    expect(ids[0]).toBe("think");
    expect(ids.some((id) => id.includes("write_artifact"))).toBe(true);
    expect(ids).toContain("reply");
    expect(ids[ids.length - 1]).toBe("done");
  });

  it("todo_write plan snapshot owns status (no auto-advance on tools)", () => {
    let s = createExecutionMap();
    s = reduceExecutionMap(s, {
      type: "plan",
      todos: [
        { id: "a", content: "列卖点", status: "in_progress" },
        { id: "b", content: "写三篇笔记", status: "pending" },
        { id: "c", content: "保存作品", status: "pending" },
      ],
    });
    expect(s.map((x) => x.label)).toEqual([
      "理解任务",
      "列卖点",
      "写三篇笔记",
      "保存作品",
      "完成",
    ]);
    expect(s.find((x) => x.label === "列卖点")?.status).toBe("active");

    // Tool end must NOT advance model todos
    s = reduceExecutionMap(s, {
      type: "tool_end",
      callId: "1",
      toolName: "write_artifact",
      ok: true,
    });
    expect(s.find((x) => x.label === "列卖点")?.status).toBe("active");
    expect(s.find((x) => x.label === "写三篇笔记")?.status).toBe("pending");

    // Model merge update
    s = reduceExecutionMap(s, {
      type: "plan",
      todos: [
        { id: "a", content: "列卖点", status: "completed" },
        { id: "b", content: "写三篇笔记", status: "in_progress" },
        { id: "c", content: "保存作品", status: "pending" },
      ],
    });
    expect(s.find((x) => x.label === "列卖点")?.status).toBe("done");
    expect(s.find((x) => x.label === "写三篇笔记")?.status).toBe("active");
  });

  it("todo_write tool_start does not invent a map step", () => {
    let s = createExecutionMap();
    s = reduceExecutionMap(s, {
      type: "tool_start",
      callId: "p1",
      toolName: "todo_write",
    });
    expect(s.map((x) => x.id)).toEqual(["think", "done"]);
  });

  it("does not keep unused pending steps after finish (event path)", () => {
    let s = createExecutionMap();
    s = reduceExecutionMap(s, { type: "reply" });
    s = reduceExecutionMap(s, { type: "finish" });
    expect(s.every((x) => x.status !== "pending")).toBe(true);
  });
});
