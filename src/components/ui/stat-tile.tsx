import * as React from "react";
import type { LucideIcon } from "lucide-react";

import { cn } from "@/lib/utils";

function StatTile({
  label,
  value,
  hint,
  icon: Icon,
  tone = "default",
  className,
}: {
  label: string;
  value: React.ReactNode;
  hint?: React.ReactNode;
  icon?: LucideIcon;
  tone?: "default" | "primary" | "success" | "warning";
  className?: string;
}) {
  const toneClasses: Record<string, string> = {
    default: "bg-canvas text-ink-600",
    primary: "bg-primary-50 text-primary-600",
    success: "bg-emerald-50 text-emerald-700",
    warning: "bg-amber-50 text-amber-700",
  };

  return (
    <div className={cn("rounded-xl border border-line bg-surface p-5 shadow-sm", className)}>
      <div className="flex items-start justify-between gap-3">
        <p className="text-sm text-ink-500">{label}</p>
        {Icon ? (
          <span className={cn("grid size-8 shrink-0 place-items-center rounded-lg", toneClasses[tone])}>
            <Icon className="size-4" />
          </span>
        ) : null}
      </div>
      <p className="mt-3 font-mono text-2xl font-semibold text-ink-950">{value}</p>
      {hint ? <p className="mt-1 text-xs text-ink-500">{hint}</p> : null}
    </div>
  );
}

export { StatTile };
