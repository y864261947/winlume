/**
 * Turn-scoped todo checklist (Grok Build–style todo_write).
 * Model owns progress; harness merges updates and streams a full snapshot to the UI.
 */

export type TodoStatus = "pending" | "in_progress" | "completed" | "cancelled";

export type TodoItem = {
  id: string;
  content: string;
  status: TodoStatus;
};

export type TodoUpdate = {
  id: string;
  content?: string;
  status?: TodoStatus;
};

const STATUSES: readonly TodoStatus[] = [
  "pending",
  "in_progress",
  "completed",
  "cancelled",
] as const;

export function isTodoStatus(v: unknown): v is TodoStatus {
  return typeof v === "string" && (STATUSES as readonly string[]).includes(v);
}

export class TodoState {
  private items = new Map<string, TodoItem>();
  /** Insertion order */
  private order: string[] = [];

  clear(): void {
    this.items.clear();
    this.order = [];
  }

  isEmpty(): boolean {
    return this.order.length === 0;
  }

  hasId(id: string): boolean {
    return this.items.has(id);
  }

  list(): TodoItem[] {
    return this.order
      .map((id) => this.items.get(id))
      .filter((t): t is TodoItem => Boolean(t));
  }

  push(item: TodoItem): void {
    if (!this.items.has(item.id)) {
      this.order.push(item.id);
    }
    this.items.set(item.id, item);
  }

  update(
    id: string,
    content: string | undefined,
    status: TodoStatus | undefined,
  ): boolean {
    const cur = this.items.get(id);
    if (!cur) return false;
    if (content !== undefined && content.trim()) {
      cur.content = content.trim();
    }
    if (status !== undefined) {
      cur.status = status;
    }
    return true;
  }
}

export function validateNoDuplicateIds(updates: TodoUpdate[]): string | null {
  const seen = new Set<string>();
  for (const u of updates) {
    if (seen.has(u.id)) return u.id;
    seen.add(u.id);
  }
  return null;
}

/** Full replace — empty content falls back to id. */
export function applyReplace(state: TodoState, updates: TodoUpdate[]): void {
  state.clear();
  for (const u of updates) {
    const content =
      u.content !== undefined && u.content.trim()
        ? u.content.trim()
        : u.id;
    state.push({
      id: u.id,
      content: content.slice(0, 80),
      status: u.status ?? "pending",
    });
  }
}

/**
 * Merge by id. Existing items: content optional (status-only ok).
 * New items: content falls back to id.
 */
export function applyMerge(state: TodoState, updates: TodoUpdate[]): void {
  for (const u of updates) {
    if (state.update(u.id, u.content, u.status)) continue;
    const content =
      u.content !== undefined && u.content.trim()
        ? u.content.trim()
        : u.id;
    state.push({
      id: u.id,
      content: content.slice(0, 80),
      status: u.status ?? "pending",
    });
  }
}

/**
 * When the model forgets merge:true but only sends status flips for known ids,
 * treat as merge so content is not wiped.
 */
export function shouldAutoMerge(
  state: TodoState,
  mergeFlag: boolean,
  updates: TodoUpdate[],
): boolean {
  if (mergeFlag) return true;
  if (state.isEmpty() || updates.length === 0) return false;
  return updates.every(
    (u) =>
      state.hasId(u.id) &&
      (u.content === undefined || !u.content.trim()),
  );
}

export function summarizeTodoState(state: TodoState): string {
  const list = state.list();
  if (!list.length) return "No tasks currently tracked.";
  return list
    .map((t) => `- [${t.status}] ${t.id}: ${t.content}`)
    .join("\n");
}

/** Map todo status → execution map UI status. */
export function todoStatusToStepStatus(
  status: TodoStatus,
): "done" | "active" | "pending" {
  switch (status) {
    case "completed":
    case "cancelled":
      return "done";
    case "in_progress":
      return "active";
    default:
      return "pending";
  }
}
