import type { Metadata } from "next";
import ProductsExplorer from "@/components/ProductsExplorer";

export const metadata: Metadata = {
  title: "模型与应用目录 - Reizo",
};

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

function pick(v: string | string[] | undefined): string | undefined {
  return typeof v === "string" ? v : undefined;
}

export default async function ProductsPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const sp = await searchParams;
  const cate = pick(sp.cate);
  const tag = pick(sp.tag);
  const brand = pick(sp.brand);
  const query = pick(sp.q);
  return (
    <ProductsExplorer
      key={`${cate ?? ""}-${tag ?? ""}-${brand ?? ""}-${query ?? ""}`}
      initialCate={cate}
      initialTag={tag}
      initialBrand={brand}
      initialQuery={query}
    />
  );
}
