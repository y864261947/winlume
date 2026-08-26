"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  BookOpen,
  Building2,
  CircleHelp,
  ClipboardList,
  KeyRound,
  LayoutDashboard,
  LockKeyhole,
  Receipt,
  ScrollText,
  Settings2,
  Store,
  UsersRound,
  UserPlus,
  PanelsTopLeft,
  WalletCards,
  Wrench,
} from "lucide-react";
import { type ReactNode } from "react";
import { useModals } from "@/components/providers";
import PortalHeader from "@/components/PortalHeader";
import { cn } from "@/lib/utils";

type NavItem = {
  href: string;
  label: string;
  mobileLabel?: string;
  icon: typeof KeyRound;
  exact?: boolean;
  aliases?: string[];
};

type NavGroup = {
  label: string;
  items: NavItem[];
};

const groups: NavGroup[] = [
  {
    label: "用户中心",
    items: [
      { href: "/account", label: "个人中心", mobileLabel: "个人", icon: LayoutDashboard, exact: true },
      { href: "/account/tasks", label: "任务看板", mobileLabel: "任务", icon: ClipboardList },
    ],
  },
  {
    label: "接入",
    items: [{ href: "/account/keys", label: "API Keys", mobileLabel: "Keys", icon: KeyRound }],
  },
  {
    label: "计费",
    items: [
      { href: "/account/wallet", label: "钱包与充值", mobileLabel: "钱包", icon: WalletCards, aliases: ["/account/usage"] },
      { href: "/account/logs", label: "请求日志", mobileLabel: "日志", icon: ScrollText },
      { href: "/account/pricing", label: "会员购买", mobileLabel: "会员", icon: Receipt },
      { href: "/account/enterprise", label: "对公结算", mobileLabel: "对公", icon: Building2 },
    ],
  },
  {
    label: "账户安全",
    items: [
      { href: "/account/security", label: "修改密码", mobileLabel: "密码", icon: LockKeyhole },
      { href: "/account/invite", label: "邀请好友", mobileLabel: "邀请", icon: UserPlus },
    ],
  },
  {
    label: "工作区",
    items: [
      { href: "/account/personalization", label: "人格与工具", mobileLabel: "设置", icon: Settings2 },
      { href: "/account/team", label: "团队", mobileLabel: "团队", icon: UsersRound },
      { href: "/account/community", label: "交流社区", mobileLabel: "社区", icon: Store },
    ],
  },
];

const mobileItems = groups.flatMap((group) => group.items).slice(0, 5);

function isActive(pathname: string, item: NavItem) {
  const paths = [item.href, ...(item.aliases ?? [])];
  return paths.some((href) =>
    item.exact ? pathname === href : pathname === href || pathname.startsWith(`${href}/`),
  );
}

function AccountNav({
  pathname,
  onNavigate,
  isAdmin = false,
}: {
  pathname: string;
  onNavigate?: () => void;
  isAdmin?: boolean;
}) {
  const navGroups = isAdmin
    ? [
        ...groups,
        {
          label: "平台",
          items: [
            { href: "/account/portal", label: "门户内容管理", mobileLabel: "门户", icon: PanelsTopLeft },
            { href: "/account/skills", label: "Skill 配置", mobileLabel: "Skill", icon: Wrench },
          ],
        },
      ]
    : groups;
  return (
    <nav aria-label="个人中心导航" className="portal-account-side-nav">
      {navGroups.map((group) => (
        <div key={group.label} className="flex flex-col gap-1">
          <p className="portal-account-side-kicker px-2.5 pt-2">{group.label}</p>
          {group.items.map((item) => {
            const Icon = item.icon;
            const active = isActive(pathname, item);
            return (
              <Link
                key={item.href}
                href={item.href}
                aria-current={active ? "page" : undefined}
                onClick={onNavigate}
                className={cn(active && "is-active")}
              >
                <Icon aria-hidden />
                {item.label}
              </Link>
            );
          })}
        </div>
      ))}
    </nav>
  );
}

export default function AccountShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const { account } = useModals();
  const isAdmin = account?.platform_role === "admin";

  return (
    <div className="portal-home">
      <div className="portal-frame portal-account-frame">
        <PortalHeader />

        <div className="portal-account-layout">
          <aside className="portal-account-side">
            <p className="portal-account-side-kicker">Account</p>
            <h2 className="portal-account-side-title">个人中心</h2>
            <AccountNav pathname={pathname} isAdmin={isAdmin} />
            <div className="portal-account-side-help">
              <p>帮助与支持</p>
              <Link href="/docs" target="_blank" rel="noreferrer">
                <BookOpen aria-hidden />
                文档中心
              </Link>
              <Link href="/account/community">
                <CircleHelp aria-hidden />
                联系支持
              </Link>
            </div>
          </aside>

          <main className="portal-account-main">{children}</main>
        </div>
      </div>

      <nav aria-label="个人中心导航" className="portal-account-mobile-nav">
        {mobileItems.map((item) => {
          const Icon = item.icon;
          const active = isActive(pathname, item);
          return (
            <Link
              key={item.href}
              href={item.href}
              aria-current={active ? "page" : undefined}
              className={active ? "is-active" : undefined}
            >
              <Icon aria-hidden />
              <span>{item.mobileLabel ?? item.label}</span>
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
