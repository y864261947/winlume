import type { Metadata } from "next";
import ProductsExplorer from "./ProductsExplorer";

export const metadata: Metadata = {
  title: "产品列表 - WinLume",
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
  return (
    // key 随 URL 筛选参数变化：在 /products 页内再次导航时重置 explorer 状态
    <ProductsExplorer
      key={`${cate ?? ""}-${tag ?? ""}-${brand ?? ""}`}
      initialCate={cate}
      initialTag={tag}
      initialBrand={brand}
    />
  );
}
