"use client";

import { useEffect, useMemo, useState, type TransitionEventHandler } from "react";
import { ArrowLeft, ArrowRight, RotateCcw } from "lucide-react";
import {
  buildAssessmentReport,
  type AssessmentAnswers,
} from "./assessment";

const STORAGE_KEY = "reizo:enterprise-assessment-v2";

type QuestionId = keyof AssessmentAnswers;

type Question = {
  id: QuestionId;
  label: string;
  question: string;
  options: { label: string; value: AssessmentAnswers[QuestionId] }[];
};

const questions: Question[] = [
  {
    id: "outcome",
    label: "业务目标",
    question: "如果只能优先改善一个业务结果，您最希望 AI 帮您解决什么？",
    options: [
      { value: "sales_growth", label: "获取更多线索并提升销售转化" },
      { value: "service_quality", label: "降低客服压力并提升响应质量" },
      { value: "operations", label: "减少重复人工流程和内部等待" },
      { value: "clarity", label: "先判断 AI 应该从哪里开始" },
    ],
  },
  {
    id: "owner",
    label: "牵头团队",
    question: "这个问题主要发生在哪个部门或流程里？",
    options: [
      { value: "sales", label: "销售 / 市场 / 线索跟进" },
      { value: "service", label: "客服 / 客户维护 / 售后支持" },
      { value: "operations", label: "运营 / 财务 / 后台流程" },
      { value: "leadership", label: "管理层 / 战略规划 / 组织共识" },
    ],
  },
  {
    id: "workflow",
    label: "当前流程",
    question: "团队现在最花时间、最容易卡住的工作方式是什么？",
    options: [
      { value: "manual_follow_up", label: "人工重复跟进、分配或整理信息" },
      { value: "document_review", label: "文档审核、提取、校验或归档" },
      { value: "cross_team", label: "跨团队交接、状态同步和异常处理" },
      { value: "unknown", label: "还没有明确，需要先一起梳理" },
    ],
  },
  {
    id: "data",
    label: "数据基础",
    question: "哪个信息来源最可能成为第一个场景的上下文？",
    options: [
      { value: "crm", label: "CRM、线索和客户对话记录" },
      { value: "knowledge_base", label: "文档、知识库、产品资料和表格" },
      { value: "business_system", label: "ERP、业务系统或内部数据库" },
      { value: "not_ready", label: "暂未准备好，需要先盘点数据" },
    ],
  },
  {
    id: "maturity",
    label: "AI 成熟度",
    question: "团队目前处于哪一个 AI 实践阶段？",
    options: [
      { value: "exploring", label: "刚开始探索，还没有统一方向" },
      { value: "piloting", label: "已做过试点，但尚未进入稳定流程" },
      { value: "integrated", label: "部分工具已经接入日常工作" },
      { value: "scaling", label: "正在扩大使用范围并建立治理" },
    ],
  },
  {
    id: "constraint",
    label: "核心约束",
    question: "推进时最需要优先处理的约束是什么？",
    options: [
      { value: "data_quality", label: "数据质量、字段一致性或数据孤岛" },
      { value: "security", label: "安全、合规、权限或审计要求" },
      { value: "capacity", label: "团队投入、工程资源或维护能力" },
      { value: "alignment", label: "目标对齐、预算或跨团队共识" },
    ],
  },
  {
    id: "urgency",
    label: "预期节奏",
    question: "您希望在什么节奏内看到第一个明确结果？",
    options: [
      { value: "this_month", label: "本月内开始验证并看到初步结果" },
      { value: "this_quarter", label: "本季度内形成可运行的试点" },
      { value: "this_year", label: "本年度内逐步推进到稳定应用" },
      { value: "research", label: "先研究方向，再决定投入节奏" },
    ],
  },
  {
    id: "delivery",
    label: "交付偏好",
    question: "对您最有价值的第一个交付物会是什么？",
    options: [
      { value: "workflow", label: "一个端到端的可观测业务工作流" },
      { value: "copilot", label: "一个支持团队协作的业务助手" },
      { value: "knowledge", label: "一个可追溯的企业知识服务" },
      { value: "roadmap", label: "一份可执行的 AI 路线图与试点章程" },
    ],
  },
];

type AssessmentDraft = {
  answers: Partial<AssessmentAnswers>;
  step: number;
};

function isComplete(answers: Partial<AssessmentAnswers>): answers is AssessmentAnswers {
  return questions.every((question) => Boolean(answers[question.id]));
}

function QuestionCard({
  question,
  step,
  className,
  ariaHidden,
  onChoose,
  onPrevious,
  onTransitionEnd,
}: {
  question: Question;
  step: number;
  className: string;
  ariaHidden?: boolean;
  onChoose: (value: string) => void;
  onPrevious: () => void;
  onTransitionEnd?: TransitionEventHandler<HTMLDivElement>;
}) {
  return (
    <div className={className} aria-hidden={ariaHidden || undefined} onTransitionEnd={onTransitionEnd}>
      <div className="zen-question-meta"><span>AI 动态问诊 · 第 {step + 1} 题</span><b>已完成 {step} 个诊断信号</b></div>
      <div className="zen-question-progress"><i style={{ width: `${((step + 1) / questions.length) * 100}%` }} /></div>
      <p className="zen-label">{question.label}</p>
      <h3>{question.question}</h3>
      <div className="zen-question-options">
        {question.options.map((option) => (
          <button key={option.value} type="button" onClick={() => onChoose(option.value)}>
            <span>{option.label}</span><ArrowRight aria-hidden />
          </button>
        ))}
      </div>
      {step > 0 && <button type="button" className="zen-text-button" onClick={onPrevious}><ArrowLeft aria-hidden />返回上一题</button>}
    </div>
  );
}

