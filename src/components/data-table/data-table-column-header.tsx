import type { Column } from "@tanstack/react-table";
import { ArrowDown, ArrowUp, ChevronsUpDown, EyeOff } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";

interface DataTableColumnHeaderProps<TData, TValue> extends React.ComponentProps<"div"> {
  column: Column<TData, TValue>;
  title: string;
}

/** Sortable column header with an optional "hide column" action. Falls back to plain text when the column can't be sorted or hidden. */
export function DataTableColumnHeader<TData, TValue>({
  column,
  title,
  className,
}: DataTableColumnHeaderProps<TData, TValue>) {
  if (!column.getCanSort() && !column.getCanHide()) {
    return <div className={cn("text-xs font-medium text-ink-600", className)}>{title}</div>;
  }

  return (
    <div className={cn("flex items-center gap-2", className)}>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            size="sm"
            className="-ml-2 h-8 gap-1.5 px-2 text-xs font-medium text-ink-600 hover:text-ink-950"
          >
            <span>{title}</span>
            {column.getCanSort() ? (
              column.getIsSorted() === "desc" ? (
                <ArrowDown className="size-3.5" />
              ) : column.getIsSorted() === "asc" ? (
                <ArrowUp className="size-3.5" />
              ) : (
                <ChevronsUpDown className="size-3.5 text-ink-400" />
              )
            ) : null}
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start">
          {column.getCanSort() ? (
            <>
              <DropdownMenuItem onClick={() => column.toggleSorting(false)}>
                <ArrowUp className="mr-2 size-3.5 text-ink-500" />
                升序
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => column.toggleSorting(true)}>
                <ArrowDown className="mr-2 size-3.5 text-ink-500" />
                降序
              </DropdownMenuItem>
            </>
          ) : null}
          {column.getCanSort() && column.getCanHide() ? <DropdownMenuSeparator /> : null}
          {column.getCanHide() ? (
            <DropdownMenuItem onClick={() => column.toggleVisibility(false)}>
              <EyeOff className="mr-2 size-3.5 text-ink-500" />
              隐藏该列
            </DropdownMenuItem>
          ) : null}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
