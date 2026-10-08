import type { Metadata } from "next";
import PortalPreview from "@/components/portal-preview/PortalPreview";
import { getPublicPortalContent, type PortalModelVendor } from "@/lib/portal/content-config";
import { listSkillMetas } from "@/lib/agent/skills/registry";
import { portalRoleGroups } from "@/lib/portal/preview-roles";
import modelSnapshot from "./model-snapshot.json";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "REIZO · 新版门户预览",
  robots: { index: false, follow: false },
};

export default async function PortalPreviewPage() {
  const [content, skills] = await Promise.all([getPublicPortalContent(), listSkillMetas()]);
  // Local previews have no database. This public catalog snapshot was captured
  // on 2026-09-23; a configured deployment always uses its published catalog.
  const useSnapshot = !process.env.DATABASE_URL && content.modelVendors.length === 0;
  return <PortalPreview
    vendors={useSnapshot ? modelSnapshot as PortalModelVendor[] : content.modelVendors}
    modelSnapshotDate={useSnapshot ? "2026.09.23" : undefined}
    roleGroups={portalRoleGroups(skills)}
  />;
}
