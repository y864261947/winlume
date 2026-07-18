"use client";

import { type FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { BarChart3, Check, Clock3, FileText, ImagePlus, LoaderCircle, Paperclip, PlayCircle, Sparkles, WandSparkles } from "lucide-react";
import { createPlan, loadExperienceHistory, saveExperienceHistory, submitExperience, type ExperienceRun, type ExperienceSubject } from "@/lib/experience";
import Modal, { ModalCloseButton } from "./Modal";
import LogoMark from "./LogoMark";
import { useModals } from "./providers";
import { formatBalance } from "@/lib/account";

interface ExperienceModalProps { open: boolean; subject?: ExperienceSubject; onClose: () => void; }

const tasks = [
  { label: "制作宣传内容", detail: "文案、海报与图文内容", icon: WandSparkles, tone: "bg-violet-50 text-violet-600" },
  { label: "生成调研报告", detail: "资料整理、观点归纳", icon: BarChart3, tone: "bg-sky-50 text-sky-600" },
  { label: "制作短视频", detail: "脚本、配音与分镜", icon: PlayCircle, tone: "bg-amber-50 text-amber-600" },
  { label: "处理文件", detail: "总结、提取与转换", icon: FileText, tone: "bg-teal-50 text-teal-600" },
  { label: "生成视觉素材", detail: "封面、配图与灵感图", icon: ImagePlus, tone: "bg-rose-50 text-rose-600" },
];

const getPrompt = (subject?: ExperienceSubject) => subject
  ? `请使用 ${subject.name} 帮我完成一个高质量任务，先理解目标，再给出可直接使用的结果。`
  : "描述你想完成的任务，例如：为新品写一套发布文案并提供三种风格。";

export default function ExperienceModal({ open, subject, onClose }: ExperienceModalProps) {
  return <Modal open={open} onClose={onClose} label="AI 创作工作台" align="top" size="workspace"><Workspace key={subject?.name ?? "general"} subject={subject} onClose={onClose} /></Modal>;
}

function Workspace({ subject, onClose }: { subject?: ExperienceSubject; onClose: () => void }) {
  const { account, balanceConfig, openLogin } = useModals();
  const initialPrompt = useMemo(() => getPrompt(subject), [subject]);
  const [prompt, setPrompt] = useState(initialPrompt);
  const [selected, setSelected] = useState(tasks[0].label);
  const [running, setRunning] = useState(false);
  const [latestRun, setLatestRun] = useState<ExperienceRun | null>(null);
  // 挂载后再读本地记录，避免 hydration mismatch
  const [history, setHistory] = useState<ExperienceRun[]>([]);
  const lastTemplateRef = useRef<string | null>(null);
  const plan = useMemo(() => createPlan(subject, selected), [subject, selected]);

  useEffect(() => {
    const timer = window.setTimeout(() => setHistory(loadExperienceHistory()), 0);
    return () => window.clearTimeout(timer);
  }, []);

  const selectTask = (label: string) => {
    setSelected(label);
    // 用户已手动改过内容时不覆盖，只有仍是模板文本时才跟随任务切换
    const template = `我想${label}，请给出完整、可直接使用的成果。`;
    setPrompt((current) => {
      if (!current.trim() || current === initialPrompt || current === lastTemplateRef.current) {
        lastTemplateRef.current = template;
        return template;
      }
      return current;
    });
  };

  const run = async (event?: FormEvent) => {
    event?.preventDefault();
    if (!prompt.trim() || running) return;
    setRunning(true);
    const result = await submitExperience({ subject, task: selected, prompt: prompt.trim() });
    const nextHistory = [result, ...history];
    setLatestRun(result);
    setHistory(nextHistory);
    saveExperienceHistory(nextHistory);
    setRunning(false);
  };

  return (
    <div className="max-h-[calc(100dvh-2rem)] overflow-y-auto rounded-2xl border border-line bg-canvas shadow-2xl shadow-ink-950/15">
      <div className="flex items-center justify-between border-b border-line bg-surface px-5 py-4 sm:px-6">
        <div className="flex min-w-0 items-center gap-3"><LogoMark /><div className="min-w-0"><p className="font-semibold text-ink-950">创作工作台</p><p className="truncate text-xs text-ink-400">{subject ? `已选择模型：${subject.name}` : "由 WinLume 为本次任务组合能力"}</p></div></div>
        <ModalCloseButton onClose={onClose} />
      </div>

      <div className="grid lg:grid-cols-[minmax(0,1.25fr)_minmax(300px,.82fr)]">
        <form onSubmit={run} className="border-b border-line p-5 sm:p-6 lg:border-r lg:border-b-0">
          <div className="flex flex-wrap items-end justify-between gap-3"><div><p className="text-xl font-semibold text-ink-950">今天想完成什么？</p><p className="mt-1 text-sm text-ink-500">提交前先给出任务范围与费用估算。</p></div><span className="rounded-full bg-primary-50 px-2.5 py-1 text-[11px] font-medium text-primary-600 ring-1 ring-primary-100">演示工作流</span></div>
          <div className="mt-5 rounded-xl border border-line bg-surface p-3 shadow-sm focus-within:border-primary-300 focus-within:ring-2 focus-within:ring-primary-100">
            <textarea value={prompt} onChange={(event) => setPrompt(event.target.value)} aria-label="任务描述" rows={5} placeholder="输入你想完成的任务" className="w-full resize-none bg-transparent px-1 text-sm leading-6 text-ink-800 outline-none placeholder:text-ink-300" />
            <div className="mt-2 flex items-center justify-between gap-2 border-t border-line pt-3">
              <button type="button" disabled title="文件上传将在接口接入后开放" className="inline-flex items-center gap-1.5 rounded-lg border border-line bg-surface px-2.5 py-1.5 text-xs text-ink-600 transition disabled:cursor-not-allowed disabled:opacity-50"><Paperclip className="h-3.5 w-3.5" />上传文件</button>
              <button type="submit" disabled={running || !prompt.trim()} className="inline-flex items-center gap-1.5 rounded-lg bg-primary-500 px-4 py-2 text-sm font-medium text-white shadow-sm shadow-primary-500/25 transition hover:bg-primary-600 disabled:cursor-not-allowed disabled:opacity-50">{running ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}{running ? "正在生成" : "开始生成"}</button>
            </div>
          </div>
          <div className="mt-5 grid gap-2 sm:grid-cols-2">
            {tasks.map((task) => { const Icon = task.icon; const active = task.label === selected; return <button key={task.label} type="button" onClick={() => selectTask(task.label)} className={`flex min-h-20 items-center gap-3 rounded-xl border p-3 text-left transition ${active ? "border-primary-300 bg-primary-50/60 ring-1 ring-primary-100" : "border-line bg-surface hover:border-line-strong hover:bg-canvas"}`}><span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${task.tone}`}><Icon className="h-4 w-4" /></span><span><span className="block text-sm font-medium text-ink-800">{task.label}</span><span className="mt-0.5 block text-xs text-ink-500">{task.detail}</span></span></button>; })}
          </div>
          {latestRun && <div className="mt-5 rounded-xl border border-teal-200 bg-teal-50/60 p-4"><div className="flex items-center gap-2 text-sm font-medium text-teal-700"><Check className="h-4 w-4" />本次任务已加入作品区</div><p className="mt-1 text-xs leading-5 text-teal-700/80">已生成 {latestRun.task} 草稿，演示环境未产生真实调用费用。</p></div>}
        </form>

        <aside className="bg-surface p-5 sm:p-6">
          <div className="flex items-center justify-between"><p className="font-semibold text-ink-950">本次执行</p><span className="font-mono text-xs text-ink-400">ESTIMATE</span></div>
          <div className="mt-4 rounded-xl border border-line bg-canvas p-4"><p className="text-xs text-ink-400">预计费用</p><p className="mt-1 font-mono text-2xl font-semibold text-ink-900">{plan.estimatedCost}</p><p className="mt-2 text-xs leading-5 text-ink-500">调用 {plan.productName}，将交付 {plan.outputHint}。</p></div>
          <div className="mt-3 rounded-xl border border-primary-100 bg-primary-50/50 p-4">
            <div className="flex items-center justify-between gap-3"><p className="text-xs text-primary-700">账户余额</p><span className="font-mono text-[10px] text-primary-500">GATEWAY</span></div>
            {account ? <><p className="mt-1 font-mono text-2xl font-semibold text-ink-900">{formatBalance(account.quota, balanceConfig)}</p><p className="mt-1 text-xs leading-5 text-ink-500">余额由已接入的账户网关实时换算。当前体验为预览，不会扣除余额。</p></> : <><p className="mt-1 text-sm font-medium text-ink-800">登录后查看余额</p><button type="button" onClick={() => openLogin("login")} className="mt-2 text-xs font-medium text-primary-600 transition hover:text-primary-700">去登录</button></>}
          </div>
          <ol className="mt-5 space-y-3">
            {["理解任务与目标", "编排模型与工作流", "生成并整理结果"].map((step, index) => <li key={step} className="flex gap-3"><span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary-50 font-mono text-sm font-semibold text-primary-600 ring-1 ring-primary-100">{index + 1}</span><div><p className="text-sm font-medium text-ink-800">{step}</p><p className="mt-0.5 text-xs leading-5 text-ink-500">{index === 1 ? `优先调用 ${plan.productName}` : index === 2 ? "完成后保留在本设备的演示记录" : "提炼交付目标、语气与格式"}</p></div></li>)}
          </ol>
          <div className="mt-6 border-t border-line pt-5"><div className="flex items-center justify-between"><p className="font-semibold text-ink-900">最近体验</p><Clock3 className="h-4 w-4 text-ink-400" /></div>
            {history.length === 0 ? <p className="mt-3 text-xs leading-5 text-ink-500">你还没有体验记录。开始一次任务后，会在这里保留最近 8 条本地演示记录。</p> : <div className="mt-3 space-y-2">{history.slice(0, 3).map((run) => <div key={run.id} className="rounded-lg border border-line bg-canvas px-3 py-2"><p className="truncate text-xs font-medium text-ink-800">{run.task} · {run.productName}</p><p className="mt-0.5 font-mono text-[11px] text-ink-400">{run.cost} · 已完成</p></div>)}</div>}
          </div>
        </aside>
      </div>
    </div>
  );
}
