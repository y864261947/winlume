"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Building2,
  ChevronRight,
  KeyRound,
  LayoutGrid,
  LucideIcon,
  Receipt,
  ScrollText,
  Users,
  Waypoints,
} from "lucide-react";

import { cn } from "@/lib/utils";

type NavItem = {
  href: string;
  label: string;
  description: string;
  icon: LucideIcon;
};

const navItems: NavItem[] = [
  {
    href: "/gateway-admin",
    label: "Service Accounts",
    description: "内部应用 key",
    icon: KeyRound,
  },
  {
    href: "/gateway-admin/pricing",
    label: "Pricing",
    description: "分组倍率 · 模型定价",
    icon: Receipt,
  },
  {
    href: "/gateway-admin/users",
    label: "Users",
    description: "平台用户管理",
    icon: Users,
  },
  {
    href: "/gateway-admin/logs",
    label: "Usage Logs",
    description: "全平台用量日志",
    icon: ScrollText,
  },
  {
    href: "/gateway-admin/billing-requests",
    label: "Billing Requests",
    description: "对公结算申请",
    icon: Building2,
  },
  {
    href: "/gateway-admin/channels",
    label: "Channels",
    description: "上游渠道配置",
    icon: Waypoints,
  },
];

function isActive(pathname: string, href: string) {
  if (href === "/gateway-admin") return pathname === href;
  return pathname === href || pathname.startsWith(`${href}/`);
}

function currentNavItem(pathname: string): NavItem | undefined {
  // Longest-href-first so /gateway-admin/pricing doesn't match the root item.
  return [...navItems].sort((a, b) => b.href.length - a.href.length).find((item) => isActive(pathname, item.href));
}

export default function GatewayAdminShell({
  children,
  adminName,
}: {
  children: React.ReactNode;
  adminName: string;
}) {
  const pathname = usePathname();
  const active = currentNavItem(pathname);
  const adminInitial = adminName.slice(0, 1).toUpperCase();

  return (
    <div className="flex min-h-screen bg-canvas">
      <aside className="flex w-64 shrink-0 flex-col border-r border-line bg-surface">
        <div className="flex items-center gap-2 px-5 py-5">
          <span className="grid size-8 place-items-center rounded-lg bg-primary-500 text-white">
            <LayoutGrid className="size-4" />
          </span>
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold text-ink-950">Gateway 管理后台</p>
            <p className="truncate text-[11px] text-ink-500">内部运维 · 平台管理员</p>
          </div>
        </div>
        <nav className="flex-1 space-y-0.5 px-3">
          {navItems.map((item) => {
            const itemActive = isActive(pathname, item.href);
            const Icon = item.icon;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors",
                  itemActive
                    ? "bg-primary-500 text-white shadow-sm"
                    : "text-ink-700 hover:bg-canvas hover:text-ink-950",
                )}
              >
                <Icon className="size-4 shrink-0" />
                <span className="flex min-w-0 flex-col">
                  <span className="truncate font-medium leading-tight">{item.label}</span>
                  <span className={cn("truncate text-[11px] leading-tight", itemActive ? "text-white/80" : "text-ink-500")}>
                    {item.description}
                  </span>
                </span>
              </Link>
            );
          })}
        </nav>
        <div className="flex items-center gap-2 border-t border-line px-5 py-4">
          <span className="grid size-7 shrink-0 place-items-center rounded-full bg-ink-950 text-xs font-medium text-white">
            {adminInitial}
          </span>
          <p className="truncate text-xs text-ink-600">{adminName}</p>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-14 shrink-0 items-center gap-2 border-b border-line bg-surface px-8 text-sm text-ink-500">
          <span className="text-ink-400">Gateway</span>
          {active ? (
            <>
              <ChevronRight className="size-3.5 text-ink-300" />
              <span className="font-medium text-ink-800">{active.label}</span>
            </>
          ) : null}
        </header>
        <main className="min-w-0 flex-1 overflow-x-auto px-8 py-8">{children}</main>
      </div>
    </div>
  );
}
