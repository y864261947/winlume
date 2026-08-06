import type { ReactNode } from "react";

export function ConsolePage({
  eyebrow,
  title,
  description,
  actions,
  children,
}: {
  eyebrow?: string;
  title: string;
  description: string;
  actions?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="w-full p-5 sm:p-7">
      <div className="flex flex-wrap items-start justify-between gap-4 border-b border-line pb-6">
        <div className="min-w-0">
          {eyebrow ? <p className="mb-2 text-xs font-medium text-ink-500">{eyebrow}</p> : null}
          <h1 className="text-2xl font-semibold text-ink-950">{title}</h1>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-ink-600">{description}</p>
        </div>
        {actions ? <div className="flex shrink-0 items-center gap-2">{actions}</div> : null}
      </div>
      <div className="pt-6">{children}</div>
    </div>
  );
}

export function ConsoleEmptyState({
  title,
  description,
}: {
  title: string;
  description: string;
}) {
  return (
    <div className="border border-dashed border-line-strong bg-surface px-5 py-10 text-center">
      <p className="text-sm font-medium text-ink-800">{title}</p>
      <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-ink-500">{description}</p>
    </div>
  );
}
