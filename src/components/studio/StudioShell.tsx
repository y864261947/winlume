"use client";

import type { ReactNode } from "react";
import StudioSidebar from "./StudioSidebar";

/** Full-height workbench chrome — no marketing header/footer. */
export default function StudioShell({ children }: { children: ReactNode }) {
  return (
    <div className="flex h-dvh min-h-0 w-full overflow-hidden bg-canvas">
      <StudioSidebar />
      <div className="flex min-h-0 min-w-0 flex-1 flex-col">{children}</div>
    </div>
  );
}
