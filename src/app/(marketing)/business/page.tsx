import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, Boxes, Info, Layers, Wallet } from "lucide-react";
import BusinessCases from "@/components/BusinessCases";
import { clientLogos } from "@/data/audience";
import { site } from "@/data/site";

export const metadata: Metadata = {
  title: "企业版 - WinLume",
  description: "为团队接入全模型 AI 能力：统一账户与计费、行业案例参考、按量付费。",
};

const capabilities = [
  {
    icon: Wallet,
    title: "统一账户与计费",
    description: "一个账户覆盖全站模型与应用，按实际用量结算，费用明细清晰可查。",
    href: "/pricing",
    linkText: "查看定价",
  },
  {
    icon: Boxes,
    title: "全模型 API",
    description: "语言、图像、视频、音频与信息处理模型统一接入，随业务弹性扩展。",
    href: "/products?cate=api",
    linkText: "浏览 API 超市",
  },
  {
    icon: Layers,
    title: "在线应用开箱即用",
    description: "无需部署，团队成员即点即用各类 AI 应用，降低上手门槛。",
    href: "/products?cate=app",
    linkText: "浏览应用超市",
  },
  {
    icon: Info,
    title: "演示数据说明",
    description: "本站为演示站点，案例、客户与价格均为虚构占位内容，可替换为你的真实数据。",
    href: "/#faq",
    linkText: "查看常见问题",
  },
];

export default function BusinessPage() {
  return (
    <div>
      {/* Hero */}
      <section className="hero-wash">
        <div className="mx-auto max-w-7xl px-4 pt-20 pb-14 text-center sm:pt-28">
          <p className="mx-auto inline-flex items-center gap-2 rounded-full border border-line bg-surface px-3.5 py-1.5 text-xs text-ink-600 shadow-sm">
            <span className="spectrum-bg h-1.5 w-1.5 rounded-full" aria-hidden />
            企业版 · 为团队而生
          </p>
          <h1 className="mx-auto mt-6 max-w-3xl text-4xl font-bold leading-tight tracking-tight text-ink-950 sm:text-5xl">
            为你的团队
            <span className="text-spectrum">接入全模型 AI 能力</span>
          </h1>
          <p className="mx-auto mt-5 max-w-xl text-base leading-7 text-ink-500">
            统一账户、按量计费、全模型 API 与在线应用。
            看看各行业团队如何用 {site.name} 把 AI 落到真实业务里。
          </p>
          <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <a
              href="#cases"
              className="flex w-full items-center justify-center gap-1.5 rounded-xl bg-primary-500 px-7 py-3 text-sm font-medium text-white shadow-sm shadow-primary-500/25 transition hover:bg-primary-600 sm:w-auto"
            >
              浏览行业案例
              <ArrowRight className="h-4 w-4" />
            </a>
            <Link
              href="/products?cate=api"
              className="flex w-full items-center justify-center rounded-xl border border-line bg-surface px-7 py-3 text-sm text-ink-800 transition hover:border-line-strong hover:bg-canvas sm:w-auto"
            >
              查看 API 超市
            </Link>
          </div>
        </div>
      </section>

      {/* 客户 logo 墙 */}
      <section className="border-y border-line bg-surface">
        <div className="mx-auto max-w-7xl px-4 py-8">
          <p className="text-center font-mono text-[11px] uppercase tracking-widest text-ink-400">
            各行业团队的选择（演示占位）
          </p>
          <div className="mt-5 grid grid-cols-2 gap-x-6 gap-y-4 sm:grid-cols-4">
            {clientLogos.map((logo) => (
              <p
                key={logo}
                className="text-center font-semibold tracking-wide text-ink-300"
              >
                {logo}
              </p>
            ))}
          </div>
        </div>
      </section>

      {/* 行业案例 */}
      <section id="cases" className="mx-auto max-w-7xl scroll-mt-24 px-4 py-14">
        <p className="font-mono text-[11px] uppercase tracking-widest text-ink-400">
          Customer Stories
        </p>
        <h2 className="mt-2 text-2xl font-semibold text-ink-950">行业案例</h2>
        <p className="mt-2 mb-8 max-w-2xl text-sm leading-6 text-ink-500">
          来自不同行业团队的真实业务场景（演示站点，案例为虚构占位内容），按行业筛选查看。
        </p>
        <BusinessCases />
      </section>

      {/* 能力区 */}
      <section className="mx-auto max-w-7xl px-4 pb-14">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {capabilities.map((cap) => (
            <div
              key={cap.title}
              className="spectrum-card flex flex-col rounded-lg border border-line bg-surface p-5 transition duration-200 hover:-translate-y-0.5 hover:border-line-strong hover:shadow-lg hover:shadow-ink-950/5"
            >
              <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary-50 text-primary-600">
                <cap.icon className="h-4 w-4" />
              </span>
              <p className="mt-3 text-sm font-semibold text-ink-900">{cap.title}</p>
              <p className="mt-1.5 text-xs leading-5 text-ink-500">{cap.description}</p>
              <Link
                href={cap.href}
                className="mt-4 flex items-center gap-1 pt-1 text-xs font-medium text-primary-600 transition hover:text-primary-500 mt-auto"
              >
                {cap.linkText}
                <ArrowRight className="h-3 w-3" />
              </Link>
            </div>
          ))}
        </div>
      </section>

      {/* CTA：深色压轴面板 */}
      <section className="mx-auto max-w-7xl px-4 pb-16">
        <div className="panel-ink rounded-2xl px-6 py-14 text-center">
          <h2 className="text-2xl font-semibold text-white sm:text-3xl">
            需要定制化方案？
          </h2>
          <p className="mx-auto mt-3 max-w-md text-sm leading-6 text-white/60">
            私有化部署、定制计费与专属模型接入，欢迎联系我们的团队详谈。
          </p>
          <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <button
              type="button"
              disabled
              title="演示站点，联系方式未提供"
              className="w-full cursor-not-allowed rounded-xl bg-primary-500 px-7 py-3 text-sm font-medium text-white opacity-60 sm:w-auto"
            >
              联系销售
            </button>
            <Link
              href="/pricing"
              className="flex w-full items-center justify-center rounded-xl border border-white/15 bg-white/5 px-7 py-3 text-sm text-white transition hover:bg-white/10 sm:w-auto"
            >
              查看定价
            </Link>
          </div>
        </div>
      </section>
    </div>
  );
}
