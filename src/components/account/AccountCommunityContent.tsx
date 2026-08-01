import Link from "next/link";
import { ArrowUpRight, Boxes, Wrench } from "lucide-react";

const collections = [
  ["角色技能", "可复用的专业工作流与提示词预设", "/studio/skills", Wrench],
  ["工具预设", "经审核的工具组合与执行边界", "/account/personalization", Boxes],
] as const;

export default function AccountCommunityContent() {
  return (
    <section className="border border-line bg-surface/65 p-5 sm:p-7 lg:min-h-[calc(100dvh-8.875rem)]">
      <p className="text-sm text-ink-500">个人版 / 账户与个人中心 / 交流社区</p>
      <h1 className="mt-2 text-3xl font-semibold text-ink-950">交流社区</h1>
      <p className="mt-2 max-w-2xl text-sm leading-6 text-ink-600">经过审核的角色技能、工具预设和模板。每个资源都带有清晰的用途、版本和适用范围。</p>
      <div className="mt-7 grid gap-4 md:grid-cols-2">
        {collections.map(([title, description, href, Icon]) => (
          <Link key={title} href={href} className="border border-line bg-surface p-5 transition hover:border-sky-300 hover:shadow-sm">
            <Icon className="h-5 w-5 text-primary-600" />
            <h2 className="mt-5 text-base font-semibold text-ink-950">{title}</h2>
            <p className="mt-2 text-sm leading-6 text-ink-600">{description}</p>
            <span className="mt-5 inline-flex items-center gap-1 text-sm font-medium text-primary-600">浏览资源 <ArrowUpRight className="h-4 w-4" /></span>
          </Link>
        ))}
      </div>
    </section>
  );
}
