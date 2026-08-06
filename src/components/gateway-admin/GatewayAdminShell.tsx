"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Building2, KeyRound, LayoutGrid, LucideIcon, Receipt, ScrollText, Users, Waypoints } from "lucide-react";

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

export default function GatewayAdminShell({
  children,
  adminName,
}: {
  children: React.ReactNode;
  adminName: string;
}) {
  const pathname = usePathname();

  return (
    <div className="flex min-h-screen bg-canvas">
      <aside className="flex w-60 shrink-0 flex-col border-r border-line bg-surface">
        <div className="px-5 py-6">
          <div className="flex items-center gap-2 text-ink-950">
            <LayoutGrid className="size-5" />
            <span className="text-sm font-semibold">Gateway 管理后台</span>
          </div>
          <p className="mt-1 text-xs text-ink-500">内部运维 · 平台管理员</p>
        </div>
        <nav className="flex-1 space-y-1 px-3">
          {navItems.map((item) => {
            const active = isActive(pathname, item.href);
            const Icon = item.icon;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "flex items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors",
                  active
                    ? "bg-primary-500 text-white"
                    : "text-ink-700 hover:bg-canvas hover:text-ink-950",
                )}
              >
                <Icon className="size-4 shrink-0" />
                <span className="flex flex-col">
                  <span className="font-medium leading-tight">{item.label}</span>
                  <span className={cn("text-[11px] leading-tight", active ? "text-white/80" : "text-ink-500")}>
                    {item.description}
                  </span>
                </span>
              </Link>
            );
          })}
        </nav>
        <div className="border-t border-line px-5 py-4">
          <p className="truncate text-xs text-ink-500">已登录:{adminName}</p>
        </div>
      </aside>
      <main className="min-w-0 flex-1 overflow-x-auto px-8 py-8">{children}</main>
    </div>
  );
}
