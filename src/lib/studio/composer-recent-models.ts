/**
 * Recently picked composer models (localStorage).
 */

const KEY = "reizo:composer-recent-models";
const MAX_RECENT = 6;

export function loadRecentModels(): string[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((item): item is string => typeof item === "string" && Boolean(item.trim()));
  } catch {
    return [];
  }
}

export function rememberRecentModel(name: string): string[] {
  const trimmed = name.trim();
  if (!trimmed || trimmed === "__custom__") return loadRecentModels();
  const next = [trimmed, ...loadRecentModels().filter((item) => item !== trimmed)].slice(
    0,
    MAX_RECENT,
  );
  if (typeof window === "undefined") return next;
  try {
    localStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    /* private mode / quota */
  }
  return next;
}
