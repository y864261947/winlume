import type { ProductType } from "@/data/products";

export type ExperienceStatus = "running" | "completed";

/** 体验目标：可以是目录中的产品，也可以只是模型广场里的一个模型名。 */
export interface ExperienceSubject {
  name: string;
  type?: ProductType;
}

export interface ExperienceRun {
  id: string;
  productName: string;
  task: string;
  prompt: string;
  cost: string;
  status: ExperienceStatus;
  createdAt: string;
}

export interface ExperiencePlan {
  estimatedCost: string;
  productName: string;
  outputHint: string;
}

const storageKey = "winlume:experience-history-v1";

export function createPlan(subject: ExperienceSubject | undefined, task: string): ExperiencePlan {
  const base = subject?.type === "应用" ? "$0.03 - $0.08" : "$0.01 - $0.04";
  return {
    estimatedCost: base,
    productName: subject?.name ?? "WinLume 智能编排",
    outputHint: task === "制作短视频" ? "脚本、分镜与素材建议" : "可编辑的结果草稿",
  };
}

export function loadExperienceHistory(): ExperienceRun[] {
  if (typeof window === "undefined") return [];
  try {
    const stored = window.localStorage.getItem(storageKey);
    return stored ? (JSON.parse(stored) as ExperienceRun[]) : [];
  } catch { return []; }
}

export function saveExperienceHistory(history: ExperienceRun[]) {
  window.localStorage.setItem(storageKey, JSON.stringify(history.slice(0, 8)));
}

export async function submitExperience(input: { subject?: ExperienceSubject; task: string; prompt: string }): Promise<ExperienceRun> {
  const plan = createPlan(input.subject, input.task);
  await new Promise((resolve) => window.setTimeout(resolve, 750));
  return {
    id: `run-${Date.now()}`,
    productName: plan.productName,
    task: input.task,
    prompt: input.prompt,
    cost: plan.estimatedCost,
    status: "completed",
    createdAt: new Date().toISOString(),
  };
}