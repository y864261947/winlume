"use client";

/**
 * @deprecated Mock “创作工作台” — no longer mounted by ModalProvider.
 * Marketing CTAs call `openExperience` → navigate to `/studio`.
 * File retained so accidental imports do not break the build; do not re-enable fake runs.
 */

import type { ExperienceSubject } from "@/lib/experience";

interface ExperienceModalProps {
  open: boolean;
  subject?: ExperienceSubject;
  onClose: () => void;
}

/** Neutralized stub: never renders a fake run UI. */
export default function ExperienceModal({ open, onClose }: ExperienceModalProps) {
  if (!open) return null;
  // Auto-close any residual open calls; real work happens in Studio.
  if (typeof window !== "undefined") {
    queueMicrotask(() => {
      onClose();
      window.location.assign("/studio");
    });
  }
  return null;
}
