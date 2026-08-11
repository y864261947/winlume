import type { Metadata } from "next";
import Link from "next/link";
import { Coins, Receipt, Wallet } from "lucide-react";
import { categoriesByCate, categoryTint } from "@/data/taxonomy";
import { productsByCategory } from "@/data/products";

export const metadata: Metadata = {
  title: "定价 - Reizo",
};

const principles = [
  {
    icon: Coins,
    title: "0 月费",
    desc: "没有订阅与最低消费，注册即可使用全部资源。",
    tone: "bg-primary-50 text-primary-500",
  },
  {
    icon: Receipt,
    title: "按用量付费",
    desc: "模型按 token 用量计价，工具类接口按调用次数计价。",
    tone: "bg-teal-50 text-teal-600",
  },
  {
    icon: Wallet,
    title: "统一结算",
    desc: "先充值后扣费，一个余额账户通行全站 API 与应用。",
    tone: "bg-amber-50 text-amber-600",
  },
];

export default function PricingPage() {
  const apiCats = categoriesByCate("api");
  const appCat = categoriesByCate("app")[0];
  const sections = appCat ? [...apiCats, appCat] : apiCats;

  return (
    <div className="mx-auto max-w-7xl px-4 py-12">
      <div className="text-center">
        <p className="font-mono text-[11px] uppercase tracking-widest text-ink-400">
          Pricing
        </p>
        <h1 className="mt-2 text-3xl font-bold text-ink-950">价格表</h1>
        <p className="mx-auto mt-3 max-w-lg text-sm leading-6 text-ink-500">
          先充值，后扣费，按实际用量结算。以下价格均为演示占位数据。
        </p>
      </div>

      <div className="mt-10 grid gap-4 sm:grid-cols-3">
        {principles.map((p) => (
          <div
            key={p.title}
            className="rounded-xl border border-line bg-surface p-6 text-center"
          >
            <span className={`mx-auto flex h-10 w-10 items-center justify-center rounded-lg ${p.tone}`}>
              <p.icon className="h-5 w-5" />
            </span>
            <p className="mt-3 font-semibold text-ink-900">{p.title}</p>
            <p className="mt-1.5 text-sm leading-6 text-ink-500">{p.desc}</p>
          </div>
        ))}
      </div>

      {/* 类目锚点 */}
      <div className="mt-12 flex flex-wrap justify-center gap-2">
        {sections.map((cat) => (
          <a
            key={cat.slug}
            href={`#${cat.slug}`}
            className="flex items-center gap-1.5 rounded-full bg-surface px-3.5 py-1.5 text-sm text-ink-600 ring-1 ring-line transition hover:text-primary-600 hover:ring-primary-200"
          >
            <span
              className="h-1.5 w-1.5 rounded-full"
              style={{ backgroundColor: cat.color }}
            />
            {cat.name}
          </a>
        ))}
      </div>

      {/* 分类定价表 */}
      {sections.map((cat) => {
        const list = productsByCategory(cat.slug);
        if (list.length === 0) return null;
        return (
          <section key={cat.slug} id={cat.slug} className="mt-12 scroll-mt-24">
            <h2 className="flex items-center gap-2.5 text-lg font-semibold text-ink-900">
              <span
                className="flex h-8 w-8 items-center justify-center rounded-lg"
                style={categoryTint(cat.color)}
              >
                <cat.icon className="h-4 w-4" />
              </span>
              {cat.name}
              <span className="rounded-full bg-canvas px-2 py-0.5 font-mono text-xs font-normal text-ink-500 ring-1 ring-line">
                {list.length}
              </span>
            </h2>
            <div className="mt-4 overflow-x-auto rounded-xl border border-line bg-surface">
              <table className="w-full min-w-[560px] text-sm">
                <thead>
                  <tr className="border-b border-line bg-canvas text-left text-xs text-ink-500">
                    <th className="px-5 py-3.5 font-medium">产品</th>
                    <th className="px-5 py-3.5 font-medium">品牌</th>
                    <th className="px-5 py-3.5 font-medium">输入 /1M tokens</th>
                    <th className="px-5 py-3.5 font-medium">输出 / 次价</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {list.map((p) => (
                    <tr key={p.id} className="transition hover:bg-primary-50/40">
                      <td className="px-5 py-3.5">
                        <Link
                          href={`/products/${p.id}`}
                          className="break-all font-mono font-medium text-ink-900 transition hover:text-primary-600"
                        >
                          {p.name}
                        </Link>
                      </td>
                      <td className="px-5 py-3.5 text-ink-500">{p.brand}</td>
                      {p.pricing.kind === "token" && (
                        <>
                          <td className="px-5 py-3.5 font-mono text-ink-800">{p.pricing.input}</td>
                          <td className="px-5 py-3.5 font-mono text-ink-800">
                            {p.pricing.output}
                            <span className="text-xs text-ink-400"> /1M tokens</span>
                          </td>
                        </>
                      )}
                      {p.pricing.kind === "unit" && (
                        <>
                          <td className="px-5 py-3.5 text-ink-300">—</td>
                          <td className="px-5 py-3.5 font-mono text-ink-800">{p.pricing.price}</td>
                        </>
                      )}
                      {p.pricing.kind === "custom" && (
                        <td colSpan={2} className="px-5 py-3.5 text-ink-500">
                          {p.pricing.label}
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        );
      })}
    </div>
  );
}
