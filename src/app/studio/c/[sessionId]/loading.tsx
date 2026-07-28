/**
 * Brief route fallback while the session chunk mounts.
 * Prefer View Transitions + optimistic handoff on the page itself.
 */
export default function SessionRouteLoading() {
  return (
    <div
      className="studio-session-root flex min-h-0 flex-1 flex-col"
      aria-busy="true"
    >
      <header className="studio-session-header studio-glass-soft flex h-14 shrink-0 items-center border-b border-white/50 px-4 sm:px-6" />
      <div className="flex min-h-0 flex-1 flex-col">
        <div className="min-h-0 flex-1" />
        <div className="studio-composer-dock">
          <div
            className="studio-liquid-glass mx-auto h-[5.75rem] max-w-3xl"
            data-variant="session"
          />
        </div>
      </div>
    </div>
  );
}
