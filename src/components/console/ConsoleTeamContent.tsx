"use client";

import {
  Check,
  LoaderCircle,
  Plus,
  ShieldCheck,
  Trash2,
  UserPlus,
  UsersRound,
  X,
} from "lucide-react";
import {
  addConsoleTeamMember,
  getConsoleTeam,
  removeConsoleTeamMember,
  updateConsoleTeamMember,
} from "@/lib/console/client";
import type { ConsoleOrganizationRole, ConsoleTeam, ConsoleTeamMember } from "@/lib/console/types";
import { useCallback, useEffect, useState, type FormEvent } from "react";
import { ConsoleEmptyState, ConsolePage } from "./ConsolePage";

const roles: Array<{ value: ConsoleOrganizationRole; label: string; description: string }> = [
  { value: "owner", label: "Owner", description: "管理工作区、成员与所有设置" },
  { value: "admin", label: "Admin", description: "管理成员与工作区共享配置" },
  { value: "member", label: "Member", description: "使用工作区项目、工具与预设" },
  { value: "viewer", label: "Viewer", description: "查看获授权的工作区资源" },
];

function canManageTarget(actorRole: ConsoleOrganizationRole, targetRole: ConsoleOrganizationRole): boolean {
  return actorRole === "owner" || (actorRole === "admin" && (targetRole === "member" || targetRole === "viewer"));
}

function assignableRoles(actorRole: ConsoleOrganizationRole): Array<{ value: ConsoleOrganizationRole; label: string }> {
  return roles
    .filter((role) => actorRole === "owner" || role.value === "member" || role.value === "viewer")
    .map((role) => ({ value: role.value, label: role.label }));
}

function formatDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "--";
  return new Intl.DateTimeFormat("zh-CN", { year: "numeric", month: "short", day: "numeric" }).format(date);
}

function statusText(status: ConsoleTeamMember["status"]): string {
  if (status === "active") return "正常";
  if (status === "pending") return "待激活";
  return "已停用";
}

function AddMemberDialog({
  team,
  onClose,
  onAdded,
}: {
  team: ConsoleTeam;
  onClose: () => void;
  onAdded: () => Promise<void>;
}) {
  const [identifier, setIdentifier] = useState("");
  const [role, setRole] = useState<ConsoleOrganizationRole>("member");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const roleOptions = assignableRoles(team.actorRole);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const normalized = identifier.trim();
    if (!normalized) {
      setError("请输入用户名或邮箱。");
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      await addConsoleTeamMember({ organizationId: team.organization.id, identifier: normalized, role });
      await onAdded();
      onClose();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "添加成员失败，请稍后重试。");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-ink-950/35 p-4" role="presentation">
      <form onSubmit={submit} className="w-full max-w-md border border-line bg-surface shadow-xl" role="dialog" aria-modal="true" aria-labelledby="add-member-title">
        <div className="flex items-center justify-between border-b border-line px-5 py-4">
          <div>
            <h2 id="add-member-title" className="text-base font-semibold text-ink-950">添加工作区成员</h2>
            <p className="mt-1 text-xs text-ink-500">仅可添加已经注册的 WinLume 用户。</p>
          </div>
          <button type="button" onClick={onClose} aria-label="关闭" className="grid h-8 w-8 place-items-center text-ink-500 hover:bg-canvas hover:text-ink-950"><X className="h-4 w-4" /></button>
        </div>
        <div className="space-y-4 px-5 py-5">
          <label className="block text-sm font-medium text-ink-800">
            用户名或邮箱
            <input autoFocus value={identifier} onChange={(event) => setIdentifier(event.target.value)} maxLength={320} placeholder="例如：alice 或 alice@example.com" className="mt-2 w-full border border-line bg-canvas px-3 py-2 text-sm outline-none focus:border-ink-500" />
          </label>
          <label className="block text-sm font-medium text-ink-800">
            角色
            <select value={role} onChange={(event) => setRole(event.target.value as ConsoleOrganizationRole)} className="mt-2 w-full border border-line bg-canvas px-3 py-2 text-sm outline-none focus:border-ink-500">
              {roleOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
            </select>
          </label>
          {error ? <p role="alert" className="text-sm text-rose-700">{error}</p> : null}
        </div>
        <div className="flex justify-end gap-2 border-t border-line px-5 py-4">
          <button type="button" onClick={onClose} className="border border-line px-3 py-2 text-sm text-ink-700 hover:bg-canvas">取消</button>
          <button disabled={submitting} className="inline-flex items-center gap-2 bg-ink-950 px-3 py-2 text-sm font-medium text-white hover:bg-ink-800 disabled:opacity-60">
            {submitting ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <UserPlus className="h-4 w-4" />}
            添加成员
          </button>
        </div>
      </form>
    </div>
  );
}

