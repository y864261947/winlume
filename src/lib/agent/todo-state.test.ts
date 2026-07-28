import { describe, expect, it } from "vitest";
import {
  TodoState,
  applyMerge,
  applyReplace,
  shouldAutoMerge,
  summarizeTodoState,
  validateNoDuplicateIds,
} from "./todo-state";

describe("TodoState merge/replace", () => {
  it("replace creates items", () => {
    const state = new TodoState();
    applyReplace(state, [
      { id: "a", content: "列卖点", status: "in_progress" },
      { id: "b", content: "写笔记", status: "pending" },
    ]);
    expect(state.list().map((t) => t.content)).toEqual(["列卖点", "写笔记"]);
  });

  it("merge flips status without content", () => {
    const state = new TodoState();
    applyReplace(state, [
      { id: "a", content: "列卖点", status: "in_progress" },
      { id: "b", content: "写笔记", status: "pending" },
    ]);
    applyMerge(state, [
      { id: "a", status: "completed" },
      { id: "b", status: "in_progress" },
    ]);
    expect(state.list()[0]).toMatchObject({
      content: "列卖点",
      status: "completed",
    });
    expect(state.list()[1]).toMatchObject({
      content: "写笔记",
      status: "in_progress",
    });
  });

  it("auto-merge when status-only without merge flag", () => {
    const state = new TodoState();
    applyReplace(state, [
      { id: "1", content: "调研", status: "in_progress" },
    ]);
    expect(
      shouldAutoMerge(state, false, [{ id: "1", status: "completed" }]),
    ).toBe(true);
  });

  it("rejects duplicate ids", () => {
    expect(
      validateNoDuplicateIds([
        { id: "x", content: "A" },
        { id: "x", content: "B" },
      ]),
    ).toBe("x");
  });

  it("summarize lists statuses", () => {
    const state = new TodoState();
    applyReplace(state, [
      { id: "1", content: "A", status: "completed" },
      { id: "2", content: "B", status: "in_progress" },
    ]);
    const s = summarizeTodoState(state);
    expect(s).toContain("[completed]");
    expect(s).toContain("[in_progress]");
  });
});
