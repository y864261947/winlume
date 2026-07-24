/**
 * Studio client preferences (localStorage).
 */

export const DEFAULT_MODEL_STORAGE_KEY = "winlume:default-model";
export const FALLBACK_DEFAULT_MODEL = "gpt-4o-mini";

export function getDefaultModel(): string {
  if (typeof window === "undefined") return FALLBACK_DEFAULT_MODEL;
  const stored = window.localStorage.getItem(DEFAULT_MODEL_STORAGE_KEY)?.trim();
  return stored || FALLBACK_DEFAULT_MODEL;
}

export function setDefaultModel(model: string): void {
  if (typeof window === "undefined") return;
  const trimmed = model.trim();
  if (!trimmed) {
    window.localStorage.removeItem(DEFAULT_MODEL_STORAGE_KEY);
    return;
  }
  window.localStorage.setItem(DEFAULT_MODEL_STORAGE_KEY, trimmed);
}