export default function ConsoleTeamContent() {
  const [team, setTeam] = useState<ConsoleTeam | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showAdd, setShowAdd] = useState(false);
  const [busyUserId, setBusyUserId] = useState<string | null>(null);

  const load = useCallback(async (organizationId?: string | null) => {
    setLoading(true);
    setError(null);
    try {
      setTeam(await getConsoleTeam(organizationId));
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "无法加载工作区成员。");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => { void load(); }, 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  async function changeRole(member: ConsoleTeamMember, role: ConsoleOrganizationRole) {
    if (!team || role === member.role) return;
    setBusyUserId(member.userId);
    setError(null);
    try {
      await updateConsoleTeamMember(member.userId, { organizationId: team.organization.id, role });
      await load(team.organization.id);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "更新成员角色失败，请稍后重试。");
    } finally {
      setBusyUserId(null);
    }
  }

  async function remove(member: ConsoleTeamMember) {
    if (!team) return;
    if (!window.confirm(`确定要将 ${member.displayName} 移出工作区吗？`)) return;
    setBusyUserId(member.userId);
    setError(null);
    try {
      await removeConsoleTeamMember(member.userId, team.organization.id);
      await load(team.organization.id);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "移除成员失败，请稍后重试。");
    } finally {
      setBusyUserId(null);
    }
  }

  const ownerCount = team?.members.filter((member) => member.role === "owner").length ?? 0;

  return (
    <ConsolePage
      title="工作区成员"
      description="工作区定义资源协作边界；API 额度仍保留在每位成员的个人钱包中。"
      actions={team?.canManageMembers ? <button type="button" onClick={() => setShowAdd(true)} className="inline-flex items-center gap-2 bg-ink-950 px-3 py-2 text-sm font-medium text-white hover:bg-ink-800"><Plus className="h-4 w-4" />添加成员</button> : undefined}
    >
      {error ? <p role="alert" className="mb-4 border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">{error}</p> : null}
      {loading ? <div className="flex min-h-48 items-center justify-center gap-2 text-sm text-ink-500"><LoaderCircle className="h-4 w-4 animate-spin" />正在加载成员…</div> : null}
      {!loading && !team && !error ? <ConsoleEmptyState title="工作区暂不可用" description="当前账户还没有可访问的工作区。" /> : null}
      {!loading && team ? <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_19rem]">
        <section className="border border-line bg-surface">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-5 py-4">
            <div className="flex items-center gap-2"><UsersRound className="h-4 w-4 text-ink-600" /><div><h2 className="text-sm font-semibold text-ink-950">{team.organization.name}</h2><p className="mt-0.5 text-xs text-ink-500">{team.members.length} 位成员 · 你的角色：{roles.find((role) => role.value === team.actorRole)?.label}</p></div></div>
            {team.organizations.length > 1 ? <select aria-label="选择工作区" value={team.organization.id} onChange={(event) => void load(event.target.value)} className="border border-line bg-canvas px-2 py-1.5 text-sm text-ink-700 outline-none focus:border-ink-500">{team.organizations.map((organization) => <option key={organization.id} value={organization.id}>{organization.name}</option>)}</select> : null}
          </div>
          {!team.canManageMembers ? <div className="border-b border-amber-200 bg-amber-50 px-5 py-3 text-sm text-amber-900">你可以查看成员，但没有修改工作区成员的权限。</div> : null}
          <div className="overflow-x-auto">
            <table className="w-full min-w-[680px] text-left text-sm">
              <thead className="border-b border-line bg-canvas text-xs font-medium text-ink-500"><tr><th className="px-5 py-3">成员</th><th className="px-4 py-3">状态</th><th className="px-4 py-3">角色</th><th className="px-4 py-3">加入时间</th><th className="w-12 px-4 py-3"><span className="sr-only">操作</span></th></tr></thead>
              <tbody className="divide-y divide-line">
                {team.members.map((member) => {
                  const canManage = team.canManageMembers && canManageTarget(team.actorRole, member.role);
                  const protectedOwner = member.role === "owner" && ownerCount <= 1;
                  const busy = busyUserId === member.userId;
                  return <tr key={member.id} className="text-ink-700">
                    <td className="px-5 py-3"><div className="flex min-w-0 items-center gap-3"><span className="grid h-8 w-8 shrink-0 place-items-center bg-primary-100 text-xs font-semibold text-primary-700">{member.displayName.slice(0, 1).toUpperCase()}</span><div className="min-w-0"><div className="flex items-center gap-2"><p className="truncate font-medium text-ink-950">{member.displayName}</p>{member.isCurrentUser ? <span className="border border-primary-200 bg-primary-50 px-1.5 py-0.5 text-[10px] font-medium text-primary-700">你</span> : null}</div><p className="truncate text-xs text-ink-500">{member.email || member.username}</p></div></div></td>
                    <td className="px-4 py-3"><span className={member.status === "active" ? "text-emerald-700" : "text-amber-700"}>{member.status === "active" ? <Check className="mr-1 inline h-3.5 w-3.5" /> : null}{statusText(member.status)}</span></td>
                    <td className="px-4 py-3"><select aria-label={`${member.displayName} 的角色`} disabled={!canManage || protectedOwner || busy} value={member.role} onChange={(event) => void changeRole(member, event.target.value as ConsoleOrganizationRole)} className="border border-line bg-canvas px-2 py-1.5 text-sm text-ink-800 outline-none focus:border-ink-500 disabled:cursor-not-allowed disabled:opacity-60">{roles.map((role) => <option key={role.value} value={role.value} disabled={team.actorRole === "admin" && (role.value === "owner" || role.value === "admin")}>{role.label}</option>)}</select></td>
                    <td className="px-4 py-3 text-xs text-ink-500">{formatDate(member.joinedAt)}</td>
                    <td className="px-4 py-3">{canManage && !protectedOwner ? <button type="button" disabled={busy} onClick={() => void remove(member)} aria-label={`移除 ${member.displayName}`} title="移除成员" className="grid h-8 w-8 place-items-center text-ink-500 hover:bg-rose-50 hover:text-rose-700 disabled:opacity-50">{busy ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}</button> : null}</td>
                  </tr>;
                })}
              </tbody>
            </table>
          </div>
        </section>
        <aside className="border border-line bg-surface p-5"><div className="flex items-center gap-2"><ShieldCheck className="h-4 w-4 text-ink-600" /><h2 className="text-sm font-semibold text-ink-950">角色权限</h2></div><dl className="mt-4 space-y-4">{roles.map((role) => <div key={role.value}><dt className="text-sm font-medium text-ink-800">{role.label}</dt><dd className="mt-1 text-xs leading-5 text-ink-500">{role.description}</dd></div>)}</dl></aside>
      </div> : null}
      {showAdd && team ? <AddMemberDialog team={team} onClose={() => setShowAdd(false)} onAdded={() => load(team.organization.id)} /> : null}
    </ConsolePage>
  );
}
