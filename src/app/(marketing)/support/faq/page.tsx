import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, CircleHelp } from "lucide-react";
import { faqItems, site } from "@/data/site";

export const metadata: Metadata = {
  title: `常见问题 - ${site.name}`,
  description: "查看 Reizo 平台、账户、计费与工作台的常见问题。",
};

export default function SupportFaqPage() {
  return (
    <div className="mx-auto w-full max-w-5xl px-5 py-16 sm:px-8 sm:py-24">
      <header className="max-w-2xl">
        <div className="mb-5 inline-flex items-center gap-2 text-sm font-medium text-primary-600">
          <CircleHelp className="h-4 w-4" aria-hidden />
          帮助与支持
        </div>
        <h1 className="text-3xl font-semibold tracking-tight text-ink-950 sm:text-4xl">常见问题</h1>
        <p className="mt-4 text-base leading-7 text-ink-500">
          从产品目录和工作台使用，到账户、余额与 API 接入，先在这里找到答案。
        </p>
      </header>

      <section className="mt-12 divide-y divide-line border-y border-line" aria-label="常见问题列表">
        {faqItems.map((item) => (
          <details key={item.question} className="group py-5">
            <summary className="flex cursor-pointer list-none items-center justify-between gap-6 text-base font-medium text-ink-900 [&::-webkit-details-marker]:hidden">
              <span>{item.question}</span>
              <span className="text-xl font-normal text-ink-400 transition group-open:rotate-45" aria-hidden>+</span>
            </summary>
            <p className="max-w-3xl pt-3 text-sm leading-7 text-ink-500">{item.answer}</p>
          </details>
        ))}
      </section>

      <div className="mt-10 flex flex-wrap items-center gap-5 text-sm">
        <Link href="/support/contact" className="inline-flex items-center gap-2 font-medium text-primary-600 hover:text-primary-700">
          仍未解决？联系支持
          <ArrowRight className="h-4 w-4" aria-hidden />
        </Link>
        <Link href="/" className="text-ink-500 hover:text-ink-900">返回首页</Link>
      </div>
    </div>
  );
}
