"use client";

import { LoaderCircle, RotateCw } from "lucide-react";
import type { ReactNode } from "react";

export type RetryableErrorProps = {
  message: string;
  onRetry?: () => void;
  retrying?: boolean;
  retryLabel?: string;
  className?: string;
};

/** Shared inline error state for operations the user can retry. */
export default function RetryableError({
  message,
  onRetry,
  retrying = false,
  retryLabel = "重试",
  className = "",
}: RetryableErrorProps): ReactNode {
  return (
    <div
      role="alert"
      className={`flex flex-wrap items-center gap-2 rounded-md bg-rose-50 px-3 py-2 text-sm text-rose-700 ${className}`}
    >
      <span className="min-w-0 flex-1">{message}</span>
      {onRetry ? (
        <button
          type="button"
          onClick={onRetry}
          disabled={retrying}
          className="inline-flex h-7 shrink-0 items-center gap-1.5 rounded-md bg-rose-600 px-2.5 text-xs font-medium text-white transition-colors hover:bg-rose-700 disabled:pointer-events-none disabled:opacity-60"
        >
          {retrying ? (
            <LoaderCircle className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <RotateCw className="h-3.5 w-3.5" />
          )}
          {retryLabel}
        </button>
      ) : null}
    </div>
  );
}
