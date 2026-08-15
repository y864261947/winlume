import Link from "next/link";
import { ArrowRight, ImagePlus } from "lucide-react";
import { listStudioTools } from "@/lib/studio/tool-catalog";

export default function StudioToolsPage() {
  const tools = listStudioTools();
  return (
    <div className="min-h-0 flex-1 overflow-y-auto">
      <div className="mx-auto w-full max-w-6xl px-5 py-7 sm:px-6 sm:py-9">
        <header className="border-b border-line pb-6">
          <p className="text-xs font-medium text-primary-700">Studio 工具</p>
          <h1 className="mt-2 flex items-center gap-2 text-xl font-bold text-ink-950">
            <ImagePlus className="h-5 w-5 text-primary-500" /> 全部工具
          </h1>
          <p className="mt-2 text-sm text-ink-500">已接入并可直接使用的图片处理工具。</p>
        </header>

        <section className="pt-6" aria-labelledby="image-tools-heading">
          <h2 id="image-tools-heading" className="text-sm font-semibold text-ink-900">图片处理</h2>
          <div className="mt-3 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {tools.map((tool) => (
              <Link
                key={tool.id}
                href={`/studio/tools/${tool.id}`}
                className="group flex min-h-40 flex-col rounded-lg border border-line bg-surface p-4 transition hover:border-primary-300 hover:bg-primary-50/35"
              >
                <span className="inline-flex h-9 w-9 items-center justify-center rounded-lg bg-primary-50 text-primary-700">
                  <ImagePlus className="h-4 w-4" />
                </span>
                <h3 className="mt-4 text-sm font-semibold text-ink-900">{tool.name}</h3>
                <p className="mt-1 text-sm leading-5 text-ink-500">{tool.summary}</p>
                <span className="mt-auto inline-flex items-center gap-1 pt-4 text-sm font-medium text-primary-700">
                  打开工具 <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
                </span>
              </Link>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}
