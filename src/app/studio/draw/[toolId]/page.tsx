import { notFound, redirect } from "next/navigation";
import DrawToolFamily from "@/components/studio/DrawToolFamily";
import ToolRunForm from "@/components/studio/ToolRunForm";
import { DRAW_TOOL_IDS, isDrawToolId } from "@/lib/studio/studio-mode";
import { getStudioTool } from "@/lib/studio/tool-catalog";

type PageProps = { params: Promise<{ toolId: string }> };

export function generateStaticParams() {
  return DRAW_TOOL_IDS.map((toolId) => ({ toolId }));
}

export default async function StudioDrawToolPage({ params }: PageProps) {
  const { toolId } = await params;
  const tool = getStudioTool(toolId);
  if (!tool) notFound();
  if (!isDrawToolId(tool.id)) redirect(`/studio/tools/${encodeURIComponent(tool.id)}`);

  return (
    <div className="flex min-h-0 flex-1 overflow-hidden">
      <DrawToolFamily activeId={tool.id} />
      <ToolRunForm key={tool.id} tool={tool} variant="workbench" />
    </div>
  );
}

export const dynamicParams = false;
