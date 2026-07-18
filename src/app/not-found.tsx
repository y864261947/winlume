import Link from "next/link";
import { Compass } from "lucide-react";

export default function NotFound() {
  return (
    <div className="mx-auto flex max-w-7xl flex-col items-center px-4 py-28 text-center">
      <p className="font-mono text-[11px] uppercase tracking-widest text-ink-400">404</p>
      <h1 className="mt-2 text-2xl font-semibold text-ink-950">页面不存在</h1>
      <p className="mt-2 max-w-sm text-sm leading-6 text-ink-500">
        你要找的页面或产品可能已被移动、下架，或链接有误。
      </p>
      <div className="mt-6 flex flex-col gap-2 sm:flex-row">
        <Link
          href="/"
          className="rounded-lg bg-primary-500 px-5 py-2.5 text-sm font-medium text-white shadow-sm shadow-primary-500/25 transition hover:bg-primary-600"
        >
          返回首页
        </Link>
        <Link
          href="/products"
          className="flex items-center justify-center gap-1.5 rounded-lg border border-line bg-surface px-5 py-2.5 text-sm text-ink-800 transition hover:border-line-strong hover:bg-canvas"
        >
          <Compass className="h-4 w-4" />
          浏览产品
        </Link>
      </div>
    </div>
  );
}
