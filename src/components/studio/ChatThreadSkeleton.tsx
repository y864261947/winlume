const ROWS = ["w-2/5", "w-3/4", "w-1/2"] as const;

/**
 * Placeholder shown before real messages exist — during the Next.js route
 * Suspense fallback and while a cold session bundle is in flight. Meant to
 * sit inside the shared `studio-chat-thread` ViewTransition name so both
 * reveals (fallback → page, skeleton → ChatThread) crossfade via
 * studio-vt-soft instead of popping in.
 */
export default function ChatThreadSkeleton() {
  return (
    <div className="flex min-h-0 flex-1 flex-col justify-end gap-5 px-4 py-6 sm:px-6">
      <div className="mx-auto flex w-full max-w-3xl flex-col gap-5">
        {ROWS.map((width, i) => (
          <div
            key={i}
            className={`flex gap-3 ${i === 0 ? "flex-row-reverse" : ""}`}
          >
            <span className="mt-0.5 h-8 w-8 shrink-0 animate-pulse rounded-full bg-white/60" />
            <div
              className={`h-16 max-w-[min(100%,42rem)] animate-pulse rounded-[18px] bg-white/50 ${width}`}
            />
          </div>
        ))}
      </div>
    </div>
  );
}
