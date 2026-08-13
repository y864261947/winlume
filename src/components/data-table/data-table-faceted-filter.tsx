import type { Table } from "@tanstack/react-table";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export function DataTableFacetedFilter<TData>({
  table,
  columnId,
  placeholder,
  options,
}: {
  table: Table<TData>;
  columnId: string;
  placeholder: string;
  options: Array<{ label: string; value: string }>;
}) {
  const column = table.getColumn(columnId);
  if (!column) return null;
  const value = (column.getFilterValue() as string | undefined) ?? "all";

  return (
    <Select
      value={value}
      onValueChange={(next) => column.setFilterValue(next === "all" ? undefined : next)}
    >
      <SelectTrigger aria-label={placeholder} className="h-8 w-32">
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent>
        <SelectGroup>
          <SelectItem value="all">{placeholder}</SelectItem>
          {options.map((option) => (
            <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>
          ))}
        </SelectGroup>
      </SelectContent>
    </Select>
  );
}
