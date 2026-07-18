"use client";

import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { useModals } from "./providers";
import type { Product } from "@/data/products";

const primaryCls =
  "flex w-full items-center justify-center gap-1.5 rounded-xl bg-primary-500 px-7 py-3 text-sm font-medium text-white shadow-sm shadow-primary-500/25 transition hover:bg-primary-600 sm:w-auto";

export function HeroCta({ variant = "light" }: { variant?: "light" | "dark" }) {
  const { openExperience } = useModals();
  const ghostCls =
    variant === "dark"
      ? "flex w-full items-center justify-center rounded-xl border border-white/15 bg-white/5 px-7 py-3 text-sm text-white transition hover:bg-white/10 sm:w-auto"
      : "flex w-full items-center justify-center rounded-xl border border-line bg-surface px-7 py-3 text-sm text-ink-800 transition hover:border-line-strong hover:bg-canvas sm:w-auto";
  return (
    <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
      <button type="button" onClick={() => openExperience()} className={primaryCls}>
        立即体验
        <ArrowRight className="h-4 w-4" />
      </button>
      <Link href="/pricing" className={ghostCls}>
        查看定价
      </Link>
    </div>
  );
}

export function DetailActions({ product }: { product: Product }) {
  const { openExperience } = useModals();
  return (
    <div className="flex flex-col gap-2">
      <button
        type="button"
        onClick={() => openExperience(product)}
        className="w-full rounded-lg bg-primary-500 py-2.5 text-sm font-medium text-white shadow-sm shadow-primary-500/25 transition hover:bg-primary-600"
      >
        立即体验
      </button>
      <button
        type="button"
        disabled
        title="演示站点，文档未提供"
        className="w-full cursor-not-allowed rounded-lg border border-line py-2.5 text-sm text-ink-300"
      >
        查看文档
      </button>
    </div>
  );
}
