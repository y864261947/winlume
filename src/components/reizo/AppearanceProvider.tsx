"use client";

import { createContext, useContext, useEffect, useMemo, useSyncExternalStore, type ReactNode } from "react";

type Appearance = "auto" | "light" | "dark";
type Theme = "light" | "dark";
const KEY = "reizo-theme";
const EVENT = "reizo-appearance-change";
const AppearanceContext = createContext<{ preference: Appearance; theme: Theme; setAppearance: (value: Appearance) => void }>({ preference: "auto", theme: "light", setAppearance: () => {} });

function readPreference(): Appearance {
  try {
    const value = localStorage.getItem(KEY) ?? localStorage.getItem("reizo:studio-theme");
    return value === "light" || value === "dark" ? value : "auto";
  } catch { return "auto"; }
}
function snapshot() {
  const preference = readPreference();
  return `${preference}:${preference === "auto" ? (matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light") : preference}`;
}
function subscribe(notify: () => void) {
  const media = matchMedia("(prefers-color-scheme: dark)");
  window.addEventListener(EVENT, notify);
  window.addEventListener("storage", notify);
  media.addEventListener("change", notify);
  return () => { window.removeEventListener(EVENT, notify); window.removeEventListener("storage", notify); media.removeEventListener("change", notify); };
}
function setAppearance(value: Appearance) {
  try { localStorage.setItem(KEY, value); } catch { /* Storage may be disabled. */ }
  window.dispatchEvent(new Event(EVENT));
}
export function useAppearance() { return useContext(AppearanceContext); }

export default function AppearanceProvider({ children }: { children: ReactNode }) {
  const state = useSyncExternalStore(subscribe, snapshot, () => "auto:light");
  const [preference, theme] = state.split(":") as [Appearance, Theme];
  const value = useMemo(() => ({ preference, theme, setAppearance }), [preference, theme]);
  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    const syncButtons = () => document.querySelectorAll<HTMLElement>("[data-theme-choice]").forEach(button => button.setAttribute("aria-pressed", String(button.dataset.themeChoice === preference)));
    syncButtons();
    const observer = new MutationObserver(syncButtons);
    observer.observe(document.body, { childList: true, subtree: true });
    const choose = (event: MouseEvent) => {
      const target = event.target instanceof Element ? event.target.closest<HTMLElement>("[data-theme-choice]") : null;
      const choice = target?.dataset.themeChoice;
      if (choice === "auto" || choice === "dark" || choice === "light") setAppearance(choice);
    };
    document.addEventListener("click", choose);
    return () => { observer.disconnect(); document.removeEventListener("click", choose); };
  }, [theme, preference]);
  return <AppearanceContext.Provider value={value}><svg width="0" height="0" aria-hidden="true" style={{ position: "absolute", pointerEvents: "none" }}><defs><filter id="reizo-light-dots" colorInterpolationFilters="sRGB"><feColorMatrix in="SourceGraphic" type="matrix" values="0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 -10 2 0" result="dark-pixels" /><feFlood floodColor="#fff" result="white" /><feComposite in="white" in2="dark-pixels" operator="in" result="white-dots" /><feComposite in="white-dots" in2="SourceAlpha" operator="in" result="clipped-dots" /><feMerge><feMergeNode in="SourceGraphic" /><feMergeNode in="clipped-dots" /></feMerge></filter></defs></svg>{children}</AppearanceContext.Provider>;
}

export function AppearanceSelector() {
  const { preference, setAppearance } = useAppearance();
  return <div className="appearance-switch" aria-label="外观模式">{([["light", "☀ 日间"], ["dark", "☾ 夜间"], ["auto", "Auto"]] as const).map(([id, label]) => <button type="button" key={id} aria-pressed={preference === id} onClick={() => setAppearance(id)}>{label}</button>)}</div>;
}
