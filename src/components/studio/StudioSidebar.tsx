"use client";

import { useCallback, useEffect, useMemo, useState, useSyncExternalStore } from "react";
import Image from "next/image";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  ChevronRight,
  FolderKanban,
  Plus,
  LayoutGrid,
  LoaderCircle,
  LogOut,
  PanelLeftClose,
  PanelLeftOpen,
  Search,
  Settings2,
  Sparkles,
  UserRound,
  Wallet,
  Wrench,
} from "lucide-react";
import { useModals } from "@/components/providers";
import { formatBalance } from "@/lib/account";
import { site } from "@/data/site";
import { listSessions } from "@/lib/studio/api";
import { listProjects } from "@/lib/studio/api";
import type { Project, Session } from "@/lib/agent/types";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import ProjectDialog from "./ProjectDialog";
import {
  getUnreadSessionIds,
  getUnreadSessionIdsServer,
  setViewedStudioSession,
  subscribeUnreadSessions,
} from "@/lib/studio/session-unread";
import StudioSearchDialog from "./StudioSearchDialog";
import StudioSettingsDialog from "./StudioSettingsDialog";
import {
  listStudioToolCategories,
  studioSkillsHref,
  studioToolCategoryHref,
} from "@/lib/studio/tool-categories";
import { getStudioTool } from "@/lib/studio/tool-catalog";

type NavItem = {
  href: string;
  label: string;
  icon: typeof Sparkles;
  exact?: boolean;
  soon?: boolean;
};

const primaryNav: NavItem[] = [
  { href: "/studio", label: "开始创作", icon: Sparkles, exact: true },
  { href: "/studio/artifacts", label: "我的作品", icon: FolderKanban },
];

const toolCategories = listStudioToolCategories();

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

