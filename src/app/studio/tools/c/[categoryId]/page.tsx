import { notFound, redirect } from "next/navigation";
import {
  isStudioToolCategoryId,
  STUDIO_TOOL_CATEGORY_IDS,
  studioToolsHref,
} from "@/lib/studio/tool-categories";

export const runtime = "nodejs";
export const dynamicParams = false;

type PageProps = { params: Promise<{ categoryId: string }> };

export function generateStaticParams() {
  return STUDIO_TOOL_CATEGORY_IDS.map((categoryId) => ({ categoryId }));
}

export default async function StudioToolCategoryRedirect({ params }: PageProps) {
  const { categoryId } = await params;
  if (!isStudioToolCategoryId(categoryId)) notFound();
  redirect(studioToolsHref(categoryId));
}
