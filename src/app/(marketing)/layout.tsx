"use client";

import AnnouncementBar from "@/components/AnnouncementBar";
import SiteHeader from "@/components/SiteHeader";
import PortalFooter from "@/components/PortalFooter";
import MarketingDensityShell from "@/components/MarketingDensityShell";
import PortalHeader from "@/components/PortalHeader";
import { usePortalCanvasScale } from "@/components/usePortalCanvasScale";
import { usePathname } from "next/navigation";

/** Marketing chrome only — Studio routes use a separate layout without header/footer. */
export default function MarketingLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const pathname = usePathname();
  const isSupportPage = pathname.startsWith("/support");
  usePortalCanvasScale(".portal-support-density-shell > .portal-frame");

  return (
    <MarketingDensityShell disableScale={isSupportPage}>
      {isSupportPage ? (
        <div className="portal-home portal-support-density-shell">
          <div className="portal-frame">
            <PortalHeader />
            <main className="portal-support-marketing-main">{children}</main>
            <PortalFooter />
          </div>
        </div>
      ) : (
        <div className="marketing-public-shell">
          <AnnouncementBar />
          <SiteHeader />
          <main className="flex-1">{children}</main>
          <PortalFooter />
        </div>
      )}
    </MarketingDensityShell>
  );
}