function usePersistedOpen(key: string, fallback = true) {
  const [open, setOpen] = useState(fallback);
  useEffect(() => {
    const stored = window.localStorage.getItem(key);
    /* eslint-disable react-hooks/set-state-in-effect -- hydrate persisted sidebar fold from localStorage after mount */
    if (stored === "0") setOpen(false);
    if (stored === "1") setOpen(true);
    /* eslint-enable react-hooks/set-state-in-effect */
  }, [key]);
  const toggle = useCallback(() => {
    setOpen((current) => {
      const next = !current;
      window.localStorage.setItem(key, next ? "1" : "0");
      return next;
    });
  }, [key]);
  return [open, toggle] as const;
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
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [projectsOpen, toggleProjectsOpen] = usePersistedOpen("reizo:studio-sidebar-projects");
  const [recentsOpen, toggleRecentsOpen] = usePersistedOpen("reizo:studio-sidebar-recents");
  const [toolsOpen, toggleToolsOpen] = usePersistedOpen("reizo:studio-sidebar-tools", false);
  const onToolsRoute = pathname === "/studio/tools" || pathname.startsWith("/studio/tools/");
  const onSkillsRoute = pathname === "/studio/skills" || pathname.startsWith("/studio/skills/");
  const toolsExpanded = toolsOpen || onToolsRoute || onSkillsRoute;
  const activeToolCategoryId = pathname.startsWith("/studio/tools/c/")
    ? decodeURIComponent(pathname.slice("/studio/tools/c/".length).split("/")[0] ?? "")
    : getStudioTool(pathname.replace(/^\/studio\/tools\//, ""))?.category ?? "";
  const unreadIds = useSyncExternalStore(
    subscribeUnreadSessions,
    getUnreadSessionIds,
    getUnreadSessionIdsServer,
  );
  const viewedSessionId = pathname.startsWith("/studio/c/")
    ? decodeURIComponent(pathname.slice("/studio/c/".length))
    : null;

  useEffect(() => {
    setViewedStudioSession(viewedSessionId);
  }, [viewedSessionId]);

  useEffect(() => {
    document.body.style.removeProperty("pointer-events");
  }, []);

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      const target = event.target as HTMLElement | null;
      const typing = target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable);
      if ((event.key === "k" || event.key === "K") && (event.metaKey || event.ctrlKey)) {
        event.preventDefault();
        setSearchOpen(true);
        return;
      }
      if (event.key === "/" && !event.metaKey && !event.ctrlKey && !event.altKey && !typing) {
        event.preventDefault();
        setSearchOpen(true);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

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
    <aside className={`studio-glass relative z-[2] flex h-full w-[248px] shrink-0 flex-col border-r border-white/70 px-3 py-4 ${temporary ? "shadow-[12px_0_30px_rgba(36,30,54,0.16)]" : ""}`}>
      <div className="mb-5 flex items-center gap-1">
        <Link href="/studio" className="flex min-w-0 flex-1 items-center gap-2.5 px-2">
          <span className="studio-logo-mark flex h-[30px] w-[30px] shrink-0 items-center justify-center">
            <Image src="/brand/reizo-mark.png" alt="" width={30} height={30} priority />
          </span>
          <span className="studio-brand-wordmark truncate text-[#241E36]">
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

      <button
        type="button"
        onClick={() => setSearchOpen(true)}
        className="studio-nav-item mb-2 flex items-center gap-3 rounded-[14px] px-3 py-2.5 text-left text-[14px] text-[#615A73] outline-none transition-colors focus-visible:outline-none"
      >
        <Search className="size-[18px] shrink-0" strokeWidth={1.8} />
        快速搜索
        <kbd className="ml-auto inline-flex h-[18px] min-w-[18px] items-center justify-center rounded-[5px] border border-black/5 bg-white/70 px-1 text-[10.5px] font-bold text-[#8A7860]">
          /
        </kbd>
      </button>

      <nav className="flex flex-col gap-0.5" aria-label="Studio 导航">
        {primaryNav.slice(0, 1).map((item) => {
          const Icon = item.icon;
          const active = navActive(pathname, item.href, item.exact);
          return (
            <Link
              key={item.label}
              href={item.href}
              className={`studio-nav-item flex items-center gap-3 rounded-[14px] px-3 py-2.5 text-[14px] outline-none transition-colors focus-visible:outline-none ${
                active ? "studio-nav-active" : "text-[#615A73]"
              }`}
            >
              <Icon className="size-[18px] shrink-0" strokeWidth={1.8} />
              {item.label}
            </Link>
          );
        })}

        <div>
          <button
            type="button"
            onClick={toggleToolsOpen}
            aria-expanded={toolsExpanded}
            className={`studio-nav-item flex w-full items-center gap-3 rounded-[14px] px-3 py-2.5 text-left text-[14px] outline-none transition-colors focus-visible:outline-none ${
              onToolsRoute || onSkillsRoute ? "studio-nav-active" : "text-[#615A73]"
            }`}
          >
            <LayoutGrid className="size-[18px] shrink-0" strokeWidth={1.8} />
            全部工具
            <ChevronRight
              className={`ml-auto size-3.5 shrink-0 transition-transform ${toolsExpanded ? "rotate-90" : ""}`}
            />
          </button>
          {toolsExpanded ? (
            <ul className="mt-0.5 flex max-h-[42vh] flex-col gap-0.5 overflow-y-auto px-1 pb-1">
              {toolCategories.map((category) => {
                const Icon = category.icon;
                const href = studioToolCategoryHref(category.id);
                const active = activeToolCategoryId === category.id;
                return (
                  <li key={category.id}>
                    <Link
                      href={href}
                      title={category.summary}
                      className={`studio-nav-item flex min-w-0 items-center gap-2 rounded-[12px] px-3 py-2 text-[13px] outline-none transition-colors focus-visible:outline-none ${
                        active ? "studio-nav-active" : "text-[#615A73]"
                      }`}
                    >
                      <Icon className="size-3.5 shrink-0" strokeWidth={1.8} />
                      <span className="truncate">{category.name}</span>
                    </Link>
                  </li>
                );
              })}
              <li>
                <Link
                  href={studioSkillsHref()}
                  className={`studio-nav-item flex min-w-0 items-center gap-2 rounded-[12px] px-3 py-2 text-[13px] outline-none transition-colors focus-visible:outline-none ${
                    onSkillsRoute ? "studio-nav-active" : "text-[#615A73]"
                  }`}
                >
                  <Wrench className="size-3.5 shrink-0" strokeWidth={1.8} />
                  <span className="truncate">Skills 目录</span>
                </Link>
              </li>
            </ul>
          ) : null}
        </div>

        {primaryNav.slice(1).map((item) => {
          const Icon = item.icon;
          const active = navActive(pathname, item.href, item.exact);
          return (
            <Link
              key={item.label}
              href={item.href}
              className={`studio-nav-item flex items-center gap-3 rounded-[14px] px-3 py-2.5 text-[14px] outline-none transition-colors focus-visible:outline-none ${
                active ? "studio-nav-active" : "text-[#615A73]"
              }`}
            >
              <Icon className="size-[18px] shrink-0" strokeWidth={1.8} />
              {item.label}
            </Link>
          );
        })}
      </nav>

      <div className="mt-6 flex min-h-0 flex-1 flex-col gap-1 overflow-hidden">
        <div className="flex min-h-0 flex-col">
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={toggleProjectsOpen}
              className="studio-nav-item flex min-w-0 flex-1 items-center gap-1 rounded-[12px] px-3 py-2 text-left text-[13px] text-[#8A8298] outline-none transition-colors hover:text-[#241E36] focus-visible:outline-none"
              aria-expanded={projectsOpen}
            >
              <ChevronRight className={`size-3.5 shrink-0 transition-transform ${projectsOpen ? "rotate-90" : ""}`} />
              项目
            </button>
            {account ? (
              <button
                type="button"
                onClick={() => setProjectDialogOpen(true)}
                title="新建项目"
                aria-label="新建项目"
                className="mr-1 inline-flex size-7 items-center justify-center rounded-[8px] text-[#615A73] outline-none transition-colors hover:bg-white/70 hover:text-[#241E36] focus-visible:outline-none"
              >
                <Plus className="size-3.5" strokeWidth={2} />
              </button>
            ) : null}
          </div>
          {projectsOpen ? (
            <div className="min-h-0 overflow-y-auto px-1 pb-2">
              {!account ? (
                <p className="px-3 py-1.5 text-xs leading-5 text-[#8A8298]">登录后管理项目</p>
              ) : projectsLoading ? (
                <p className="flex items-center gap-1.5 px-3 py-1.5 text-xs text-[#8A8298]">
                  <LoaderCircle className="size-3.5 animate-spin" />
                  加载中…
                </p>
              ) : projects.length === 0 ? (
                <button
                  type="button"
                  onClick={() => setProjectDialogOpen(true)}
                  className="w-full rounded-[12px] px-3 py-2 text-left text-xs leading-5 text-[#8A8298] transition-colors hover:bg-white/60 hover:text-[#615A73]"
                >
                  创建一个项目
                </button>
              ) : (
                <ul className="flex flex-col gap-0.5">
                  {projects.slice(0, 12).map((project) => {
                    const active = pathname === `/studio/p/${project.id}`;
                    const count = sessionCounts.get(project.id);
                    return (
                      <li key={project.id}>
                        <Link
                          href={`/studio/p/${encodeURIComponent(project.id)}`}
                          className={`studio-nav-item flex min-w-0 items-center gap-2 rounded-[12px] px-3 py-2 text-[13px] outline-none transition-colors focus-visible:outline-none ${
                            active ? "studio-nav-active" : "text-[#615A73]"
                          }`}
                          title={project.description || project.name}
                        >
                          <span className="min-w-0 flex-1 truncate">{project.name}</span>
                          {count ? (
                            <span className="shrink-0 text-[11px] tabular-nums text-[#AAA2B2]">
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
          ) : null}
        </div>

        <div className="flex min-h-0 flex-1 flex-col">
          <button
            type="button"
            onClick={toggleRecentsOpen}
            className="studio-nav-item flex w-full items-center gap-1 rounded-[12px] px-3 py-2 text-left text-[13px] text-[#8A8298] outline-none transition-colors hover:text-[#241E36] focus-visible:outline-none"
            aria-expanded={recentsOpen}
          >
            <ChevronRight className={`size-3.5 shrink-0 transition-transform ${recentsOpen ? "rotate-90" : ""}`} />
            对话
          </button>
          {recentsOpen ? (
            <div className="min-h-0 flex-1 overflow-y-auto px-1 pb-2">
              {!account ? (
                <p className="px-3 py-1.5 text-xs leading-5 text-[#8A8298]">登录后显示历史会话</p>
              ) : recentLoading ? (
                <p className="flex items-center gap-1.5 px-3 py-1.5 text-xs text-[#8A8298]">
                  <LoaderCircle className="size-3.5 animate-spin" />
                  加载中…
                </p>
              ) : recent.length === 0 ? (
                <p className="px-3 py-1.5 text-xs leading-5 text-[#8A8298]">暂无会话</p>
              ) : (
                <ul className="flex flex-col gap-0.5">
                  {recent.map((s) => {
                    const active = pathname === `/studio/c/${s.id}`;
                    return (
                      <li key={s.id}>
                        <Link
                          href={`/studio/c/${s.id}`}
                          className={`studio-nav-item flex items-center gap-2 rounded-[12px] px-3 py-2 text-[13px] outline-none transition-colors focus-visible:outline-none ${
                            active ? "studio-nav-active" : "text-[#615A73]"
                          }`}
                          title={s.title}
                        >
                          <span className="min-w-0 flex-1 truncate">{s.title || "未命名对话"}</span>
                          {unreadIds.has(s.id) ? (
                            <span
                              className="size-1.5 shrink-0 rounded-full bg-[#3B82F6]"
                              aria-label="未读回复"
                            />
                          ) : null}
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          ) : null}
        </div>
      </div>

      <ProjectDialog
        open={projectDialogOpen}
        onClose={() => setProjectDialogOpen(false)}
        onCreated={(project) => {
          setProjects((current) => [project, ...current.filter((item) => item.id !== project.id)]);
          router.push(`/studio/p/${encodeURIComponent(project.id)}`);
        }}
      />
      <StudioSearchDialog open={searchOpen} onClose={() => setSearchOpen(false)} />
      <StudioSettingsDialog open={settingsOpen} onClose={() => setSettingsOpen(false)} />

      <div className="mt-3 border-t border-white/50 pt-3">
        {account ? (
          <DropdownMenu modal={false}>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                aria-label="打开账户菜单"
                className="flex w-full items-center gap-2.5 rounded-[18px] px-2 py-2 text-left outline-none ring-0 transition-colors duration-150 hover:bg-white/60 focus:outline-none focus-visible:bg-white/60 focus-visible:outline-none data-[state=open]:bg-white/70"
              >
                <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-[#334155] to-[#0F172A] text-sm font-bold text-white">
                  {avatarLetter}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium text-[#241E36]">
                    {account.display_name || account.username}
                  </span>
                  <span className="mt-0.5 block truncate text-[12px] text-[#8A8298]">
                    {account.email || formatBalance(account.quota, balanceConfig)}
                  </span>
                </span>
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent
              side="top"
              align="start"
              sideOffset={8}
              className="w-[214px] rounded-[18px] border border-[#d4cec4] bg-[#fffdfb] p-1.5 shadow-[0_20px_50px_-16px_rgba(36,30,54,0.45),0_1px_0_rgba(255,255,255,0.8)_inset]"
            >
              <DropdownMenuGroup>
                <DropdownMenuItem
                  className="h-10 cursor-pointer rounded-[12px] px-2.5 text-[14px] text-[#241E36] outline-none focus:bg-[#ebe4d8] focus:outline-none focus-visible:outline-none data-[highlighted]:bg-[#ebe4d8]"
                  onSelect={() => {
                    window.setTimeout(() => setSettingsOpen(true), 10);
                  }}
                >
                  <Settings2 className="size-4 text-[#615A73]" />
                  设置
                </DropdownMenuItem>
                <DropdownMenuItem asChild className="h-10 cursor-pointer rounded-[12px] px-2.5 text-[14px] text-[#241E36] outline-none focus:bg-[#ebe4d8] focus:outline-none focus-visible:outline-none data-[highlighted]:bg-[#ebe4d8]">
                  <Link href="/account">
                    <UserRound className="size-4 text-[#615A73]" />
                    个人中心
                  </Link>
                </DropdownMenuItem>
                <DropdownMenuItem asChild className="h-10 cursor-pointer rounded-[12px] px-2.5 text-[14px] text-[#241E36] outline-none focus:bg-[#ebe4d8] focus:outline-none focus-visible:outline-none data-[highlighted]:bg-[#ebe4d8]">
                  <Link href="/account/wallet">
                    <Wallet className="size-4 text-[#615A73]" />
                    钱包与用量
                  </Link>
                </DropdownMenuItem>
              </DropdownMenuGroup>
              <DropdownMenuSeparator className="mx-1 my-1 bg-[#e6e0d6]" />
              <DropdownMenuItem
                disabled={signOutAction.pending}
                className="h-10 cursor-pointer rounded-[12px] px-2.5 text-[14px] text-[#241E36] outline-none focus:bg-[#ebe4d8] focus:outline-none focus-visible:outline-none data-[highlighted]:bg-[#ebe4d8]"
                onSelect={() => {
                  void signOutAction.run();
                }}
              >
                {signOutAction.pending ? <LoaderCircle className="size-4 animate-spin" /> : <LogOut className="size-4 text-[#615A73]" />}
                退出登录
              </DropdownMenuItem>
              {signOutAction.failed ? (
                <p role="alert" className="px-2.5 py-1 text-xs text-[#EF4770]">
                  退出失败，请重试
                </p>
              ) : null}
            </DropdownMenuContent>
          </DropdownMenu>
        ) : accountLoading ? (
          <div
            className="h-12 animate-pulse rounded-[18px] bg-white/40"
            aria-label="正在加载账户"
          />
        ) : (
          <button
            type="button"
            onClick={() => openLogin("login")}
            className="flex w-full items-center gap-2.5 rounded-[18px] px-2 py-2 text-left outline-none transition-colors duration-150 hover:bg-white/60 focus-visible:outline-none"
          >
            <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-[#e8e2d6] text-sm font-medium text-[#615A73]">
              登
            </span>
            <span className="min-w-0">
              <span className="block text-sm font-medium text-[#241E36]">登录</span>
              <span className="text-[12px] text-[#8A8298]">开始对话并保存作品</span>
            </span>
          </button>
        )}
      </div>
    </aside>
  );
}
