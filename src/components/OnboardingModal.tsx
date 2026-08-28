"use client";

import { useState } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { ArrowLeft, Building2, Sparkles, UserRound } from "lucide-react";
import Modal from "./Modal";
import { industries, type Audience } from "@/data/audience";

interface OnboardingModalProps {
  open: boolean;
  /** 完成选择：写入身份与行业偏好（企业用户随后跳转到企业版） */
  onComplete: (audience: Audience, industries: string[]) => void;
  /** 遮罩点击 / ESC：仅关闭，不写入"已完成"，下次访问还会再弹 */
  onDismiss: () => void;
}

const audienceCards: {
  value: Audience;
  title: string;
  description: string;
  points: string[];
  icon: typeof Sparkles;
}[] = [
  {
    value: "personal",
    title: "个人用户",
    description: "开箱即用，即点即体验全站 AI 应用与模型",
    points: ["即点即用", "按量付费", "无需部署"],
    icon: UserRound,
  },
  {
    value: "business",
    title: "企业或团队",
    description: "API 集成、团队协作与行业案例参考",
    points: ["全模型 API", "统一账户计费", "行业案例"],
    icon: Building2,
  },
];

export default function OnboardingModal({ open, onComplete, onDismiss }: OnboardingModalProps) {
  return (
    <Modal open={open} onClose={onDismiss} label="选择使用身份" size="onboarding">
      {/* Modal 关闭时卸载内部组件，步骤与选择状态自动重置 */}
      <AudiencePanel onComplete={onComplete} />
    </Modal>
  );
}

function AudiencePanel({ onComplete }: { onComplete: (audience: Audience, industries: string[]) => void }) {
  const router = useRouter();
  const [step, setStep] = useState<1 | 2>(1);
  const [selected, setSelected] = useState<string[]>([]);

  const finish = (audience: Audience, picked: string[]) => {
    onComplete(audience, picked);
    if (audience === "business") router.push("/business");
  };

  const toggleIndustry = (industry: string) => {
    setSelected((current) => {
      if (current.includes(industry)) return current.filter((item) => item !== industry);
      if (current.length === 3) return current;
      return [...current, industry];
    });
  };

  return (
    <div className="overflow-hidden rounded-2xl border border-line bg-canvas shadow-2xl shadow-ink-950/15">
      <div className="border-b border-line bg-surface px-6 py-6 sm:px-8">
        <div className="flex items-center gap-2">
          <Image src="/brand/reizo-mark.png" alt="" width={28} height={28} priority />
          <span className="font-mono text-xs font-semibold uppercase tracking-widest text-ink-500">
            Reizo
          </span>
        </div>
        {step === 1 ? (
          <>
            <h2 className="mt-3 text-2xl font-semibold text-ink-950">欢迎使用 Reizo</h2>
            <p className="mt-2 text-sm text-ink-500">
              请选择你的使用身份，我们将为你展示更合适的布局与内容。
            </p>
          </>
        ) : (
          <>
            <h2 className="mt-3 text-2xl font-semibold text-ink-950">你所在的行业是？</h2>
            <p className="mt-2 text-sm text-ink-500">
              选择 1 至 3 项，企业版案例将优先展示你关注的行业。
            </p>
          </>
        )}
      </div>

      {step === 1 ? (
        <div className="grid gap-3 p-5 sm:grid-cols-2 sm:p-8">
          {audienceCards.map((card) => {
            const Icon = card.icon;
            return (
              <button
                key={card.value}
                type="button"
                onClick={() => {
                  if (card.value === "personal") finish("personal", []);
                  else setStep(2);
                }}
                className="spectrum-card group flex flex-col rounded-xl border border-line bg-surface p-6 text-left transition hover:-translate-y-0.5 hover:border-primary-200 hover:shadow-lg hover:shadow-ink-950/5"
              >
                <span className="flex h-11 w-11 items-center justify-center rounded-lg bg-primary-50 text-primary-500 ring-1 ring-line transition group-hover:bg-primary-500 group-hover:text-white">
                  <Icon className="h-5 w-5" />
                </span>
                <span className="mt-4 text-base font-semibold text-ink-900">{card.title}</span>
                <span className="mt-1.5 block text-sm leading-6 text-ink-500">{card.description}</span>
                <span className="mt-4 flex flex-wrap gap-1.5">
                  {card.points.map((point) => (
                    <span key={point} className="rounded-md bg-canvas px-2 py-0.5 text-[11px] text-ink-500 ring-1 ring-line">
                      {point}
                    </span>
                  ))}
                </span>
              </button>
            );
          })}
        </div>
      ) : (
        <div className="grid gap-3 p-5 sm:grid-cols-2 sm:p-8 lg:grid-cols-3">
          {industries.map((industry) => {
            const Icon = industry.icon;
            const active = selected.includes(industry.name);
            const unavailable = !active && selected.length >= 3;
            return (
              <button
                key={industry.name}
                type="button"
                aria-pressed={active}
                onClick={() => toggleIndustry(industry.name)}
                className={`flex min-h-20 items-center gap-3 rounded-xl border p-4 text-left transition ${
                  active
                    ? "border-primary-300 bg-primary-50/60 ring-2 ring-primary-100"
                    : unavailable
                      ? "cursor-not-allowed border-line bg-canvas opacity-50"
                      : "border-line bg-surface hover:border-primary-200 hover:bg-primary-50/30"
                }`}
              >
                <span
                  className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg transition ${
                    active
                      ? "bg-primary-500 text-white"
                      : "bg-canvas text-primary-500 ring-1 ring-line"
                  }`}
                >
                  <Icon className="h-5 w-5" />
                </span>
                <span className="text-sm font-semibold text-ink-800">{industry.name}</span>
              </button>
            );
          })}
        </div>
      )}

      <div className="border-t border-line bg-surface px-6 py-4 sm:flex sm:items-center sm:justify-between sm:px-8">
        <p className="text-xs leading-5 text-ink-400">
          仅用于展示偏好，不收集姓名、联系方式或账号信息。
        </p>
        {step === 1 ? (
          <div className="mt-4 flex items-center justify-end sm:mt-0">
            <button
              type="button"
              onClick={() => finish("personal", [])}
              className="text-sm font-medium text-ink-500 transition hover:text-ink-800"
            >
              暂不选择，随便看看
            </button>
          </div>
        ) : (
          <div className="mt-4 flex items-center justify-between gap-4 sm:mt-0 sm:justify-end">
            <button
              type="button"
              onClick={() => setStep(1)}
              aria-label="返回上一步"
              className="flex h-9 w-9 items-center justify-center rounded-lg border border-line text-ink-500 transition hover:bg-canvas hover:text-ink-800"
            >
              <ArrowLeft className="h-4 w-4" />
            </button>
            <span className="text-sm text-ink-500">
              已选：{" "}
              <strong className="font-mono font-semibold text-primary-600">
                {selected.length}
              </strong>
              /3
            </span>
            <button
              type="button"
              onClick={() => finish("business", [])}
              className="text-sm font-medium text-ink-500 transition hover:text-ink-800"
            >
              跳过
            </button>
            <button
              type="button"
              onClick={() => finish("business", selected)}
              disabled={selected.length === 0}
              className="rounded-lg bg-primary-500 px-4 py-2.5 text-sm font-medium text-white shadow-sm shadow-primary-500/25 transition hover:bg-primary-600 disabled:cursor-not-allowed disabled:opacity-45"
            >
              进入企业版
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
