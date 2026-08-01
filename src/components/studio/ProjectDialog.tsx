"use client";

import { useState, type FormEvent } from "react";
import { FolderKanban, LoaderCircle } from "lucide-react";
import Modal, { ModalCloseButton } from "@/components/Modal";
import { createProject, StudioApiError } from "@/lib/studio/api";
import type { Project } from "@/lib/agent/types";

/** Small, reusable project creation surface used by the Studio sidebar. */
export default function ProjectDialog({
  open,
  onClose,
  onCreated,
}: {
  open: boolean;
  onClose: () => void;
  onCreated: (project: Project) => void;
}) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [instructions, setInstructions] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  function reset() {
    setName("");
    setDescription("");
    setInstructions("");
    setError(null);
    setPending(false);
  }

  function close() {
    reset();
    onClose();
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const trimmedName = name.trim();
    if (!trimmedName || pending) return;
    setPending(true);
    setError(null);
    try {
      const project = await createProject({
        name: trimmedName,
        description: description.trim() || undefined,
        instructions: instructions.trim() || undefined,
      });
      onCreated(project);
      close();
    } catch (err) {
      setError(
        err instanceof StudioApiError || err instanceof Error
          ? err.message
          : "创建项目失败",
      );
    } finally {
      setPending(false);
    }
  }

  return (
    <Modal open={open} onClose={close} label="创建项目">
      <form
        onSubmit={submit}
        className="studio-glass-soft overflow-hidden rounded-[18px] border border-white/70 shadow-[0_24px_70px_-28px_rgba(36,30,54,0.45)]"
      >
        <div className="flex items-start gap-3 border-b border-white/60 px-5 py-4">
          <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-[11px] bg-[rgba(15,23,42,0.1)] text-[#0F172A]">
            <FolderKanban className="h-4.5 w-4.5" strokeWidth={1.8} />
          </span>
          <div className="min-w-0 flex-1">
            <h2 className="text-base font-semibold text-[#241E36]">创建项目</h2>
            <p className="mt-0.5 text-xs leading-5 text-[#8A8298]">
              把相关对话、作品和工作规则放在同一个空间。
            </p>
          </div>
          <ModalCloseButton onClose={close} />
        </div>

        <div className="space-y-4 px-5 py-5">
          <label className="block">
            <span className="mb-1.5 block text-xs font-medium text-[#615A73]">
              项目名称
            </span>
            <input
              autoFocus
              value={name}
              onChange={(event) => setName(event.target.value)}
              maxLength={80}
              required
              placeholder="例如：品牌官网重构"
              className="h-10 w-full rounded-[10px] border border-white/80 bg-white/70 px-3 text-sm text-[#241E36] outline-none transition placeholder:text-[#AAA2B2] focus:border-[rgba(15,23,42,0.32)] focus:bg-white"
            />
          </label>
          <label className="block">
            <span className="mb-1.5 block text-xs font-medium text-[#615A73]">
              简介 <span className="font-normal text-[#AAA2B2]">可选</span>
            </span>
            <input
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              maxLength={240}
              placeholder="一句话说明这个项目"
              className="h-10 w-full rounded-[10px] border border-white/80 bg-white/70 px-3 text-sm text-[#241E36] outline-none transition placeholder:text-[#AAA2B2] focus:border-[rgba(15,23,42,0.32)] focus:bg-white"
            />
          </label>
          <label className="block">
            <span className="mb-1.5 block text-xs font-medium text-[#615A73]">
              工作规则 <span className="font-normal text-[#AAA2B2]">可选</span>
            </span>
            <textarea
              value={instructions}
              onChange={(event) => setInstructions(event.target.value)}
              maxLength={4000}
              rows={4}
              placeholder="告诉 Agent 这个项目需要遵守的背景、语气或技术约束"
              className="w-full resize-y rounded-[10px] border border-white/80 bg-white/70 px-3 py-2.5 text-sm leading-5 text-[#241E36] outline-none transition placeholder:text-[#AAA2B2] focus:border-[rgba(15,23,42,0.32)] focus:bg-white"
            />
          </label>
          {error ? (
            <p role="alert" className="text-xs leading-5 text-[#EF4770]">
              {error}
            </p>
          ) : null}
        </div>

        <div className="flex justify-end gap-2 border-t border-white/60 bg-white/20 px-5 py-3">
          <button
            type="button"
            onClick={close}
            className="rounded-[10px] border border-white/80 bg-white/50 px-3.5 py-2 text-sm text-[#615A73] transition hover:bg-white"
          >
            取消
          </button>
          <button
            type="submit"
            disabled={pending || !name.trim()}
            className="studio-send-btn inline-flex min-w-[92px] items-center justify-center gap-1.5 rounded-[10px] px-3.5 py-2 text-sm font-medium text-white transition disabled:cursor-not-allowed disabled:opacity-50"
          >
            {pending ? <LoaderCircle className="h-3.5 w-3.5 animate-spin" /> : null}
            {pending ? "创建中" : "创建项目"}
          </button>
        </div>
      </form>
    </Modal>
  );
}
