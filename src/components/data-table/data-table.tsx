import { type Table, flexRender } from "@tanstack/react-table";

import { ConsoleEmptyState } from "@/components/console/ConsolePage";
import { Table as UiTable, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

import { DataTablePagination } from "./data-table-pagination";

interface DataTableProps<TData> {
  table: Table<TData>;
  columnCount: number;
  emptyTitle?: string;
  emptyDescription?: string;
  onRowClick?: (row: TData) => void;
}

/**
 * Generic, reusable data table body (rows + pagination) built on TanStack Table.
 * Build the `table` instance with `useDataTable` and pair with `DataTableToolbar`
 * for search/filter/view-options controls — see REI-9 for the adoption plan.
 */
export function DataTable<TData>({
  table,
  columnCount,
  emptyTitle = "暂无数据",
  emptyDescription,
  onRowClick,
}: DataTableProps<TData>) {
  const rows = table.getRowModel().rows;

  return (
    <div className="space-y-3">
      <UiTable>
        <TableHeader>
          {table.getHeaderGroups().map((headerGroup) => (
            <TableRow key={headerGroup.id}>
              {headerGroup.headers.map((header) => (
                <TableHead key={header.id} style={{ width: header.getSize() !== 150 ? header.getSize() : undefined }}>
                  {header.isPlaceholder ? null : flexRender(header.column.columnDef.header, header.getContext())}
                </TableHead>
              ))}
            </TableRow>
          ))}
        </TableHeader>
        <TableBody>
          {rows.length > 0 ? (
            rows.map((row) => (
              <TableRow
                key={row.id}
                data-state={row.getIsSelected() ? "selected" : undefined}
                onClick={onRowClick ? () => onRowClick(row.original) : undefined}
                className={onRowClick ? "cursor-pointer" : undefined}
              >
                {row.getVisibleCells().map((cell) => (
                  <TableCell key={cell.id}>{flexRender(cell.column.columnDef.cell, cell.getContext())}</TableCell>
                ))}
              </TableRow>
            ))
          ) : (
            <TableRow>
              <TableCell colSpan={columnCount} className="h-32 p-0">
                <ConsoleEmptyState title={emptyTitle} description={emptyDescription ?? ""} />
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </UiTable>
      <DataTablePagination table={table} />
    </div>
  );
}
