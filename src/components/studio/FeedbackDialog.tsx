"use client";

import { useCallback, useEffect, useState, type ChangeEvent } from "react";
import { Bug, ImagePlus, Lightbulb, LoaderCircle, MessageSquareWarning, X } from "lucide-react";
import Modal, { ModalCloseButton } from "@/components/Modal";

type FeedbackType = "bug" | "feature";
type FeedbackStatus = "open" | "resolved";

type FeedbackReport = {
  id: string;
  type: FeedbackType;
  description: string;
  screenshots: string[];
  status: FeedbackStatus;
  createdAt: string;
};

const MAX_DESCRIPTION_LENGTH = 5000;
const MAX_SCREENSHOTS = 5;
const MAX_SCREENSHOT_BYTES = 700_000;

/** A crashed/empty server response has no body to parse — surface a readable message instead of the raw parse error. */
async function parseJsonResponse<T>(response: Response): Promise<T> {
  const text = await response.text();
  if (!text) throw new Error(`服务暂时不可用（${response.status}），请稍后重试`);
  try {
    return JSON.parse(text) as T;
  } catch {
    throw new Error(`服务返回异常（${response.status}），请稍后重试`);
  }
}

function readImageAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    if (!file.type.startsWith("image/")) {
      reject(new Error("请上传图片文件"));
      return;
    }
    if (file.size > MAX_SCREENSHOT_BYTES) {
      reject(new Error("单张截图请控制在 700KB 以内"));
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === "string") resolve(reader.result);
      else reject(new Error("读取图片失败"));
    };
    reader.onerror = () => reject(new Error("读取图片失败"));
    reader.readAsDataURL(file);
  });
}

