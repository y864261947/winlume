"use client";

import {
  ViewTransition,
  type ComponentProps,
  type ReactNode,
} from "react";

type ViewTransitionProps = ComponentProps<typeof ViewTransition>;

/**
 * Thin wrapper so call sites stay clean, and we can no-op if the runtime
 * ever ships without ViewTransition (progressive enhancement).
 */
export default function StudioViewTransition({
  children,
  ...props
}: ViewTransitionProps & { children: ReactNode }) {
  if (typeof ViewTransition !== "function" && typeof ViewTransition !== "object") {
    return <>{children}</>;
  }
  return <ViewTransition {...props}>{children}</ViewTransition>;
}
