"use client";

import {
  useCallback,
  createContext,
  useContext,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { usePathname } from "next/navigation";
import { PanelLeftClose, PanelLeftOpen } from "lucide-react";
import {
  isStudioCanvasPath,
  studioModeFromPathname,
  studioShowsSessionSidebar,
} from "@/lib/studio/studio-mode";
import { WorkspaceTabsProvider } from "@/lib/studio/workspace-tabs";
import StudioSidebar from "./StudioSidebar";
import StudioViewTransition from "./StudioViewTransition";
import WorkspaceTabBar from "./WorkspaceTabBar";
import WorkspaceTabsHost from "./WorkspaceTabsHost";

type HeaderSlotCtx = { setHeader: (node: ReactNode) => void };
const HeaderSlotContext = createContext<HeaderSlotCtx | null>(null);
export type StudioTheme = "dark" | "light";
const StudioThemeContext = createContext<StudioTheme>("dark");
const STUDIO_THEME_STORAGE_KEY = "reizo:studio-theme";

export function useStudioTheme(): StudioTheme {
  return useContext(StudioThemeContext);
}

/**
 * Lets a page publish its header into the layout-level slot instead of
 * mounting its own <header>. The slot node stays alive across route changes,
 * so navigation only re-renders its content — no appear-from-nothing flash
 * during a View Transition (see StudioShell below).
 *
 * `active` defaults to true for the common single-instance case. Workspace
 * tabs keep multiple views mounted at once (see WorkspaceTabsHost) — only
 * the foreground tab may pass `active: true`, otherwise every kept-alive
 * background tab would race to overwrite the shared header on each render.
 */
export function useStudioHeaderSlot(content: ReactNode, active = true) {
  const ctx = useContext(HeaderSlotContext);
  // Sync every render (no deps) so the slot always reflects latest content.
  useLayoutEffect(() => {
    if (active) ctx?.setHeader(content);
  });
  // Clear only on unmount — avoids a null flash between re-renders above.
  useEffect(() => {
    return () => ctx?.setHeader(null);
  }, [ctx]);
}

/** Full-height workbench chrome with a focused, app-like navigation frame. */
export default function StudioShell({ children }: { children: ReactNode }) {
  const pathname = usePathname() ?? "/studio";
  const mode = studioModeFromPathname(pathname);
  const showSessionSidebar = studioShowsSessionSidebar(mode);
  const showCanvas = mode === "workbench" && isStudioCanvasPath(pathname);
  const [header, setHeader] = useState<ReactNode>(null);
  const [theme, setTheme] = useState<StudioTheme>("dark");
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);
  const sidebarToggledRef = useRef(false);
  const sidebarContainerRef = useRef<HTMLDivElement>(null);
  const expandSidebarRef = useRef<HTMLButtonElement>(null);
  // Stable identity — an inline object literal here would recreate the
  // context value on every StudioShell re-render (e.g. whenever a page
  // publishes new header content), which then falsely trips consumers'
  // `useEffect(() => cleanup, [ctx])` in useStudioHeaderSlot below and
  // wipes the header via its unmount-style cleanup even though nothing
  // actually unmounted.
  const headerSlotCtx = useMemo(() => ({ setHeader }), []);

  useEffect(() => {
    const storedTheme = window.localStorage.getItem(STUDIO_THEME_STORAGE_KEY);
    if (storedTheme === "light") {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- restores an explicit Studio preference after the dark default renders.
      setTheme("light");
    }
  }, []);

  const updateTheme = useCallback((nextTheme: StudioTheme) => {
    setTheme(nextTheme);
    window.localStorage.setItem(STUDIO_THEME_STORAGE_KEY, nextTheme);
  }, []);

  useEffect(() => {
    const documentRoot = document.documentElement;
    documentRoot.dataset.studioTheme = theme;
    return () => {
      if (documentRoot.dataset.studioTheme === theme) {
        delete documentRoot.dataset.studioTheme;
      }
    };
  }, [theme]);

  const collapseSidebar = useCallback(() => {
    sidebarToggledRef.current = true;
    setSidebarCollapsed(true);
  }, []);

  const expandSidebar = useCallback(() => {
    sidebarToggledRef.current = true;
    setSidebarCollapsed(false);
  }, []);

  useLayoutEffect(() => {
    if (!showSessionSidebar || !sidebarToggledRef.current) return;
    if (sidebarCollapsed) {
      expandSidebarRef.current?.focus();
      return;
    }
    sidebarContainerRef.current
      ?.querySelector<HTMLButtonElement>('button[aria-label="收起侧栏"]')
      ?.focus();
  }, [sidebarCollapsed, showSessionSidebar]);

  return (
    <WorkspaceTabsProvider>
      <HeaderSlotContext.Provider value={headerSlotCtx}>
      <StudioThemeContext.Provider value={theme}>
        <div
          className="studio-root relative flex h-dvh min-h-0 w-full overflow-hidden"
          data-theme={theme}
          data-studio-mode={mode}
          data-sidebar-collapsed={
            showSessionSidebar && sidebarCollapsed ? "true" : "false"
          }
        >
        <div
          ref={sidebarContainerRef}
          className="studio-sidebar-container relative z-[2] block h-full shrink-0"
          data-collapsed={showSessionSidebar && sidebarCollapsed ? "true" : "false"}
          data-hidden={!showSessionSidebar ? "true" : "false"}
          data-mobile-open={mobileSidebarOpen && showSessionSidebar ? "true" : "false"}
          aria-hidden={!showSessionSidebar}
        >
          {showSessionSidebar ? (
            <>
              <StudioSidebar
                theme={theme}
                collapsed={sidebarCollapsed}
                onThemeChange={updateTheme}
                onRequestCollapse={() => {
                  collapseSidebar();
                  setMobileSidebarOpen(false);
                }}
              />
              <button
                ref={expandSidebarRef}
                type="button"
                onClick={expandSidebar}
                title="展开侧栏"
                aria-label="展开侧栏"
                aria-expanded={!sidebarCollapsed}
                aria-hidden={!sidebarCollapsed}
                tabIndex={sidebarCollapsed ? 0 : -1}
                className="studio-sidebar-expand"
              >
                <PanelLeftOpen className="size-4" />
              </button>
            </>
          ) : null}
        </div>
        <button
          type="button"
          className="studio-mobile-nav-toggle fixed left-3 top-3 z-[60] inline-flex h-9 w-9 items-center justify-center rounded-full border border-white/80 bg-white/90 text-[#615A73] shadow-md backdrop-blur"
          hidden={!showSessionSidebar}
          onClick={() => {
            if (sidebarCollapsed) setSidebarCollapsed(false);
            setMobileSidebarOpen((open) => !open);
          }}
          aria-label={mobileSidebarOpen ? "关闭导航" : "打开导航"}
          title={mobileSidebarOpen ? "关闭导航" : "打开导航"}
        >
          {mobileSidebarOpen ? (
            <PanelLeftClose className="h-4 w-4" />
          ) : (
            <PanelLeftOpen className="h-4 w-4" />
          )}
        </button>
        <div className="relative z-[1] flex min-h-0 min-w-0 flex-1 flex-col">
          {showCanvas ? <WorkspaceTabBar /> : null}
          <StudioViewTransition name="studio-header-slot">
            <div
              className="studio-header-slot"
              data-active={header ? "true" : "false"}
            >
              {header}
            </div>
          </StudioViewTransition>
          {mode === "workbench" ? (
            <>
              <div
                className="flex min-h-0 flex-1 flex-col"
                style={showCanvas ? undefined : { display: "none" }}
                aria-hidden={!showCanvas}
              >
                <WorkspaceTabsHost />
              </div>
              {showCanvas ? (
                children
              ) : (
                <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
                  {children}
                </div>
              )}
            </>
          ) : (
            children
          )}
        </div>
        </div>
      </StudioThemeContext.Provider>
      </HeaderSlotContext.Provider>
    </WorkspaceTabsProvider>
  );
}
