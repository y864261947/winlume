/**
 * Dynamic execution map for a single assistant turn.
 *
 * Two sources of truth (in priority order):
 * 1. Model todo_write checklist (SSE `plan` with todos) — model owns status
 * 2. Event-driven fallback when no todos: tool_start/end, writing, reply
 */

import {
  todoStatusToStepStatus,
  type TodoStatus,
} from "@/lib/agent/todo-state";

export type ExecutionStepStatus = "done" | "active" | "pending";

export type ExecutionStep = {
  /** Stable id within the turn (think | todo:<id> | tool:… | reply | done) */
  id: string;
  label: string;
  status: ExecutionStepStatus;
  /** Optional tool name for styling */
  toolName?: string;
  /** When true, steps come from model todo_write — don't invent tool rows */
  fromTodo?: boolean;
};

export type PlanTodoSnapshot = {
  id: string;
  content: string;
  status: TodoStatus;
};

export type ExecutionMapEvent =
  | { type: "start" }
  /** Full checklist snapshot from todo_write (preferred). */
  | { type: "plan"; todos: PlanTodoSnapshot[]; steps?: string[] }
  | { type: "tool_start"; callId: string; toolName: string; label?: string }
  | { type: "tool_end"; callId: string; toolName: string; ok?: boolean }
  | { type: "writing"; name?: string }
  | { type: "reply" }
  | { type: "finish" };

const LABELS: Record<string, string> = {
  think: "理解任务",
  reply: "整理回复",
  done: "完成",
  todo_write: "更新进度",
  declare_plan: "更新进度",
  write_artifact: "写入作品",
  read_artifact: "读取作品",
  list_artifacts: "查看作品",
};

function toolLabel(toolName: string, override?: string): string {
  if (override?.trim()) return override.trim();
  return LABELS[toolName] ?? "调用工具";
}

function markActiveDone(steps: ExecutionStep[]): ExecutionStep[] {
  return steps.map((s) =>
    s.status === "active" ? { ...s, status: "done" as const } : s,
  );
}

function insertBeforeDone(
  steps: ExecutionStep[],
  step: ExecutionStep,
): ExecutionStep[] {
  const withoutDup = steps.filter((s) => s.id !== step.id && s.id !== "done");
  const done = steps.find((s) => s.id === "done") ?? {
    id: "done",
    label: LABELS.done,
    status: "pending" as const,
  };
  return [...withoutDup, step, { ...done, status: "pending" }];
}

function setActive(steps: ExecutionStep[], id: string): ExecutionStep[] {
  return steps.map((s) => {
    if (s.id === id) return { ...s, status: "active" as const };
    if (s.status === "active") return { ...s, status: "done" as const };
    return s;
  });
}

function hasModelTodos(steps: ExecutionStep[]): boolean {
  return steps.some((s) => s.fromTodo || s.id.startsWith("todo:"));
}

/** Initial map when a turn begins. */
export function createExecutionMap(): ExecutionStep[] {
  return [
    { id: "think", label: LABELS.think, status: "active" },
    { id: "done", label: LABELS.done, status: "pending" },
  ];
}

/**
 * Apply one progress event; returns a new steps array.
 */
