"use client";

import PortalFooter from "@/components/PortalFooter";
import { type ReactNode } from "react";
import PortalHeader from "@/components/PortalHeader";
import { usePortalCanvasScale } from "@/components/usePortalCanvasScale";

export default function PortalPricingShell({ children }: { children: ReactNode }) {
  usePortalCanvasScale();
  return (
    <div className="portal-home portal-density-shell">
      <div className="portal-frame portal-pricing-frame">
        <PortalHeader />
        {children}
        <PortalFooter />
      </div>
    </div>
  );
}
