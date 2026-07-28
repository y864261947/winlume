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
  // React exposes ViewTransition as an internal element-type Symbol (like
  // React.Fragment), not a function/object — so only `undefined` means the
  // runtime doesn't support it. A typeof check against "function"/"object"
  // is always false for a symbol and silently no-ops every transition.
  if (ViewTransition == null) {
    return <>{children}</>;
  }
  return <ViewTransition {...props}>{children}</ViewTransition>;
}
