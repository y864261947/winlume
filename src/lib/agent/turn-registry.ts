/**
 * In-process registry of active agent turns.
 * Stop is explicit (POST /api/chat/stop); client disconnect does NOT cancel.
 */

export type ActiveTurn = {
  userId: string;
  sessionId: string;
  controller: AbortController;
  startedAt: number;
};

/** sessionId → active turn (one concurrent turn per session). */
const bySession = new Map<string, ActiveTurn>();

export function getActiveTurn(sessionId: string): ActiveTurn | undefined {
  return bySession.get(sessionId);
}

export function registerTurn(
  sessionId: string,
  userId: string,
): ActiveTurn | null {
  const existing = bySession.get(sessionId);
  if (existing && !existing.controller.signal.aborted) {
    return null; // already running
  }
  const controller = new AbortController();
  const turn: ActiveTurn = {
    userId,
    sessionId,
    controller,
    startedAt: Date.now(),
  };
  bySession.set(sessionId, turn);
  return turn;
}

export function unregisterTurn(sessionId: string, controller?: AbortController): void {
  const cur = bySession.get(sessionId);
  if (!cur) return;
  if (controller && cur.controller !== controller) return;
  bySession.delete(sessionId);
}

/**
 * Explicit user stop. Returns true if a turn was aborted.
 */
export function stopTurn(
  sessionId: string,
  userId: string,
): { stopped: boolean; reason?: string } {
  const turn = bySession.get(sessionId);
  if (!turn) return { stopped: false, reason: "no_active_turn" };
  if (turn.userId !== userId) return { stopped: false, reason: "forbidden" };
  if (!turn.controller.signal.aborted) {
    turn.controller.abort();
  }
  return { stopped: true };
}

export function isTurnActive(sessionId: string): boolean {
  const t = bySession.get(sessionId);
  return Boolean(t && !t.controller.signal.aborted);
}
