"use client";

import {
  columnFilteringFeature,
  createFilteredRowModel,
  createPaginatedRowModel,
  createSortedRowModel,
  filterFn_includesString,
  globalFilteringFeature,
  rowPaginationFeature,
  rowSortingFeature,
  sortFn_alphanumeric,
  sortFn_basic,
  sortFn_text,
  tableFeatures,
  useTable,
  type ColumnDef,
  type RowData,
  type SortingState,
} from "@tanstack/react-table";
import { ArrowDown, ArrowUp, ArrowUpDown, ChevronLeft, ChevronRight, Search } from "lucide-react";
import { useTranslations } from "next-intl";
import type { ReactNode } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { cn } from "@/lib/utils";

/** Shared feature set; column helpers must be created with `typeof dataTableFeatures`. */
export const dataTableFeatures = tableFeatures({
  rowSortingFeature,
  columnFilteringFeature,
  globalFilteringFeature,
  rowPaginationFeature,
  filteredRowModel: createFilteredRowModel(),
  sortedRowModel: createSortedRowModel(),
  paginatedRowModel: createPaginatedRowModel(),
  sortFns: { alphanumeric: sortFn_alphanumeric, text: sortFn_text, basic: sortFn_basic },
  filterFns: { includesString: filterFn_includesString },
});

export type DataTableColumn<TData extends RowData> = ColumnDef<typeof dataTableFeatures, TData>;

type DataTableProps<TData extends RowData> = {
  columns: DataTableColumn<TData>[];
  data: TData[];
  searchPlaceholder?: string;
  /** Extra controls next to the search box (selects, buttons). */
  toolbar?: ReactNode;
  initialSorting?: SortingState;
  pageSize?: number;
  emptyText: string;
  getRowId?: (row: TData) => string;
  /** Pre-filter applied outside the table (e.g. by a status select). */
  filter?: (row: TData) => boolean;
  /** Pre-filled search (e.g. from ?search= in the URL). */
  initialSearch?: string;
  /** Compact rendering for phones; when given, the table is shown from md up only. */
  renderMobileRow?: (row: TData) => ReactNode;
};

/**
 * Client-side sortable, searchable, paginated table on TanStack Table v9.
 * Opted out of the React Compiler: the v9 table object is stable, and
 * compiler memoization could otherwise serve stale row models.
 */
export function DataTable<TData extends RowData>({
  columns,
  data,
  searchPlaceholder,
  toolbar,
  initialSorting = [],
  pageSize = 20,
  emptyText,
  getRowId,
  filter,
  renderMobileRow,
  initialSearch,
}: DataTableProps<TData>) {
  "use no memo";
  const t = useTranslations("ui");
  const rows = filter ? data.filter(filter) : data;
  const table = useTable({
    features: dataTableFeatures,
    columns,
    data: rows,
    getRowId: getRowId ? (row) => getRowId(row) : undefined,
    globalFilterFn: "includesString",
    initialState: {
      sorting: initialSorting,
      pagination: { pageIndex: 0, pageSize },
      globalFilter: initialSearch ?? "",
    },
  });
  const pageCount = Math.max(1, table.getPageCount());
  const pageIndex = table.state.pagination.pageIndex;
  const visibleRows = table.getRowModel().rows;

  return (
    <div className="grid gap-3">
      {(searchPlaceholder || toolbar) && (
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          {searchPlaceholder && (
            <div className="relative sm:max-w-xs sm:flex-1">
              <Search
                className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground"
                aria-hidden="true"
              />
              <Input
                type="search"
                value={String(table.state.globalFilter ?? "")}
                onChange={(event) => table.setGlobalFilter(event.target.value)}
                placeholder={searchPlaceholder}
                aria-label={searchPlaceholder}
                className="pl-8"
              />
            </div>
          )}
          {toolbar}
        </div>
      )}

      {renderMobileRow && (
        <ul className="grid gap-2 md:hidden">
          {visibleRows.length === 0 ? (
            <li className="rounded-xl border bg-card px-4 py-8 text-center text-sm text-muted-foreground">
              {emptyText}
            </li>
          ) : (
            visibleRows.map((row) => (
              <li key={row.id} className="rounded-xl border bg-card p-3">
                {renderMobileRow(row.original)}
              </li>
            ))
          )}
        </ul>
      )}

      <div className={cn("overflow-x-auto rounded-xl border bg-card", renderMobileRow && "hidden md:block")}>
        <Table>
          <TableHeader>
            {table.getHeaderGroups().map((group) => (
              <TableRow key={group.id}>
                {group.headers.map((header) => {
                  const sorted = header.column.getIsSorted();
                  const canSort = header.column.getCanSort();
                  return (
                    <TableHead
                      key={header.id}
                      aria-sort={
                        sorted === "asc" ? "ascending" : sorted === "desc" ? "descending" : undefined
                      }
                      className="whitespace-nowrap"
                    >
                      {header.isPlaceholder ? null : canSort ? (
                        <button
                          type="button"
                          onClick={header.column.getToggleSortingHandler()}
                          className="-mx-1 inline-flex items-center gap-1 rounded px-1 hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                        >
                          <table.FlexRender header={header} />
                          {sorted === "asc" ? (
                            <ArrowUp className="size-3.5" aria-hidden="true" />
                          ) : sorted === "desc" ? (
                            <ArrowDown className="size-3.5" aria-hidden="true" />
                          ) : (
                            <ArrowUpDown className="size-3.5 opacity-40" aria-hidden="true" />
                          )}
                        </button>
                      ) : (
                        <table.FlexRender header={header} />
                      )}
                    </TableHead>
                  );
                })}
              </TableRow>
            ))}
          </TableHeader>
          <TableBody>
            {visibleRows.length === 0 ? (
              <TableRow>
                <TableCell colSpan={columns.length} className="py-10 text-center text-muted-foreground">
                  {emptyText}
                </TableCell>
              </TableRow>
            ) : (
              visibleRows.map((row) => (
                <TableRow key={row.id}>
                  {row.getAllCells().map((cell) => (
                    <TableCell key={cell.id} className={cn("align-middle")}>
                      <table.FlexRender cell={cell} />
                    </TableCell>
                  ))}
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {pageCount > 1 && (
        <div className="flex items-center justify-end gap-2 text-sm text-muted-foreground">
          <span>{t("page", { page: pageIndex + 1, pages: pageCount })}</span>
          <Button
            variant="outline"
            size="icon-sm"
            onClick={() => table.previousPage()}
            disabled={!table.getCanPreviousPage()}
            aria-label={t("prev")}
          >
            <ChevronLeft />
          </Button>
          <Button
            variant="outline"
            size="icon-sm"
            onClick={() => table.nextPage()}
            disabled={!table.getCanNextPage()}
            aria-label={t("next")}
          >
            <ChevronRight />
          </Button>
        </div>
      )}
    </div>
  );
}
