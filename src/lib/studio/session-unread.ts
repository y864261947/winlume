/**
 * In-tab unread marks for Studio sessions.
 * A background turn that finishes while you are looking at another chat
 * lights a dot until you open that session again.
 */

const STORAGE_KEY = "reizo:studio-unread-sessions";

const listeners = new Set<() => void>();
const unread = new Set<string>();
let snapshot: ReadonlySet<string> = new Set();
let viewedSessionId: string | null = null;

function persist() {
  if (typeof sessionStorage === "undefined") return;
  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify([...unread]));
  } catch {
    /* private mode / quota */
  }
}

function emit() {
  snapshot = new Set(unread);
  persist();
  for (const listener of listeners) listener();
}

function hydrateFromStorage() {
  if (typeof sessionStorage === "undefined") return;
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return;
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return;
    for (const id of parsed) {
      if (typeof id === "string" && id && id !== viewedSessionId) unread.add(id);
    }
    snapshot = new Set(unread);
  } catch {
    /* ignore corrupt storage */
  }
}

hydrateFromStorage();

export function subscribeUnreadSessions(onStoreChange: () => void): () => void {
  listeners.add(onStoreChange);
  return () => {
    listeners.delete(onStoreChange);
  };
}

export function getUnreadSessionIds(): ReadonlySet<string> {
  return snapshot;
}

const EMPTY_UNREAD: ReadonlySet<string> = new Set();

export function getUnreadSessionIdsServer(): ReadonlySet<string> {
  return EMPTY_UNREAD;
}

export function setViewedStudioSession(sessionId: string | null) {
  viewedSessionId = sessionId;
  if (sessionId && unread.delete(sessionId)) emit();
}

export function noteLiveChatBecameIdle(sessionId: string) {
  if (!sessionId || sessionId === viewedSessionId) return;
  if (unread.has(sessionId)) return;
  unread.add(sessionId);
  emit();
}

export function resetUnreadSessionsForTests() {
  unread.clear();
  viewedSessionId = null;
  snapshot = new Set();
  if (typeof sessionStorage !== "undefined") {
    sessionStorage.removeItem(STORAGE_KEY);
  }
}
