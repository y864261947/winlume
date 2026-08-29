"use client";

import type { ReactNode } from "react";
import { usePortalCanvasScale } from "@/components/usePortalCanvasScale";

export default function MarketingDensityShell({ children }: { children: ReactNode }) {
  usePortalCanvasScale(".marketing-density-shell");
  return <div className="marketing-density-shell">{children}</div>;
}
