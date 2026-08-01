"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  BarChart3,
  Compass,
  FolderKanban,
  Plus,
  HelpCircle,
  LayoutGrid,
  LoaderCircle,
  LogOut,
  PanelLeftClose,
  PanelLeftOpen,
  Search,
  Sparkles,
  Wallet,
} from "lucide-react";
import { useModals } from "@/components/providers";
import { formatBalance } from "@/lib/account";
import { site } from "@/data/site";
import { listSessions } from "@/lib/studio/api";
import { listProjects } from "@/lib/studio/api";
import type { Project, Session } from "@/lib/agent/types";
import ProjectDialog from "./ProjectDialog";

type NavItem = {
  href: string;
  label: string;
  icon: typeof Sparkles;
  exact?: boolean;
  soon?: boolean;
};

const primaryNav: NavItem[] = [
  { href: "/studio", label: "开始创作", icon: Sparkles, exact: true },
  { href: "/studio/skills", label: "全部能力", icon: LayoutGrid },
  { href: "/studio/artifacts", label: "我的作品", icon: FolderKanban },
  { href: "/studio/inspire", label: "灵感广场", icon: Compass },
  { href: "/studio", label: "任务进度", icon: BarChart3, soon: true },
];

function useSignOutAction() {
  const { signOut } = useModals();
  const [pending, setPending] = useState(false);
  const [failed, setFailed] = useState(false);
  const run = useCallback(async () => {
    if (pending) return false;
    setPending(true);
    setFailed(false);
    try {
      await signOut();
      return true;
    } catch {
      setFailed(true);
      return false;
    } finally {
      setPending(false);
    }
  }, [pending, signOut]);
  return { pending, failed, run };
}

function navActive(pathname: string, href: string, exact?: boolean) {
  if (exact) return pathname === href;
  return pathname === href || pathname.startsWith(`${href}/`);
}

