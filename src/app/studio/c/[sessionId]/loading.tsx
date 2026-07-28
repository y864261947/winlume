/**
 * Soft route transition — avoid a full-page "创建会话" dead end.
 * Prefer the page's optimistic handoff UI; this is only a brief fallback.
 */
export default function SessionRouteLoading() {
  return (
    <div className="studio-view-in flex min-h-0 flex-1 flex-col">
      <header className="studio-glass-soft flex shrink-0 items-center gap-3 border-b border-white/50 px-4 py-3 sm:px-6">
        <div className="h-8 w-8 rounded-[10px] bg-white/50" />
        <div className="min-w-0 flex-1">
          <div className="h-3.5 w-28 animate-pulse rounded bg-white/60" />
          <div className="mt-1.5 h-2.5 w-20 animate-pulse rounded bg-white/40" />
        </div>
      </header>
      <div className="flex min-h-0 flex-1 flex-col">
        <div className="min-h-0 flex-1 px-4 py-6 sm:px-6">
          <div className="mx-auto flex max-w-3xl flex-col gap-4">
            <div className="ml-auto h-16 w-[min(100%,20rem)] animate-pulse rounded-[18px] bg-[rgba(15, 23, 42,0.12)]" />
            <div className="h-12 w-[min(100%,16rem)] animate-pulse rounded-[18px] bg-white/50" />
          </div>
        </div>
        <div className="border-t border-white/40 px-4 py-4 sm:px-6">
          <div className="mx-auto h-[4.5rem] max-w-3xl animate-pulse rounded-[22px] bg-white/55" />
        </div>
      </div>
    </div>
  );
}
