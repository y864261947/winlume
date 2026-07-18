import Link from "next/link";
import { ArrowRight, Boxes, Coins, Layers, Sparkles, Zap } from "lucide-react";
import ProductCard from "@/components/ProductCard";
import FaqAccordion from "@/components/FaqAccordion";
import { HeroCta } from "@/components/CtaButtons";
import { categories, categoryTint } from "@/data/taxonomy";
import { products, productsByCategory } from "@/data/products";
import { faqItems, site } from "@/data/site";
import { RealModelGrid } from "@/components/RealModelGrid";

const stats = [
  { icon: Layers, label: "接入产品", value: `${products.length}+`, tone: "bg-primary-50 text-primary-500" },
  { icon: Sparkles, label: "资源分类", value: `${categories.length} 大类`, tone: "bg-sky-50 text-sky-600" },
  { icon: Coins, label: "月费", value: "0 元", tone: "bg-teal-50 text-teal-600" },
  { icon: Zap, label: "计费方式", value: "按用量", tone: "bg-amber-50 text-amber-600" },
];

export default function Home() {
  const appProducts = productsByCategory("apps").slice(0, 4);

  return (
    <div>
      {/* Hero */}
      <section className="hero-wash">
        <div className="mx-auto max-w-7xl px-4 pt-20 pb-14 text-center sm:pt-28">
          <p className="mx-auto inline-flex items-center gap-2 rounded-full border border-line bg-surface px-3.5 py-1.5 text-xs text-ink-600 shadow-sm">
            <span className="spectrum-bg h-1.5 w-1.5 rounded-full" aria-hidden />
            新模型与新应用持续上线中
          </p>
          <h1 className="mx-auto mt-6 max-w-3xl text-4xl font-bold leading-tight tracking-tight text-ink-950 sm:text-5xl">
            让每一个需求
            <span className="text-spectrum">都找到合适的 AI</span>
          </h1>
          <p className="mx-auto mt-5 max-w-xl text-base leading-7 text-ink-500">
            按用量付费，无需月费。一个账户接入全站模型 API 与在线应用，
            从语言模型到图像、视频、音频与信息处理。
          </p>
          <HeroCta />

          <div className="mx-auto mt-14 grid max-w-3xl grid-cols-2 gap-3 sm:grid-cols-4">
            {stats.map((s) => (
              <div
                key={s.label}
                className="rounded-lg border border-line bg-surface px-4 py-4"
              >
                <span className={`mx-auto flex h-8 w-8 items-center justify-center rounded-md ${s.tone}`}>
                  <s.icon className="h-4 w-4" />
                </span>
                <p className="mt-2 font-mono text-lg font-semibold text-ink-900">{s.value}</p>
                <p className="text-xs text-ink-400">{s.label}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* 真实模型：来自公开定价接口 */}
      <section className="mx-auto max-w-7xl px-4 py-10">
        <div className="mb-5 flex items-center justify-between">
          <h2 className="flex items-center gap-2.5 text-xl font-semibold text-ink-900"><span className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary-50 text-primary-600"><Boxes className="h-4 w-4" /></span>热门模型</h2>
          <Link href="/products?cate=api" className="flex items-center gap-1 text-sm text-ink-500 transition hover:text-primary-600">查看模型广场<ArrowRight className="h-3.5 w-3.5" /></Link>
        </div>
        <RealModelGrid limit={8} />
      </section>
      {/* 精选应用 */}
      <section className="mx-auto max-w-7xl px-4 py-10">
        <div className="mb-5 flex items-center justify-between">
          <h2 className="flex items-center gap-2.5 text-xl font-semibold text-ink-900">
            <span
              className="flex h-8 w-8 items-center justify-center rounded-lg"
              style={categoryTint("#ec4899")}
            >
              <Layers className="h-4 w-4" />
            </span>
            精选应用
          </h2>
          <Link
            href="/products?cate=app"
            className="flex items-center gap-1 text-sm text-ink-500 transition hover:text-primary-600"
          >
            查看全部
            <ArrowRight className="h-3.5 w-3.5" />
          </Link>
        </div>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {appProducts.map((p) => (
            <ProductCard key={p.id} product={p} />
          ))}
        </div>
      </section>

      {/* FAQ */}
      <section id="faq" className="mx-auto max-w-3xl scroll-mt-24 px-4 py-14">
        <p className="text-center font-mono text-[11px] uppercase tracking-widest text-ink-400">
          FAQ
        </p>
        <h2 className="mt-2 text-center text-2xl font-semibold text-ink-950">常见问题</h2>
        <p className="mt-2 mb-8 text-center text-sm text-ink-500">
          关于 {site.name} 你可能想知道的事
        </p>
        <FaqAccordion items={faqItems} />
      </section>

      {/* CTA：深色压轴面板 */}
      <section className="mx-auto max-w-7xl px-4 pb-16">
        <div className="panel-ink rounded-2xl px-6 py-14 text-center">
          <h2 className="text-2xl font-semibold text-white sm:text-3xl">
            准备好开始了吗？
          </h2>
          <p className="mx-auto mt-3 max-w-md text-sm leading-6 text-white/60">
            注册即可浏览全部资源，按实际用量付费，用多少算多少。
          </p>
          <HeroCta variant="dark" />
        </div>
      </section>
    </div>
  );
}