export default function FeedbackDialog({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const [tab, setTab] = useState<"submit" | "mine">("submit");
  const [type, setType] = useState<FeedbackType>("bug");
  const [description, setDescription] = useState("");
  const [screenshots, setScreenshots] = useState<string[]>([]);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const [myReports, setMyReports] = useState<FeedbackReport[]>([]);
  const [myReportsLoading, setMyReportsLoading] = useState(false);
  const [myReportsError, setMyReportsError] = useState<string | null>(null);

  const loadMyReports = useCallback(async () => {
    setMyReportsLoading(true);
    setMyReportsError(null);
    try {
      const response = await fetch("/api/feedback", { credentials: "same-origin" });
      const body = await parseJsonResponse<{ reports?: FeedbackReport[]; error?: string }>(response);
      if (!response.ok) throw new Error(body.error || "加载反馈失败");
      setMyReports(body.reports ?? []);
    } catch (reason) {
      setMyReportsError(reason instanceof Error ? reason.message : "加载反馈失败");
    } finally {
      setMyReportsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!open || tab !== "mine") return;
    const timer = window.setTimeout(() => {
      void loadMyReports();
    }, 0);
    return () => window.clearTimeout(timer);
  }, [open, tab, loadMyReports]);

  function reset() {
    setTab("submit");
    setType("bug");
    setDescription("");
    setScreenshots([]);
    setError(null);
    setNotice(null);
    setPending(false);
  }

  function close() {
    reset();
    onClose();
  }

  async function onScreenshotChange(event: ChangeEvent<HTMLInputElement>) {
    const files = event.target.files;
    event.target.value = "";
    if (!files || !files.length) return;
    setError(null);
    const remaining = MAX_SCREENSHOTS - screenshots.length;
    if (remaining <= 0) {
      setError(`最多上传 ${MAX_SCREENSHOTS} 张截图`);
      return;
    }
    const picked = Array.from(files).slice(0, remaining);
    try {
      const dataUrls = await Promise.all(picked.map(readImageAsDataUrl));
      setScreenshots((current) => [...current, ...dataUrls]);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "读取截图失败");
    }
  }

  function removeScreenshot(index: number) {
    setScreenshots((current) => current.filter((_, i) => i !== index));
  }

  async function submit() {
    const trimmed = description.trim();
    if (!trimmed || pending) {
      if (!trimmed) setError("请描述您遇到的问题");
      return;
    }
    setPending(true);
    setError(null);
    setNotice(null);
    try {
      const response = await fetch("/api/feedback", {
        method: "POST",
        headers: { "content-type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({ type, description: trimmed, screenshots }),
      });
      const body = await parseJsonResponse<{ error?: string }>(response);
      if (!response.ok) throw new Error(body.error || "提交反馈失败");
      setNotice("反馈已提交，感谢您的帮助！");
      setDescription("");
      setScreenshots([]);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "提交反馈失败");
    } finally {
      setPending(false);
    }
  }

  return (
    <Modal open={open} onClose={close} label="反馈">
      <div className="studio-feedback-dialog overflow-hidden rounded-[22px] bg-white shadow-[0_28px_80px_-24px_rgba(36,30,54,0.4)]">
        <div className="flex items-start gap-3 border-b border-[#ece7df] px-5 py-4">
          <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-[11px] bg-[#f3efe8] text-[#0F172A]">
            <MessageSquareWarning className="h-4.5 w-4.5" strokeWidth={1.8} />
          </span>
          <div className="min-w-0 flex-1">
            <h2 className="text-base font-semibold text-[#241E36]">反馈</h2>
            <p className="mt-0.5 text-xs leading-5 text-[#8A8298]">报告问题或提出功能建议</p>
          </div>
          <ModalCloseButton onClose={close} />
        </div>

        <div className="flex gap-1 border-b border-[#ece7df] px-5 pt-3">
          {(
            [
              { id: "submit" as const, label: "提交反馈" },
              { id: "mine" as const, label: "我的反馈" },
            ]
          ).map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => setTab(item.id)}
              className={`studio-feedback-tab rounded-t-[10px] px-3 py-2 text-sm font-medium transition ${
                tab === item.id
                  ? "studio-feedback-tab-active text-[#241E36]"
                  : "text-[#8A8298] hover:text-[#615A73]"
              }`}
            >
              {item.label}
            </button>
          ))}
        </div>

        {tab === "submit" ? (
          <div className="space-y-4 px-5 py-5">
            <div className="grid grid-cols-2 gap-2.5">
              <button
                type="button"
                onClick={() => setType("bug")}
                className={`studio-feedback-type-card flex items-start gap-2.5 rounded-[12px] border px-3 py-3 text-left transition ${
                  type === "bug"
                    ? "studio-feedback-type-card-active"
                    : "border-[#ece7df]"
                }`}
              >
                <Bug className="mt-0.5 h-4 w-4 shrink-0 text-[#0F172A]" strokeWidth={1.8} />
                <span>
                  <span className="block text-sm font-medium text-[#241E36]">Bug 报告</span>
                  <span className="block text-xs text-[#8A8298]">报告问题或错误</span>
                </span>
              </button>
              <button
                type="button"
                onClick={() => setType("feature")}
                className={`studio-feedback-type-card flex items-start gap-2.5 rounded-[12px] border px-3 py-3 text-left transition ${
                  type === "feature"
                    ? "studio-feedback-type-card-active"
                    : "border-[#ece7df]"
                }`}
              >
                <Lightbulb className="mt-0.5 h-4 w-4 shrink-0 text-[#0F172A]" strokeWidth={1.8} />
                <span>
                  <span className="block text-sm font-medium text-[#241E36]">功能建议</span>
                  <span className="block text-xs text-[#8A8298]">提出新功能想法</span>
                </span>
              </button>
            </div>

            <label className="block">
              <span className="mb-1.5 flex items-center justify-between text-xs font-medium text-[#615A73]">
                <span>详细描述</span>
                <span className="font-normal text-[#AAA2B2]">
                  {description.length}/{MAX_DESCRIPTION_LENGTH}
                </span>
              </span>
              <textarea
                value={description}
                onChange={(event) => setDescription(event.target.value.slice(0, MAX_DESCRIPTION_LENGTH))}
                rows={5}
                placeholder="请描述您遇到的问题，包括复现步骤…"
                className="studio-feedback-textarea w-full resize-y rounded-[10px] border border-[#ece7df] bg-[#faf8f5] px-3 py-2.5 text-sm leading-5 text-[#241E36] outline-none transition placeholder:text-[#AAA2B2]"
              />
            </label>

            <div>
              <span className="mb-1.5 block text-xs font-medium text-[#615A73]">
                截图 ({screenshots.length}/{MAX_SCREENSHOTS})
              </span>
              <div className="flex flex-wrap gap-2">
                {screenshots.map((shot, index) => (
                  <div
                    key={index}
                    className="group relative h-16 w-16 shrink-0 overflow-hidden rounded-[10px] border border-[#ece7df]"
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={shot} alt="" className="h-full w-full object-cover" />
                    <button
                      type="button"
                      onClick={() => removeScreenshot(index)}
                      aria-label="移除截图"
                      className="absolute right-0.5 top-0.5 flex h-5 w-5 items-center justify-center rounded-full bg-black/60 text-white opacity-0 transition group-hover:opacity-100"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </div>
                ))}
                {screenshots.length < MAX_SCREENSHOTS ? (
                  <label className="studio-feedback-upload-zone flex h-16 w-16 shrink-0 cursor-pointer flex-col items-center justify-center gap-1 rounded-[10px] border border-dashed border-[#ece7df] text-[#AAA2B2] transition">
                    <ImagePlus className="h-4 w-4" strokeWidth={1.8} />
                    <span className="text-[10px]">上传</span>
                    <input
                      type="file"
                      accept="image/*"
                      multiple
                      className="hidden"
                      onChange={(event) => void onScreenshotChange(event)}
                    />
                  </label>
                ) : null}
              </div>
            </div>

            {notice ? (
              <p className="rounded-[10px] border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-800">
                {notice}
              </p>
            ) : null}
            {error ? (
              <p role="alert" className="text-xs leading-5 text-rose-600">
                {error}
              </p>
            ) : null}
          </div>
        ) : (
          <div className="max-h-[420px] space-y-2.5 overflow-y-auto px-5 py-5">
            {myReportsLoading ? (
              <p className="flex items-center gap-2 text-sm text-[#8A8298]">
                <LoaderCircle className="h-4 w-4 animate-spin" />
                加载中…
              </p>
            ) : myReportsError ? (
              <p className="text-sm text-rose-600">{myReportsError}</p>
            ) : myReports.length === 0 ? (
              <p className="text-sm text-[#8A8298]">暂无反馈记录</p>
            ) : (
              myReports.map((report) => (
                <div key={report.id} className="rounded-[12px] border border-[#ece7df] p-3">
                  <div className="flex items-center justify-between gap-2">
                    <span className="inline-flex items-center gap-1.5 text-xs font-medium text-[#241E36]">
                      {report.type === "bug" ? (
                        <Bug className="h-3.5 w-3.5" strokeWidth={1.8} />
                      ) : (
                        <Lightbulb className="h-3.5 w-3.5" strokeWidth={1.8} />
                      )}
                      {report.type === "bug" ? "Bug 报告" : "功能建议"}
                    </span>
                    <span
                      className={`rounded-full border px-2 py-0.5 text-[10px] font-medium ${
                        report.status === "resolved"
                          ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                          : "border-amber-200 bg-amber-50 text-amber-700"
                      }`}
                    >
                      {report.status === "resolved" ? "已处理" : "处理中"}
                    </span>
                  </div>
                  <p className="mt-1.5 whitespace-pre-wrap text-xs leading-5 text-[#615A73]">
                    {report.description}
                  </p>
                  {report.screenshots.length ? (
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {report.screenshots.map((shot, index) => (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          key={index}
                          src={shot}
                          alt=""
                          className="h-10 w-10 rounded-[8px] border border-[#ece7df] object-cover"
                        />
                      ))}
                    </div>
                  ) : null}
                  <p className="mt-1.5 text-[10px] text-[#AAA2B2]">
                    {new Date(report.createdAt).toLocaleString("zh-CN")}
                  </p>
                </div>
              ))
            )}
          </div>
        )}

        <div className="flex justify-end gap-2 border-t border-[#ece7df] px-5 py-3">
          <button
            type="button"
            onClick={close}
            className="studio-feedback-cancel-btn rounded-[10px] border border-[#ece7df] bg-white px-3.5 py-2 text-sm text-[#615A73] transition"
          >
            取消
          </button>
          {tab === "submit" ? (
            <button
              type="button"
              onClick={() => void submit()}
              disabled={pending || !description.trim()}
              className="studio-send-btn inline-flex min-w-[92px] items-center justify-center gap-1.5 rounded-[10px] px-3.5 py-2 text-sm font-medium text-white transition disabled:cursor-not-allowed disabled:opacity-50"
            >
              {pending ? <LoaderCircle className="h-3.5 w-3.5 animate-spin" /> : null}
              {pending ? "提交中" : "提交反馈"}
            </button>
          ) : null}
        </div>
      </div>
    </Modal>
  );
}