export default function EnterpriseAssessment() {
  const [draft, setDraft] = useState<AssessmentDraft>({ answers: {}, step: 0 });
  const [hydrated, setHydrated] = useState(false);
  const [priorQuestion, setPriorQuestion] = useState<Question | null>(null);
  const [incomingQuestionActive, setIncomingQuestionActive] = useState(true);
  const complete = isComplete(draft.answers);
  const report = useMemo(
    () => (complete ? buildAssessmentReport(draft.answers as AssessmentAnswers) : null),
    [complete, draft.answers],
  );
  const current = questions[draft.step] ?? questions[0];

  useEffect(() => {
    if (!priorQuestion) return;
    const frame = window.requestAnimationFrame(() => setIncomingQuestionActive(true));
    return () => window.cancelAnimationFrame(frame);
  }, [current.id, priorQuestion]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      try {
        const raw = window.localStorage.getItem(STORAGE_KEY);
        const saved = raw ? (JSON.parse(raw) as AssessmentDraft) : null;
        if (saved && typeof saved.step === "number" && saved.answers && saved.step >= 0 && saved.step < questions.length) {
          setDraft({ answers: saved.answers, step: saved.step });
        }
      } catch {
        // Invalid drafts are ignored to keep the public page usable.
      } finally {
        setHydrated(true);
      }
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);

  const persist = (next: AssessmentDraft) => {
    setDraft(next);
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  };

  const choose = (value: string) => {
    const answers = { ...draft.answers, [current.id]: value } as Partial<AssessmentAnswers>;
    const nextStep = Math.min(draft.step + 1, questions.length - 1);
    if (nextStep !== draft.step) {
      setPriorQuestion(current);
      setIncomingQuestionActive(false);
    }
    persist({ answers, step: nextStep });
  };

  const previous = () => {
    if (draft.step === 0) return;
    setPriorQuestion(current);
    setIncomingQuestionActive(false);
    persist({ ...draft, step: draft.step - 1 });
  };

  const restart = () => {
    window.localStorage.removeItem(STORAGE_KEY);
    setPriorQuestion(null);
    setIncomingQuestionActive(true);
    setDraft({ answers: {}, step: 0 });
  };

  const clearPriorQuestion: TransitionEventHandler<HTMLDivElement> = (event) => {
    if (event.target === event.currentTarget && event.propertyName === "opacity") setPriorQuestion(null);
  };

  return (
    <section id="assessment" className="zen-assessment" aria-labelledby="assessment-title">
      <div className="zen-assessment-intro" data-zen-motion>
        <p className="zen-label">STRATEGIC CONSULTING</p>
        <h2 id="assessment-title">AI 咨询导入指南<br />看清方向，再谈投入。</h2>
        <p>三步问诊，找到你的 AI 破局切入点。完成评估后，您将获得一份专属诊断报告，包含行业基准对比与推荐行动方案。</p>
        <ol aria-label="问诊流程"><li><span>1</span>动态问诊</li><li><span>2</span>生成报告</li><li><span>3</span>规划下一步</li></ol>
      </div>

      <div className="zen-assessment-panel" aria-live="polite" data-zen-motion="right" data-zen-motion-delay="80">
        {!hydrated ? <p className="zen-assessment-loading">正在准备诊断…</p> : report ? (
          <section className="zen-report zen-stage-enter" aria-labelledby="assessment-report-title">
            <div className="zen-report-head"><span>AI READINESS REPORT</span><output aria-label="AI 准备度">{report.readiness}%</output></div>
            <p className="zen-label">REPORT PREVIEW</p>
            <h3 id="assessment-report-title">您的 AI 落地建议</h3>
            <article><h4>优先场景</h4><p>{report.recommendedScenario}</p></article>
            <div className="zen-report-columns">
              <article><h4>当前约束</h4><ul>{report.constraints.map((item) => <li key={item}>{item}</li>)}</ul></article>
              <article><h4>需要准备</h4><ul>{report.requiredInputs.map((item) => <li key={item}>{item}</li>)}</ul></article>
            </div>
            <article><h4>90 天推进建议</h4><ol>{report.phases.map((item) => <li key={item}>{item}</li>)}</ol></article>
            <details><summary>查看诊断信号</summary><ul>{report.recap.map((item) => <li key={item}>{item}</li>)}</ul></details>
            <button type="button" className="zen-text-button" onClick={restart}><RotateCcw aria-hidden />重新问诊</button>
          </section>
        ) : (
          <div className="zen-swap-stage zen-question-swap">
            {priorQuestion && <QuestionCard key={priorQuestion.id} question={priorQuestion} step={questions.findIndex((question) => question.id === priorQuestion.id)} className="zen-question zen-swap-layer zen-swap-layer--outgoing" ariaHidden onChoose={choose} onPrevious={previous} />}
            <QuestionCard key={current.id} question={current} step={draft.step} className={`zen-question zen-swap-layer zen-swap-layer--incoming${incomingQuestionActive ? " is-active" : ""}`} onChoose={choose} onPrevious={previous} onTransitionEnd={clearPriorQuestion} />
          </div>
        )}
      </div>
    </section>
  );
}
