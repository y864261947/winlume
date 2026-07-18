import Link from "next/link";
import { AtSign, Briefcase, Code2, Play } from "lucide-react";
import LogoMark from "./LogoMark";
import { footerGroups, site } from "@/data/site";

const socials = [
  { icon: Code2, label: "开源仓库" },
  { icon: AtSign, label: "社交媒体" },
  { icon: Briefcase, label: "职业主页" },
  { icon: Play, label: "视频频道" },
];

export default function SiteFooter() {
  return (
    <footer className="border-t border-line bg-surface">
      <div className="mx-auto max-w-7xl px-4 py-12">
        <div className="grid gap-10 md:grid-cols-12">
          <div className="md:col-span-5">
            <Link href="/" className="flex items-center gap-2">
              <LogoMark />
              <span className="text-lg font-bold tracking-tight text-ink-950">
                {site.name}
              </span>
            </Link>
            <p className="mt-3 max-w-sm text-sm leading-6 text-ink-500">
              {site.slogan}。按用量付费，全模型 API 接入，应用在线使用。
            </p>
            <div className="mt-4 flex gap-2">
              {socials.map((s) => (
                <span
                  key={s.label}
                  role="link"
                  aria-disabled="true"
                  aria-label={`${s.label}（即将上线）`}
                  title="即将上线"
                  className="cursor-not-allowed rounded-lg border border-line p-2 text-ink-300"
                >
                  <s.icon className="h-4 w-4" />
                </span>
              ))}
            </div>
          </div>

          {footerGroups.map((group) => (
            <div key={group.title} className="md:col-span-2">
              <p className="font-mono text-[11px] uppercase tracking-widest text-ink-400">
                {group.title}
              </p>
              <ul className="mt-3 space-y-2">
                {group.links.map((link) => (
                  <li key={link.label}>
                    {link.href === "#" ? (
                      <span
                        title="即将上线"
                        className="cursor-not-allowed text-sm text-ink-300"
                      >
                        {link.label}
                      </span>
                    ) : (
                      <Link
                        href={link.href}
                        className="text-sm text-ink-500 transition hover:text-primary-600"
                      >
                        {link.label}
                      </Link>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        <div className="mt-10 flex flex-col gap-2 border-t border-line pt-6 text-xs text-ink-400 sm:flex-row sm:items-center sm:justify-between">
          <p>© 2026 {site.name}. 保留所有权利。</p>
          <p>演示站点 · 站内品牌、产品与价格均为虚构占位内容</p>
        </div>
      </div>
    </footer>
  );
}
