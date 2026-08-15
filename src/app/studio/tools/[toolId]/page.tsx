import Link from "next/link";
import { ChevronRight, ImagePlus } from "lucide-react";
import { notFound } from "next/navigation";
import ToolRunForm from "@/components/studio/ToolRunForm";
import { getStudioTool } from "@/lib/studio/tool-catalog";

type PageProps = { params: Promise<{ toolId: string }> };

export default async function StudioToolPage({ params }: PageProps) {
  const { toolId } = await params;
  const tool = getStudioTool(toolId);
  if (!tool) notFound();

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
      <header className="shrink-0 border-b border-line bg-surface px-5 py-5 sm:px-6">
        <div className="mx-auto flex w-full max-w-6xl flex-wrap items-center gap-2 text-sm text-ink-500">
          <Link href="/studio/tools" className="hover:text-ink-900">全部工具</Link>
          <ChevronRight className="h-4 w-4 text-ink-300" />
          <span>{tool.category}</span>
        </div>
        <div className="mx-auto mt-4 flex w-full max-w-6xl items-start gap-3">
          <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary-50 text-primary-700"><ImagePlus className="h-5 w-5" /></span>
          <div>
            <h1 className="text-xl font-bold text-ink-950">{tool.name}</h1>
            <p className="mt-1 max-w-2xl text-sm leading-6 text-ink-500">{tool.description}</p>
          </div>
        </div>
      </header>
      <ToolRunForm tool={tool} />
    </div>
  );
}