export default function StudioSidebar({
  temporary = false,
  onRequestCollapse,
  onRequestExpand,
}: {
  temporary?: boolean;
  onRequestCollapse?: () => void;
  onRequestExpand?: () => void;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const { account, accountLoading, balanceConfig, openLogin } = useModals();
  const signOutAction = useSignOutAction();
  const [recent, setRecent] = useState<Session[]>([]);
  const [recentLoading, setRecentLoading] = useState(false);
  const [projects, setProjects] = useState<Project[]>([]);
  const [projectsLoading, setProjectsLoading] = useState(false);
  const [projectDialogOpen, setProjectDialogOpen] = useState(false);

  useEffect(() => {
    if (!account) return;
    let cancelled = false;
    const timer = window.setTimeout(() => {
      if (cancelled) return;
      setRecentLoading(true);
      listSessions()
        .then((sessions) => {
          if (!cancelled) setRecent(sessions.slice(0, 8));
        })
        .catch(() => {
          if (!cancelled) setRecent([]);
        })
        .finally(() => {
          if (!cancelled) setRecentLoading(false);
        });
    }, 0);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [account, pathname]);

  useEffect(() => {
    if (!account) return;
    let cancelled = false;
    const timer = window.setTimeout(() => {
      if (cancelled) return;
      setProjectsLoading(true);
      // Projects are an additive capability. A server without the project API
      // should leave the existing recent-chat sidebar usable.
      listProjects()
        .then((items) => {
          if (!cancelled) {
            setProjects(
              [...items].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)),
            );
          }
        })
        .catch(() => {
          if (!cancelled) setProjects([]);
        })
        .finally(() => {
          if (!cancelled) setProjectsLoading(false);
        });
    }, 0);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [account, pathname]);

  const sessionCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const session of recent) {
      if (!session.projectId) continue;
      counts.set(session.projectId, (counts.get(session.projectId) ?? 0) + 1);
    }
    return counts;
  }, [recent]);

  const avatarLetter = (
    account?.display_name ||
    account?.username ||
    "W"
  )
    .trim()
    .charAt(0)
    .toUpperCase();

  return (
    <aside className={`studio-glass relative z-[2] flex h-full w-[222px] shrink-0 flex-col border-r border-white/70 px-4 py-5 ${temporary ? "shadow-[12px_0_30px_rgba(36,30,54,0.16)]" : ""}`}>
      <div className="mb-6 flex items-center gap-1">
        <Link href="/studio" className="flex min-w-0 flex-1 items-center gap-2.5 px-2">
          <span className="studio-logo-mark flex h-[30px] w-[30px] shrink-0 items-center justify-center rounded-[9px]">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden>
              <path
                d="M12 2L14 9L21 11L14 13L12 20L10 13L3 11L10 9L12 2Z"
                fill="white"
              />
            </svg>
          </span>
          <span className="truncate text-[17px] font-bold tracking-wide text-[#241E36]">
            {site.name}
          </span>
        </Link>
        {temporary ? (
          <button
            type="button"
            onClick={onRequestExpand}
            title="固定展开侧栏"
            aria-label="固定展开侧栏"
            className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-[#615A73] transition-[background-color,color,transform] duration-150 hover:bg-white/75 hover:text-[#241E36] active:scale-[0.97]"
          >
            <PanelLeftOpen className="h-4 w-4" />
          </button>
        ) : onRequestCollapse ? (
          <button
            type="button"
            onClick={onRequestCollapse}
            title="收起侧栏"
            aria-label="收起侧栏"
            className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-[#615A73] transition-[background-color,color,transform] duration-150 hover:bg-white/75 hover:text-[#241E36] active:scale-[0.97]"
          >
            <PanelLeftClose className="h-4 w-4" />
          </button>
        ) : null}
      </div>

      <nav className="flex flex-col gap-0.5">
        {primaryNav.map((item) => {
          const Icon = item.icon;
          if (item.soon) {
            return (
              <span
                key={item.label}
                title="即将上线"
                className="studio-nav-item flex cursor-not-allowed items-center gap-2.5 rounded-[11px] px-3 py-2.5 text-[14px] text-[#8A8298] transition"
              >
                <Icon className="h-[18px] w-[18px] shrink-0 opacity-70" strokeWidth={1.8} />
                {item.label}
                <span className="ml-auto rounded-md bg-white/70 px-1.5 text-[10px] text-[#8A7860]">
                  即将
                </span>
              </span>
            );
          }
          const active = navActive(pathname, item.href, item.exact);
          return (
            <Link
              key={item.label}
              href={item.href}
              className={`studio-nav-item flex items-center gap-2.5 rounded-[11px] px-3 py-2.5 text-[14px] transition duration-150 ${
                active ? "studio-nav-active" : "text-[#615A73]"
              }`}
            >
              <Icon className="h-[18px] w-[18px] shrink-0" strokeWidth={1.8} />
              {item.label}
            </Link>
          );
        })}
      </nav>

      <div className="mt-5 min-h-0 max-h-[38%] overflow-y-auto px-1">
        <div className="mb-2 flex items-center justify-between px-2">
          <p className="text-[11px] font-semibold tracking-wide text-[#8A8298]">
            项目
          </p>
          {account ? (
            <button
              type="button"
              onClick={() => setProjectDialogOpen(true)}
              title="新建项目"
              aria-label="新建项目"
              className="inline-flex h-6 w-6 items-center justify-center rounded-[7px] text-[#615A73] transition hover:bg-white/75 hover:text-[#241E36]"
            >
              <Plus className="h-3.5 w-3.5" strokeWidth={2} />
            </button>
          ) : null}
        </div>
        {!account ? (
          <p className="px-2 text-xs leading-5 text-[#8A8298]">登录后管理项目</p>
        ) : projectsLoading ? (
          <p className="flex items-center gap-1.5 px-2 text-xs text-[#8A8298]">
            <LoaderCircle className="h-3.5 w-3.5 animate-spin" />
            加载中…
          </p>
        ) : projects.length === 0 ? (
          <button
            type="button"
            onClick={() => setProjectDialogOpen(true)}
            className="group w-full rounded-[10px] border border-dashed border-white/80 px-2.5 py-2 text-left text-xs leading-5 text-[#8A8298] transition hover:border-[rgba(15,23,42,0.2)] hover:bg-white/50 hover:text-[#615A73]"
          >
            创建一个项目，把相关对话放在一起
          </button>
        ) : (
          <ul className="space-y-0.5">
            {projects.slice(0, 12).map((project) => {
              const active = pathname === `/studio/p/${project.id}`;
              const count = sessionCounts.get(project.id);
              return (
                <li key={project.id}>
                  <Link
                    href={`/studio/p/${encodeURIComponent(project.id)}`}
                    className={`studio-nav-item flex min-w-0 items-center gap-2 rounded-[10px] px-2.5 py-2 text-[13px] transition ${
                      active
                        ? "studio-nav-active"
                        : "text-[#615A73] hover:text-[#241E36]"
                    }`}
                    title={project.description || project.name}
                  >
                    <FolderKanban className="h-3.5 w-3.5 shrink-0" strokeWidth={1.8} />
                    <span className="min-w-0 flex-1 truncate">{project.name}</span>
                    {count ? (
                      <span className="shrink-0 text-[10px] tabular-nums text-[#AAA2B2]">
                        {count}
                      </span>
                    ) : null}
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      <div className="mt-5 min-h-0 flex-1 overflow-y-auto px-1">
        <p className="mb-2 px-2 text-[11px] font-semibold tracking-wide text-[#8A8298]">
          最近对话
        </p>
        {!account ? (
          <p className="px-2 text-xs leading-5 text-[#8A8298]">登录后显示历史会话</p>
        ) : recentLoading ? (
          <p className="flex items-center gap-1.5 px-2 text-xs text-[#8A8298]">
            <LoaderCircle className="h-3.5 w-3.5 animate-spin" />
            加载中…
          </p>
        ) : recent.length === 0 ? (
          <p className="px-2 text-xs leading-5 text-[#8A8298]">暂无会话，从「开始创作」发起</p>
        ) : (
          <ul className="space-y-0.5">
            {recent.map((s) => {
              const active = pathname === `/studio/c/${s.id}`;
              return (
                <li key={s.id}>
                  <Link
                    href={`/studio/c/${s.id}`}
                    className={`studio-nav-item block truncate rounded-[10px] px-2.5 py-2 text-[13px] transition ${
                      active
                        ? "studio-nav-active"
                        : "text-[#615A73] hover:text-[#241E36]"
                    }`}
                    title={s.title}
                  >
                    {s.title || "未命名对话"}
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      <ProjectDialog
        open={projectDialogOpen}
        onClose={() => setProjectDialogOpen(false)}
        onCreated={(project) => {
          setProjects((current) => [project, ...current.filter((item) => item.id !== project.id)]);
          router.push(`/studio/p/${encodeURIComponent(project.id)}`);
        }}
      />

      <div className="mt-3 space-y-1 border-t border-white/50 pt-3">
        <Link
          href="/studio/skills"
          className="studio-nav-item flex items-center gap-2.5 rounded-[11px] px-3 py-2.5 text-[13.5px] text-[#615A73] transition"
        >
          <Search className="h-4 w-4 shrink-0" strokeWidth={1.8} />
          快速搜索
          <span className="ml-auto inline-flex gap-1">
            <kbd className="inline-flex h-[18px] min-w-[18px] items-center justify-center rounded-[5px] border border-black/5 bg-gradient-to-b from-white to-[#f5f0e8] px-1 text-[10.5px] font-bold text-[#8A7860] shadow-sm">
              /
            </kbd>
          </span>
        </Link>
        <button
          type="button"
          onClick={() => undefined}
          className="studio-nav-item flex w-full items-center gap-2.5 rounded-[11px] px-3 py-2.5 text-left text-[13.5px] text-[#8A8298] transition"
          title="帮助文档即将完善"
        >
          <HelpCircle className="h-4 w-4 shrink-0" strokeWidth={1.8} />
          使用帮助
        </button>
      </div>

      <div className="mt-3 border-t border-white/50 pt-3">
        {account ? (
          <div className="space-y-2">
            <div className="flex items-center gap-2.5 px-1">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-[#334155] to-[#0F172A] text-sm font-bold text-white shadow-[0_6px_14px_-6px_rgba(15, 23, 42,0.5)]">
                {avatarLetter}
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-[#241E36]">
                  {account.display_name || account.username}
                </p>
                <p className="flex items-center gap-1 text-[11px] text-[#8A8298]">
                  <Wallet className="h-3 w-3 text-[#0F172A]" />
                  <span className="font-mono font-semibold text-[#241E36]">
                    {formatBalance(account.quota, balanceConfig)}
                  </span>
                </p>
              </div>
            </div>
            {signOutAction.failed ? (
              <p role="alert" className="px-1 text-xs text-[#EF4770]">
                退出失败，请重试
              </p>
            ) : null}
            <div className="grid grid-cols-2 gap-1.5">
              <Link
                href="/studio/settings"
                className="rounded-[10px] border border-white/80 bg-white/50 py-2 text-center text-xs text-[#615A73] transition hover:bg-white/80"
              >
                设置
              </Link>
              <button
                type="button"
                disabled={signOutAction.pending}
                onClick={() => {
                  void signOutAction.run();
                }}
                className="inline-flex items-center justify-center gap-1 rounded-[10px] border border-white/80 bg-white/50 py-2 text-xs text-[#615A73] transition hover:bg-white/80 disabled:opacity-60"
              >
                {signOutAction.pending ? (
                  <LoaderCircle className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <LogOut className="h-3.5 w-3.5" />
                )}
                退出
              </button>
            </div>
          </div>
        ) : accountLoading ? (
          <div
            className="h-16 animate-pulse rounded-[12px] bg-white/40"
            aria-label="正在加载账户"
          />
        ) : (
          <div className="space-y-2">
            <p className="px-1 text-xs leading-5 text-[#8A8298]">
              登录后即可对话、使用 Skills 与保存作品。
            </p>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => openLogin("login")}
                className="rounded-[11px] border border-white/80 bg-white/60 py-2 text-sm text-[#241E36] transition hover:bg-white"
              >
                登录
              </button>
              <button
                type="button"
                onClick={() => openLogin("register")}
                className="studio-send-btn rounded-[11px] py-2 text-sm font-medium text-white"
              >
                注册
              </button>
            </div>
          </div>
        )}
      </div>
    </aside>
  );
}
