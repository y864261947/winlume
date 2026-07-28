/** Studio-segment loading — keep chrome, avoid heavy interstitial copy. */
export default function StudioLoading() {
  return (
    <div
      className="flex flex-1 flex-col items-center justify-center gap-2 px-4"
      role="status"
      aria-label="加载中"
    >
      <div className="h-8 w-8 animate-pulse rounded-full bg-[rgba(15, 23, 42,0.15)]" />
    </div>
  );
}
