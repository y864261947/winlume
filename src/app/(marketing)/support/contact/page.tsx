import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, Headphones, MessageSquareWarning } from "lucide-react";
import { site } from "@/data/site";

export const metadata: Metadata = {
  title: `联系支持 - ${site.name}`,
  description: "联系 Reizo 技术支持，获取产品、工作台与 API 使用帮助。",
};

export default function SupportContactPage() {
  return (
    <div className="mx-auto w-full max-w-5xl px-5 py-16 sm:px-8 sm:py-24">
      <header className="max-w-2xl">
        <div className="mb-5 inline-flex items-center gap-2 text-sm font-medium text-primary-600">
          <Headphones className="h-4 w-4" aria-hidden />
          帮助与支持
        </div>
        <h1 className="text-3xl font-semibold tracking-tight text-ink-950 sm:text-4xl">联系支持</h1>
        <p className="mt-4 text-base leading-7 text-ink-500">
          遇到产品使用、工作台运行或 API 接入问题，可以从在线客服开始，我们会根据问题类型协助处理。
        </p>
      </header>

      <section className="mt-12 grid gap-5 md:grid-cols-2" aria-label="支持方式">
        <div className="border border-line bg-surface p-6">
          <Headphones className="h-5 w-5 text-primary-600" aria-hidden />
          <h2 className="mt-5 text-lg font-semibold text-ink-900">在线客服</h2>
          <p className="mt-2 text-sm leading-6 text-ink-500">返回首页后打开支持面板，适合咨询产品、账户和使用问题。</p>
          <Link href="/#portal-support" className="mt-5 inline-flex items-center gap-2 text-sm font-medium text-primary-600 hover:text-primary-700">
            打开在线客服
            <ArrowRight className="h-4 w-4" aria-hidden />
          </Link>
        </div>
        <div className="border border-line bg-surface p-6">
          <MessageSquareWarning className="h-5 w-5 text-primary-600" aria-hidden />
          <h2 className="mt-5 text-lg font-semibold text-ink-900">提交问题</h2>
          <p className="mt-2 text-sm leading-6 text-ink-500">反馈具体的 Bug 或功能建议，便于我们跟进处理。</p>
          <Link href="/studio" className="mt-5 inline-flex items-center gap-2 text-sm font-medium text-primary-600 hover:text-primary-700">
            前往工作台提交反馈
            <ArrowRight className="h-4 w-4" aria-hidden />
          </Link>
        </div>
      </section>

      <p className="mt-10 text-sm text-ink-500">
        商务合作请前往 <Link href="/business" className="font-medium text-primary-600 hover:text-primary-700">企业方案</Link> 页面。
      </p>
    </div>
  );
}
