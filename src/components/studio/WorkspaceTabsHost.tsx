"use client";

import { useWorkspaceTabs } from "@/lib/studio/workspace-tabs";
import StudioHomeView from "./StudioHomeView";
import StudioSessionView from "./StudioSessionView";

/**
 * Mounts every open workspace tab simultaneously (hidden via CSS instead of
 * unmounted) so switching tabs never re-fetches or drops in-flight state —
 * composer drafts, scroll position, and streaming turns all survive a
 * switch. Only the active tab is told `active`, which gates the shared
 * header slot and named ViewTransitions (see useStudioHeaderSlot and
 * StudioSessionView/StudioHomeView) so background tabs never fight the
 * foreground one for shared, singleton DOM state.
 */
export default function WorkspaceTabsHost() {
  const { tabs, activeTabId, renameTab } = useWorkspaceTabs();

  return (
    <>
      {tabs.map((tab) => {
        const active = tab.id === activeTabId;
        return (
          <div
            key={tab.id}
            className="flex min-h-0 flex-1 flex-col"
            // Inline style (not the `flex` utility class + `hidden` attribute
            // combo) so it reliably wins regardless of Tailwind's generated
            // rule order.
            style={active ? undefined : { display: "none" }}
          >
            {tab.kind === "home" ? (
              <StudioHomeView active={active} tabId={tab.id} />
            ) : (
              <StudioSessionView
                sessionId={tab.sessionId}
                active={active}
                onTitleChange={(title) => renameTab(tab.id, title)}
              />
            )}
          </div>
        );
      })}
    </>
  );
}
