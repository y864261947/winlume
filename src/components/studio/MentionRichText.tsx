"use client";

import type { Artifact } from "@/lib/agent/types";
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
  /** User bubbles are dark navy — use high-contrast chips there. */
  tone = "onLight",
}: {
  text: string;
  /** Session image artifacts used for thumbnails when name matches. */
  imageArtifacts?: Artifact[];
  className?: string;
  tone?: "onLight" | "onDark";
}) {
  const byName = new Map<string, Artifact>();
  for (const a of imageArtifacts) {
    if (a.kind === "image" && a.status !== "failed") {
      byName.set(a.name, a);
    }
  }

  const segments = textToSegments(text, (name) => {
    const art = byName.get(name);
    if (art) {
      return {
        name: art.name,
        thumbSrc: `/api/artifacts/${art.id}/raw`,
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
        return (
          <span key={i} className={chipClass} title={`@${seg.name}`}>
            {seg.thumbSrc ? (
              // eslint-disable-next-line @next/next/no-img-element -- artifact raw or data URL
              <img
                src={seg.thumbSrc}
                alt=""
                className="h-5 w-5 shrink-0 rounded-full object-cover ring-1 ring-black/10"
              />
            ) : (
              <span className={fallbackIconClass}>图</span>
            )}
            <span className="min-w-0 truncate tracking-tight">@{seg.name}</span>
          </span>
        );
      })}
    </div>
  );
}
