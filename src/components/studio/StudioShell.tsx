"use client";

import {
  createContext,
  useContext,
  useEffect,
  useLayoutEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import StudioSidebar from "./StudioSidebar";
import StudioViewTransition from "./StudioViewTransition";

type HeaderSlotCtx = { setHeader: (node: ReactNode) => void };
const HeaderSlotContext = createContext<HeaderSlotCtx | null>(null);

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
  // Stable identity — an inline object literal here would recreate the
  // context value on every StudioShell re-render (e.g. whenever a page
  // publishes new header content), which then falsely trips consumers'
  // `useEffect(() => cleanup, [ctx])` in useStudioHeaderSlot below and
  // wipes the header via its unmount-style cleanup even though nothing
  // actually unmounted.
  const headerSlotCtx = useMemo(() => ({ setHeader }), []);

  return (
    <HeaderSlotContext.Provider value={headerSlotCtx}>
      <div className="studio-root relative flex h-dvh min-h-0 w-full overflow-hidden">
        <div className="studio-blob studio-blob-a" aria-hidden />
        <div className="studio-blob studio-blob-b" aria-hidden />
        <div className="studio-blob studio-blob-c" aria-hidden />
        <StudioSidebar />
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
    </HeaderSlotContext.Provider>
  );
}
