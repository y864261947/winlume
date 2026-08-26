"use client";

import { useEffect } from "react";
import { useParams } from "next/navigation";
import { useWorkspaceTabs } from "@/lib/studio/workspace-tabs";

/**
 * Thin route: the actual session UI is rendered by WorkspaceTabsHost
 * (mounted once per open tab in StudioShell) so switching tabs never
 * remounts it. This route's only job is to make sure the matching tab
 * exists and is active.
 */
export default function StudioSessionRoute() {
  const params = useParams();
  const sessionId = typeof params.sessionId === "string" ? params.sessionId : "";
  const { ensureSessionTabActive } = useWorkspaceTabs();
  useEffect(() => {
    if (sessionId) ensureSessionTabActive(sessionId);
  }, [sessionId, ensureSessionTabActive]);
  return null;
}
