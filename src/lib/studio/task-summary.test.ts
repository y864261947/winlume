import { describe, expect, it } from "vitest";
import type { AgentRun } from "@/lib/agent/infrastructure/types";
import type { Session } from "@/lib/agent/types";
import { summarizeStudioTasks } from "./task-summary";

const session = (id: string, userId = "a", archived = false): Session => ({ id, userId, archived, title: id, model: "test", createdAt: "2026-09-29", updatedAt: "2026-09-30" });
const run = (sessionId: string, status: AgentRun["status"], createdAt: string, userId = "a"): AgentRun => ({ schemaVersion: 1, id: `${sessionId}-${createdAt}`, sessionId, userId, status, createdAt, updatedAt: createdAt, attempt: 0, revision: 0, input: {message: "private prompt", executionMode: "studio"} });
describe("Studio task summaries", () => {
  it("never assigns another user's runs or returns their sessions", () => {
    const tasks = summarizeStudioTasks("a", [session("one"), session("other", "b")], [run("one", "completed", "2026-09-30", "b")]);
    expect(tasks).toHaveLength(1); expect(tasks[0].runStatus).toBe("unknown"); expect(tasks[0]).not.toHaveProperty("input");
  });
  it("uses the newest execution, regardless of input ordering or later updates to an older run", () => {
    const older = {...run("one", "failed", "2026-09-28"), updatedAt: "2026-10-01"};
    expect(summarizeStudioTasks("a", [session("one")], [run("one", "running", "2026-09-30"), older])[0].runStatus).toBe("running");
  });
  it("excludes archived sessions and keeps unknown historical records honest", () => {
    expect(summarizeStudioTasks("a", [session("archived", "a", true), session("history")], [])).toEqual([{...session("history"), runStatus:"unknown"}]);
  });
  it.each(["queued", "waiting_approval", "completed", "cancelled"] as const)("preserves %s without inventing progress", status => {
    expect(summarizeStudioTasks("a", [session("one")], [run("one",status,"2026-09-30")])[0].runStatus).toBe(status);
  });
});
