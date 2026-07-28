/**
 * In-memory, per-process, per-user pub/sub for artifact status changes.
 * Backs the `/api/artifacts/stream` SSE endpoint. Single-instance only —
 * does not survive a process restart and does not fan out across multiple
 * server instances. Acceptable at the project's current single-VM deploy;
 * a real pub/sub (Redis, etc.) would slot in here without changing callers.
 */

export type ArtifactStreamEvent =
  | {
      type: "artifact_updated";
      artifactId: string;
      status: "pending" | "ready" | "failed";
    }
  | { type: "ping" };

type Listener = (event: ArtifactStreamEvent) => void;

const listenersByUser = new Map<string, Set<Listener>>();

export function subscribeArtifactEvents(
  userId: string,
  listener: Listener,
): () => void {
  let set = listenersByUser.get(userId);
  if (!set) {
    set = new Set();
    listenersByUser.set(userId, set);
  }
  set.add(listener);

  return () => {
    const current = listenersByUser.get(userId);
    if (!current) return;
    current.delete(listener);
    if (current.size === 0) listenersByUser.delete(userId);
  };
}

export function publishArtifactEvent(
  userId: string,
  event: ArtifactStreamEvent,
): void {
  const set = listenersByUser.get(userId);
  if (!set || set.size === 0) return;
  for (const listener of set) {
    try {
      listener(event);
    } catch {
      // A misbehaving listener must not break delivery to the others.
    }
  }
}
