"use client";

import type { Artifact } from "@/lib/agent/types";
import { ImageIcon, PanelsTopLeft } from "lucide-react";
import { textToSegments } from "@/lib/studio/mention-editor";

const UPLOAD_NAME = /^图片\d+$/;

/**
 * Render serialized prompt text with @mention chips (same visual language as
 * the contenteditable composer). Storage stays plain `@图片1` text — chips are
 * display-only.
 */
export default function MentionRichText({
  text,
  imageArtifacts = [],
  className = "",
  onOpenArtifact,
  /** User bubbles are dark navy — use high-contrast chips there. */
  tone = "onLight",
}: {
  text: string;
  /** Session image and canvas artifacts matched by their @ name. */
  imageArtifacts?: Artifact[];
  className?: string;
  onOpenArtifact?: (artifactId: string) => void;
  tone?: "onLight" | "onDark";
}) {
  const byName = new Map<string, Artifact>();
  for (const a of imageArtifacts) {
    if ((a.kind === "image" || a.kind === "canvas") && a.status !== "failed") {
      byName.set(a.name, a);
    }
  }

  const segments = textToSegments(text, (name) => {
    const art = byName.get(name);
    if (art) {
      const kind: "image" | "canvas" = art.kind === "canvas" ? "canvas" : "image";
      return {
        name: art.name,
        thumbSrc: kind === "image" ? `/api/artifacts/${art.id}/raw` : undefined,
        kind,
        artifactId: art.id,
      };
    }
    // Always render upload-style labels as chips even before artifacts load.
    if (UPLOAD_NAME.test(name)) {
      return { name };
    }
    return null;
  });

  const chipClass =
    tone === "onDark"
      ? "mention-chip mx-0.5 inline-flex max-w-[12rem] items-center gap-1.5 rounded-full border border-white/35 bg-white px-1.5 py-1 align-middle text-[12px] font-semibold leading-none text-[#0F172A] shadow-[0_1px_4px_rgba(0,0,0,0.18)]"
      : "mention-chip mx-0.5 inline-flex max-w-[12rem] items-center gap-1.5 rounded-full border border-[rgba(15,23,42,0.14)] bg-white/90 py-1 pl-1 pr-2 align-middle text-[12px] font-semibold leading-none text-[#0F172A] shadow-sm";

  const fallbackIconClass =
    tone === "onDark"
      ? "flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[#E2E8F0] text-[10px] font-bold text-[#334155]"
      : "flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[#E2E8F0] text-[10px] font-bold text-[#475569]";

  return (
    <div className={`whitespace-pre-wrap break-words ${className}`}>
      {segments.map((seg, i) => {
        if (seg.type === "text") {
          return <span key={i}>{seg.text}</span>;
        }
        const icon = seg.thumbSrc ? (
              // eslint-disable-next-line @next/next/no-img-element -- artifact raw or data URL
          <img
            src={seg.thumbSrc}
            alt=""
            className="h-5 w-5 shrink-0 rounded-full object-cover ring-1 ring-black/10"
          />
        ) : (
          <span className={fallbackIconClass}>
            {seg.kind === "canvas" ? <PanelsTopLeft className="h-3 w-3" /> : <ImageIcon className="h-3 w-3" />}
          </span>
        );
        const chip = (
          <>
            {icon}
            <span className="min-w-0 truncate tracking-tight">@{seg.name}</span>
          </>
        );
        return seg.artifactId && onOpenArtifact ? (
          <button
            key={i}
            type="button"
            className={`${chipClass} cursor-pointer hover:border-primary-300 hover:bg-primary-50`}
            title={`打开 @${seg.name}`}
            onClick={() => onOpenArtifact(seg.artifactId!)}
          >
            {chip}
          </button>
        ) : (
          <span key={i} className={chipClass} title={`@${seg.name}`}>
            {chip}
          </span>
        );
      })}
    </div>
  );
}
