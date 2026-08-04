import { BriefcaseBusiness } from "lucide-react";

export default function WorkflowPackLoading() {
  return (
    <div
      aria-busy="true"
      aria-label="正在加载工作流配置"
      className="min-h-0 flex-1 overflow-y-auto bg-canvas"
    >
      <header className="border-b border-line bg-surface px-5 py-5 sm:px-8">
        <div className="mx-auto max-w-5xl">
          <div className="flex items-center gap-2 text-sm text-ink-500">
            <BriefcaseBusiness className="h-4 w-4" />
            专业工作流
          </div>
          <div className="mt-4 h-7 w-56 animate-pulse rounded-lg bg-ink-100" />
          <div className="mt-2 h-4 w-full max-w-xl animate-pulse rounded bg-ink-100" />
        </div>
      </header>
      <main className="mx-auto max-w-5xl px-5 py-6 sm:px-8">
        <div className="space-y-6">
          {[0, 1, 2].map((item) => (
            <section key={item} className="border-b border-line pb-6">
              <div className="h-4 w-32 animate-pulse rounded bg-ink-100" />
              <div className="mt-3 h-10 w-full animate-pulse rounded-lg bg-surface" />
            </section>
          ))}
        </div>
      </main>
    </div>
  );
}
