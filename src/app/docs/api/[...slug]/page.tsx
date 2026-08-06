import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ApiEndpointView } from "@/components/docs/ApiEndpointView";
import { allApiPages, getApiPage } from "@/data/docs/api-catalog";

type Props = {
  params: Promise<{ slug: string[] }>;
};

export function generateStaticParams() {
  return allApiPages.map((page) => ({
    slug: page.slug.split("/"),
  }));
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const page = getApiPage(slug);
  if (!page) return { title: "未找到" };
  return {
    title: page.title,
    description: page.description,
  };
}

export default async function DocsApiEndpointPage({ params }: Props) {
  const { slug } = await params;
  const page = getApiPage(slug);
  if (!page) notFound();
  return <ApiEndpointView page={page} />;
}
