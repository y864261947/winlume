import ChatThreadSkeleton from "@/components/studio/ChatThreadSkeleton";
import StudioViewTransition from "@/components/studio/StudioViewTransition";

/**
 * Brief route fallback while the session chunk mounts. The persistent header
 * already lives in StudioShell's layout-level slot, so this fallback owns no
 * header of its own — rendering one here would double up with the slot and
 * flash on reveal. The thread area shares the page's `studio-chat-thread`
 * ViewTransition name so the Suspense reveal (this skeleton → the real page)
 * crossfades with the same studio-vt-soft animation instead of popping in.
 */
export default function SessionRouteLoading() {
  return (
    <div
      className="studio-session-root flex min-h-0 flex-1 flex-col"
      aria-busy="true"
    >
      <StudioViewTransition name="studio-chat-thread">
        <div className="studio-session-thread flex min-h-0 min-w-0 flex-1 flex-col">
          <ChatThreadSkeleton />
        </div>
      </StudioViewTransition>
      <div className="studio-composer-dock">
        <div
          className="studio-liquid-glass mx-auto h-[5.75rem] max-w-3xl"
          data-variant="session"
        />
      </div>
    </div>
  );
}
