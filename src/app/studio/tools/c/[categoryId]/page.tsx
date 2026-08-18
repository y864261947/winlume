import Link from "next/link";
import { ArrowRight, ChevronRight } from "lucide-react";
import { notFound } from "next/navigation";
import SkillWaterfall from "@/components/studio/SkillWaterfall";
import {
  getStudioToolCategory,
  isStudioToolCategoryId,
  STUDIO_TOOL_CATEGORY_IDS,
} from "@/lib/studio/tool-categories";
import { listStudioToolsByCategory } from "@/lib/studio/tool-catalog";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const dynamicParams = false;

type PageProps = { params: Promise<{ categoryId: string }> };

export function generateStaticParams() {
  return STUDIO_TOOL_CATEGORY_IDS.map((categoryId) => ({ categoryId }));
}

export default async function StudioToolCategoryPage({ params }: PageProps) {
  const { categoryId } = await params;
  if (!isStudioToolCategoryId(categoryId)) notFound();

  const category = getStudioToolCategory(categoryId);
  if (!category) notFound();

  const tools = listStudioToolsByCategory(category.id);
  const Icon = category.icon;

  return (
    <div className="min-h-0 flex-1 overflow-y-auto">
      <div className="mx-auto w-full max-w-6xl px-5 py-7 sm:px-6 sm:py-9">
        <header className="border-b border-line pb-6">
          <div className="flex flex-wrap items-center gap-2 text-sm text-ink-500">
            <span>工作台</span>
            <ChevronRight className="h-4 w-4 text-ink-300" />
            <span className="text-ink-900">{category.name}</span>
          </div>
          <h1 className="mt-4 flex items-center gap-2 text-xl font-bold text-ink-950">
            <span className="inline-flex h-9 w-9 items-center justify-center rounded-lg bg-primary-50 text-primary-700">
              <Icon className="h-4 w-4" />
            </span>
            {category.name}
          </h1>
          <p className="mt-2 text-sm text-ink-500">{category.summary}</p>
        </header>

        {tools.length > 0 ? (
          <section className="pt-6" aria-labelledby="category-tools-heading">
            <h2 id="category-tools-heading" className="text-sm font-semibold text-ink-900">
              工具
              <span className="ml-1.5 font-normal tabular-nums text-ink-400">{tools.length}</span>
            </h2>
            <div className="mt-3 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {tools.map((tool) => {
                const ToolIcon = category.icon;
                return (
                  <Link
                    key={tool.id}
                    href={`/studio/tools/${tool.id}`}
                    className="group flex min-h-40 flex-col rounded-lg border border-line bg-surface p-4 transition hover:border-primary-300 hover:bg-primary-50/35"
                  >
                    <span className="inline-flex h-9 w-9 items-center justify-center rounded-lg bg-primary-50 text-primary-700">
                      <ToolIcon className="h-4 w-4" />
                    </span>
                    <h3 className="mt-4 text-sm font-semibold text-ink-900">{tool.name}</h3>
                    <p className="mt-1 text-sm leading-5 text-ink-500">{tool.summary}</p>
                    <span className="mt-auto inline-flex items-center gap-1 pt-4 text-sm font-medium text-primary-700">
                      打开工具
                      <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
                    </span>
                  </Link>
                );
              })}
            </div>
          </section>
        ) : null}

        <div className={tools.length > 0 ? "pt-8" : "pt-6"}>
          <SkillWaterfall catalog={category.id} />
        </div>
      </div>
    </div>
  );
}
