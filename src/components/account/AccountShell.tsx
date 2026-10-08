"use client";

import ReizoFooter from "@/components/reizo/ReizoFooter";

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
  MessageSquareWarning,
  Receipt,
  ScrollText,
  Settings2,
  Store,
  UsersRound,
  UserPlus,
  PanelsTopLeft,
  WalletCards,
  Wrench,
  UserRound,
} from "lucide-react";
import { useState, type ReactNode } from "react";
import { AccountPageContext, accountPages } from "./AccountPageContext";
import { ConsolePage } from "@/components/console/ConsolePage";
import { useModals } from "@/components/providers";
import ReizoHeader from "@/components/reizo/ReizoHeader";
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
    label: "我的账户",
    items: [
      { href: "/account", label: "账户概览", mobileLabel: "概览", icon: LayoutDashboard, exact: true },
      { href: "/account/personalization", label: "资料与设置", mobileLabel: "设置", icon: Settings2 },
      { href: "/account/security", label: "账户安全", mobileLabel: "安全", icon: LockKeyhole },
    ],
  },
  {
    label: "钱包与会员",
    items: [
      { href: "/account/wallet", label: "钱包与账单", mobileLabel: "钱包", icon: WalletCards, aliases: ["/account/usage"] },
      { href: "/account/pricing", label: "我的会员", mobileLabel: "会员", icon: Receipt },
      { href: "/account/invite", label: "邀请好友", mobileLabel: "邀请", icon: UserPlus },
      { href: "/account/enterprise", label: "对公结算", mobileLabel: "对公", icon: Building2 },
    ],
  },
  {
    label: "开发与协作",
    items: [
      { href: "/account/tasks", label: "任务看板", mobileLabel: "任务", icon: ClipboardList },
      { href: "/account/keys", label: "API 密钥", mobileLabel: "密钥", icon: KeyRound },
      { href: "/account/logs", label: "调用日志", mobileLabel: "日志", icon: ScrollText },
      { href: "/account/team", label: "团队管理", mobileLabel: "团队", icon: UsersRound },
    ],
  },
  {
    label: "帮助与支持",
    items: [
      { href: "/account/community", label: "交流社区", mobileLabel: "社区", icon: Store },
    ],
  },
];

const requiresAccount = new Set(["/account/wallet", "/account/personalization", "/account/keys", "/account/logs", "/account/team", "/account/usage"]);

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
            { href: "/account/services", label: "服务接入", mobileLabel: "服务", icon: Settings2 },
            { href: "/account/service-pricing", label: "模型与服务定价", mobileLabel: "定价", icon: Receipt },
            { href: "/account/feedback", label: "反馈列表", mobileLabel: "反馈", icon: MessageSquareWarning },
            { href: "/account/skills", label: "Skill 配置", mobileLabel: "Skill", icon: Wrench },
          ],
        },
      ]
    : groups;
  return (
    <nav aria-label="我的账户导航" className="ac-nav">
      {navGroups.map((group) => (
        <div key={group.label} className="ac-nav-group">
          <p>{group.label}</p>
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
  const { account, accountLoading, openLogin, signOut } = useModals();
  const [logoutError, setLogoutError] = useState("");
  const [loggingOut, setLoggingOut] = useState(false);
  const isAdmin = account?.platform_role === "admin";

  return (
    <div className="reizo-site reizo-page-account account-page">
      <div className="reizo-account-frame">
        <ReizoHeader />

        <div className="ac-shell">
          <aside className="ac-sidebar">
            <h2 className="ac-sidebar-title"><UserRound aria-hidden />我的账户</h2>
            <AccountNav pathname={pathname} isAdmin={isAdmin} />
            {account && <button className="ac-logout" disabled={loggingOut} onClick={async () => {
              setLoggingOut(true); setLogoutError("");
              try { await signOut(); } catch { setLogoutError("退出失败，请重试。"); } finally { setLoggingOut(false); }
            }}>{loggingOut ? "正在退出…" : "退出登录"}<span>↗</span></button>}
            {logoutError && <p className="ac-note" role="alert">{logoutError}</p>}
            <div className="reizo-account-help">
              <Link href="/docs" target="_blank" rel="noreferrer">
                <BookOpen aria-hidden />
                文档中心
              </Link>
              <Link href="/support#contact">
                <CircleHelp aria-hidden />
                帮助支持
              </Link>
            </div>
          </aside>

          <main className="ac-content" id="account-content"><AccountPageContext.Provider value={accountPages[pathname] ?? { group: isAdmin ? "平台管理" : "我的账户", title: "", description: "" }}>
            {requiresAccount.has(pathname) && !account ? <ConsolePage title="我的账户"><section className="reizo-account-login"><UserRound aria-hidden /><h2>{accountLoading ? "正在读取账户…" : `登录后查看${accountPages[pathname]?.title || "账户信息"}`}</h2><p>连接你的账户，安全地管理资料、用量与协作。</p><button className="ac-button" disabled={accountLoading} onClick={() => openLogin()}>登录账户 ↗</button></section></ConsolePage> : children}
          </AccountPageContext.Provider></main>
        </div>
        <ReizoFooter />
      </div>

    </div>
  );
}
