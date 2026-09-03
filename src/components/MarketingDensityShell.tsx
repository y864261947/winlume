"use client";

import type { ReactNode } from "react";
import { usePortalCanvasScale } from "@/components/usePortalCanvasScale";

export default function MarketingDensityShell({ children, disableScale = false }: { children: ReactNode; disableScale?: boolean }) {
  usePortalCanvasScale(disableScale ? ".marketing-density-shell-disabled" : ".marketing-density-shell");
  return <div className={`marketing-density-shell${disableScale ? " marketing-density-shell-disabled" : ""}`}>{children}</div>;
}