export function reduceExecutionMap(
  prev: ExecutionStep[] | undefined,
  event: ExecutionMapEvent,
): ExecutionStep[] {
  let steps = prev?.length ? [...prev] : createExecutionMap();

  switch (event.type) {
    case "start":
      return createExecutionMap();

    case "plan": {
      // Prefer structured todos from todo_write
      let todos = event.todos?.filter((t) => t.id?.trim() && t.content?.trim()) ?? [];
      // Legacy: steps: string[] only
      if (!todos.length && event.steps?.length) {
        todos = event.steps
          .map((s) => s.trim())
          .filter(Boolean)
          .slice(0, 12)
          .map((content, i) => ({
            id: `step_${i + 1}`,
            content,
            status: (i === 0 ? "in_progress" : "pending") as TodoStatus,
          }));
      }
      if (!todos.length) return steps;

      const think = steps.find((s) => s.id === "think") ?? {
        id: "think",
        label: LABELS.think,
        status: "done" as const,
      };

      return [
        { ...think, status: "done" as const },
        ...todos.slice(0, 12).map((t) => ({
          id: `todo:${t.id}`,
          label: t.content.trim().slice(0, 28),
          status: todoStatusToStepStatus(t.status),
          fromTodo: true as const,
        })),
        { id: "done", label: LABELS.done, status: "pending" as const },
      ];
    }

    case "tool_start": {
      // Progress tools only update via plan event
      if (
        event.toolName === "todo_write" ||
        event.toolName === "declare_plan"
      ) {
        return steps;
      }
      // Model checklist owns the map — don't invent tool rows
      if (hasModelTodos(steps)) {
        return steps;
      }
      const id = `tool:${event.toolName}:${event.callId}`;
      const label = toolLabel(event.toolName, event.label);
      steps = markActiveDone(steps);
      if (!steps.some((s) => s.id === id)) {
        steps = insertBeforeDone(steps, {
          id,
          label,
          status: "active",
          toolName: event.toolName,
        });
      } else {
        steps = setActive(
          steps.map((s) =>
            s.id === id ? { ...s, label, toolName: event.toolName } : s,
          ),
          id,
        );
      }
      return steps;
    }

    case "tool_end": {
      if (
        event.toolName === "todo_write" ||
        event.toolName === "declare_plan"
      ) {
        return steps;
      }
      // Model owns checklist progress — tool_end must not auto-advance
      if (hasModelTodos(steps)) {
        return steps;
      }
      const id = `tool:${event.toolName}:${event.callId}`;
      const match =
        steps.find((s) => s.id === id) ??
        steps.find(
          (s) => s.toolName === event.toolName && s.status === "active",
        );
      if (!match) return steps;
      return steps.map((s) =>
        s.id === match.id
          ? {
              ...s,
              status: "done" as const,
              label:
                event.ok === false
                  ? `${s.label.replace(/失败$/, "")}失败`
                  : s.label,
            }
          : s,
      );
    }

    case "writing": {
      if (hasModelTodos(steps)) {
        return steps;
      }
      const writeStep = steps.find(
        (s) =>
          s.toolName === "write_artifact" ||
          s.id.startsWith("tool:write_artifact:"),
      );
      const label = event.name?.trim()
        ? `写入「${event.name.trim().slice(0, 14)}${event.name.trim().length > 14 ? "…" : ""}」`
        : LABELS.write_artifact;

      if (writeStep) {
        return steps
          .map((s) =>
            s.id === writeStep.id
              ? {
                  ...s,
                  label,
                  status:
                    s.status === "pending" ? ("active" as const) : s.status,
                }
              : s.status === "active" && s.id !== writeStep.id
                ? { ...s, status: "done" as const }
                : s,
          )
          .map((s) =>
            s.id === writeStep.id && s.status !== "done"
              ? { ...s, status: "active" as const, label }
              : s,
          );
      }

      const provisionalId = "tool:write_artifact:streaming";
      steps = markActiveDone(steps);
      if (!steps.some((s) => s.id === provisionalId)) {
        steps = insertBeforeDone(steps, {
          id: provisionalId,
          label,
          status: "active",
          toolName: "write_artifact",
        });
      } else {
        steps = setActive(
          steps.map((s) =>
            s.id === provisionalId ? { ...s, label } : s,
          ),
          provisionalId,
        );
      }
      return steps;
    }

    case "reply": {
      // With model todos, reply is just chat — don't clutter the checklist
      if (hasModelTodos(steps)) {
        return steps;
      }
      if (!steps.some((s) => s.id === "reply")) {
        steps = markActiveDone(steps);
        steps = insertBeforeDone(steps, {
          id: "reply",
          label: LABELS.reply,
          status: "active",
        });
      } else {
        steps = setActive(steps, "reply");
      }
      return steps;
    }

    case "finish": {
      // Keep model todos as the model left them; still mark shell done.
      if (hasModelTodos(steps)) {
        return steps
          .map((s) => {
            if (s.id === "done") return { ...s, status: "done" as const };
            if (s.id === "think") return { ...s, status: "done" as const };
            // Leave todo statuses alone (already done/active/pending from model)
            return s;
          })
          .filter((s) => {
            if (s.id === "done" || s.fromTodo || s.id.startsWith("todo:")) {
              return true;
            }
            if (s.status === "pending") return false;
            return true;
          });
      }
      return steps
        .map((s) =>
          s.id === "done"
            ? { ...s, status: "active" as const }
            : s.status === "pending"
              ? s
              : { ...s, status: "done" as const },
        )
        .filter((s) => {
          if (s.id === "done") return true;
          if (s.status === "pending") return false;
          return true;
        })
        .map((s) =>
          s.id === "done" ? { ...s, status: "done" as const } : s,
        );
    }

    default:
      return steps;
  }
}

/** Compact label list for debugging / tests */
export function executionMapLabels(steps: ExecutionStep[]): string[] {
  return steps.map((s) => `${s.label}:${s.status}`);
}
