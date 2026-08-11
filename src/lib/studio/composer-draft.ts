/**
 * Per-session / home composer draft persistence (localStorage).
 */

const PREFIX = "reizo:composer-draft:";

export type ComposerDraftV1 = {
  v: 1;
  text: string;
  updatedAt: number;
};

export function draftStorageKey(scope: string): string {
  return `${PREFIX}${scope || "home"}`;
}

export function loadComposerDraft(scope: string): string {
  if (typeof window === "undefined") return "";
  try {
    const raw = localStorage.getItem(draftStorageKey(scope));
    if (!raw) return "";
    const parsed = JSON.parse(raw) as ComposerDraftV1;
    if (parsed?.v === 1 && typeof parsed.text === "string") {
      return parsed.text;
    }
    // legacy plain string
    if (typeof raw === "string" && !raw.startsWith("{")) return raw;
  } catch {
    /* ignore */
  }
  return "";
}

export function saveComposerDraft(scope: string, text: string): void {
  if (typeof window === "undefined") return;
  try {
    const key = draftStorageKey(scope);
    if (!text.trim()) {
      localStorage.removeItem(key);
      return;
    }
    const payload: ComposerDraftV1 = {
      v: 1,
      text,
      updatedAt: Date.now(),
    };
    localStorage.setItem(key, JSON.stringify(payload));
  } catch {
    /* private mode / quota */
  }
}

export function clearComposerDraft(scope: string): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.removeItem(draftStorageKey(scope));
  } catch {
    /* ignore */
  }
}
