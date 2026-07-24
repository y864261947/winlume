"use client";

import type { ReactNode } from "react";
import StudioSidebar from "./StudioSidebar";

/** Full-height workbench chrome — demo warm canvas + glass sidebar (no marketing chrome). */
export default function StudioShell({ children }: { children: ReactNode }) {
  return (
    <div className="studio-root relative flex h-dvh min-h-0 w-full overflow-hidden">
      <div className="studio-blob studio-blob-a" aria-hidden />
      <div className="studio-blob studio-blob-b" aria-hidden />
      <div className="studio-blob studio-blob-c" aria-hidden />
      <StudioSidebar />
      <div className="relative z-[1] flex min-h-0 min-w-0 flex-1 flex-col">{children}</div>
    </div>
  );
}
