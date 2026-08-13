"use client";

import Link from "next/link";
import { Heart } from "lucide-react";
import { Product } from "@/data/products";
import { getCategory } from "@/data/taxonomy";
import PriceTag from "./PriceTag";
import { useModals } from "./providers";

export default function ProductCard({ product }: { product: Product }) {
  const category = getCategory(product.category);
  const { favorites, toggleFavorite } = useModals();
  const favorite = favorites.includes(product.id);
  const studioHref = `/studio?model=${encodeURIComponent(product.name)}&entry=application-catalog`;

  return (
    <div className="portal-product-card group flex h-full flex-col p-5">
      <div className="flex items-center justify-between gap-2">
        {category ? (
          <span className="flex items-center gap-1.5 text-xs text-ink-500">
            <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: category.color }} />
            {category.name}
          </span>
        ) : <span />}
        <div className="flex items-center gap-1">
          {product.isNew && <span className="shrink-0 rounded-full bg-amber-50 px-2 py-0.5 font-mono text-[10px] font-semibold tracking-wide text-amber-700 ring-1 ring-amber-600/20">NEW</span>}
          <button
            type="button"
            onClick={() => toggleFavorite(product.id)}
            aria-label={favorite ? `取消收藏 ${product.name}` : `收藏 ${product.name}`}
            aria-pressed={favorite}
            className={`flex h-9 w-9 items-center justify-center rounded-md transition ${favorite ? "bg-rose-50 text-rose-500" : "text-ink-300 hover:bg-canvas hover:text-ink-600"}`}
          >
            <Heart className={`h-3.5 w-3.5 ${favorite ? "fill-current" : ""}`} />
          </button>
        </div>
      </div>

      <p className="portal-product-card-title mt-2.5 break-all">{product.name}</p>
      <p className="portal-product-card-copy mt-1.5 min-h-10 line-clamp-2">{product.tagline}</p>
      <div className="mt-3 flex flex-wrap gap-1.5">
        <span className="rounded-md bg-canvas px-2 py-0.5 text-[11px] text-ink-500 ring-1 ring-line">{product.type}</span>
        <span className="rounded-md bg-canvas px-2 py-0.5 text-[11px] text-ink-500 ring-1 ring-line">{product.brand}</span>
      </div>
      <div className="portal-product-card-price mt-3 px-2.5 py-2"><PriceTag pricing={product.pricing} /></div>
      <div className="mt-4 flex gap-2 pt-1 mt-auto">
        <Link href={`/products/${product.id}`} className="portal-product-card-detail flex-1 py-2 text-center">查看详情</Link>
        <Link href={studioHref} className="portal-product-card-launch flex-1 py-2 text-center">立即体验</Link>
      </div>
    </div>
  );
}
