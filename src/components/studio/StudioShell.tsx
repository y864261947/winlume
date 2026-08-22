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
import { PanelLeftClose, PanelLeftOpen } from "lucide-react";
import StudioSidebar from "./StudioSidebar";
import StudioViewTransition from "./StudioViewTransition";

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
 */
export function useStudioHeaderSlot(content: ReactNode) {
  const ctx = useContext(HeaderSlotContext);
  // Sync every render (no deps) so the slot always reflects latest content.
  useLayoutEffect(() => {
    ctx?.setHeader(content);
  });
  // Clear only on unmount — avoids a null flash between re-renders above.
  useEffect(() => {
    return () => ctx?.setHeader(null);
  }, [ctx]);
}

/** Full-height workbench chrome — demo warm canvas + glass sidebar (no marketing chrome). */
export default function StudioShell({ children }: { children: ReactNode }) {
  const [header, setHeader] = useState<ReactNode>(null);
  const [theme, setTheme] = useState<StudioTheme>("dark");
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);
  const [sidebarPeekRendered, setSidebarPeekRendered] = useState(false);
  const [sidebarPeekActive, setSidebarPeekActive] = useState(false);
  const sidebarPeekTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const sidebarPeekFrameRef = useRef<number | null>(null);
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

  const clearSidebarPeekTimer = () => {
    if (!sidebarPeekTimerRef.current) return;
    clearTimeout(sidebarPeekTimerRef.current);
    sidebarPeekTimerRef.current = null;
  };

  const clearSidebarPeekFrame = () => {
    if (sidebarPeekFrameRef.current === null) return;
    cancelAnimationFrame(sidebarPeekFrameRef.current);
    sidebarPeekFrameRef.current = null;
  };

  const showSidebarPeek = () => {
    if (!sidebarCollapsed) return;
    clearSidebarPeekTimer();
    clearSidebarPeekFrame();
    setSidebarPeekRendered(true);
    sidebarPeekFrameRef.current = requestAnimationFrame(() => {
      sidebarPeekFrameRef.current = null;
      setSidebarPeekActive(true);
    });
  };

  const hideSidebarPeek = () => {
    clearSidebarPeekFrame();
    setSidebarPeekActive(false);
    clearSidebarPeekTimer();
    sidebarPeekTimerRef.current = setTimeout(() => {
      setSidebarPeekRendered(false);
      sidebarPeekTimerRef.current = null;
    }, 180);
  };

  const collapseSidebar = () => {
    setSidebarCollapsed(true);
    hideSidebarPeek();
  };

  const expandSidebar = () => {
    clearSidebarPeekTimer();
    clearSidebarPeekFrame();
    setSidebarPeekActive(false);
    setSidebarPeekRendered(false);
    setSidebarCollapsed(false);
  };

  useEffect(
    () => () => {
      clearSidebarPeekTimer();
      clearSidebarPeekFrame();
    },
    [],
  );

  return (
    <HeaderSlotContext.Provider value={headerSlotCtx}>
      <StudioThemeContext.Provider value={theme}>
        <div
          className="studio-root relative flex h-dvh min-h-0 w-full overflow-hidden"
          data-theme={theme}
        >
        <div className="studio-blob studio-blob-a" aria-hidden />
        <div className="studio-blob studio-blob-b" aria-hidden />
        <div className="studio-blob studio-blob-c" aria-hidden />
        <div
          className={`studio-sidebar-container relative z-[2] block h-full shrink-0 transition-[width] duration-200 [transition-timing-function:cubic-bezier(0.23,1,0.32,1)] ${
            sidebarCollapsed ? "w-[52px]" : "w-[248px]"
          }`}
          data-mobile-open={mobileSidebarOpen ? "true" : "false"}
          onPointerEnter={(event) => {
            if (event.pointerType === "mouse") showSidebarPeek();
          }}
          onPointerLeave={(event) => {
            if (event.pointerType === "mouse") hideSidebarPeek();
          }}
          onFocusCapture={showSidebarPeek}
          onBlurCapture={(event) => {
            if (!event.currentTarget.contains(event.relatedTarget)) hideSidebarPeek();
          }}
        >
          {sidebarCollapsed ? (
            <div
              className={`studio-sidebar-rail flex h-full w-[52px] items-start justify-center border-r border-white/70 pt-4 transition-opacity duration-150 ${
                sidebarPeekRendered ? "pointer-events-none opacity-0" : "opacity-100"
              }`}
            >
              <button
                type="button"
                onClick={expandSidebar}
                title="展开侧栏"
                aria-label="展开侧栏"
                className="inline-flex h-9 w-9 items-center justify-center rounded-md text-[#615A73] transition-[background-color,color,transform] duration-150 hover:bg-white/75 hover:text-[#241E36] active:scale-[0.97]"
              >
                <PanelLeftOpen className="h-4.5 w-4.5" />
              </button>
            </div>
          ) : (
            <StudioSidebar
              theme={theme}
              onThemeChange={updateTheme}
              onRequestCollapse={() => {
                collapseSidebar();
                setMobileSidebarOpen(false);
              }}
            />
          )}
          {sidebarCollapsed && sidebarPeekRendered ? (
            <div
              className="studio-sidebar-peek absolute inset-y-0 left-0 w-[248px]"
              data-active={sidebarPeekActive}
            >
              <StudioSidebar
                temporary
                theme={theme}
                onThemeChange={updateTheme}
                onRequestExpand={expandSidebar}
              />
            </div>
          ) : null}
        </div>
        <button
          type="button"
          className="studio-mobile-nav-toggle fixed left-3 top-3 z-[60] inline-flex h-9 w-9 items-center justify-center rounded-full border border-white/80 bg-white/90 text-[#615A73] shadow-md backdrop-blur"
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
          <StudioViewTransition name="studio-header-slot">
            <div
              className="studio-header-slot"
              data-active={header ? "true" : "false"}
            >
              {header}
            </div>
          </StudioViewTransition>
          {children}
        </div>
        </div>
      </StudioThemeContext.Provider>
    </HeaderSlotContext.Provider>
  );
}
