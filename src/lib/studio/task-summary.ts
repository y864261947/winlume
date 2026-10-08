import type { Session } from "@/lib/agent/types";
import type { AgentRun, RunStatus } from "@/lib/agent/infrastructure/types";

export type StudioTask = Session & { runStatus: RunStatus | "unknown" };
export const TASK_STATUS_LABELS: Record<StudioTask["runStatus"], string> = {
  queued: "排队中", running: "进行中", waiting_approval: "待确认", completed: "已完成",
  failed: "执行异常", cancelled: "已停止", unknown: "历史记录",
};

/** A task's state is its latest recorded run, never inferred from its messages. */
export function summarizeStudioTasks(userId: string, sessions: Session[], runs: AgentRun[]): StudioTask[] {
  const latest = new Map<string, AgentRun>();
  for (const run of runs) {
    if (run.userId !== userId) continue;
    const previous = latest.get(run.sessionId);
    if (!previous || run.createdAt > previous.createdAt || (run.createdAt === previous.createdAt && run.updatedAt > previous.updatedAt)) latest.set(run.sessionId, run);
  }
  return sessions.filter(s => s.userId === userId && !s.archived).map(s => ({ ...s, runStatus: latest.get(s.id)?.status ?? "unknown" }));
}
