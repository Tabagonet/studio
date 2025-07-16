
"use client";

import * as React from "react";
import {
  flexRender,
  getCoreRowModel,
  getFilteredRowModel,
  getSortedRowModel,
  useReactTable,
  type ColumnDef,
  type ColumnFiltersState,
  type SortingState,
} from "@tanstack/react-table";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { ArrowUpDown } from "lucide-react";
import type { ContentItem } from "@/lib/types";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";

interface BatchActionsTableProps {
  data: ContentItem[];
  isLoading: boolean;
  rowSelection: Record<string, boolean>;
  setRowSelection: React.Dispatch<React.SetStateAction<Record<string, boolean>>>;
}

const getStatusText = (status: ContentItem['status']) => {
    const statusMap: { [key: string]: string } = {
        publish: 'Publicado', draft: 'Borrador', pending: 'Pendiente', private: 'Privado', future: 'Programado',
    };
    return statusMap[status] || status;
};


export function BatchActionsTable({ data, isLoading, rowSelection, setRowSelection }: BatchActionsTableProps) {
  const [columnFilters, setColumnFilters] = React.useState<ColumnFiltersState>([]);
  const [sorting, setSorting] = React.useState<SortingState>([{ id: 'title', desc: false }]);

  const columns = React.useMemo<ColumnDef<ContentItem>[]>(
    () => [
        {
            id: "select",
            header: ({ table }) => (
                <Checkbox
                    checked={table.getIsAllPageRowsSelected() || (table.getIsSomePageRowsSelected() && "indeterminate")}
                    onCheckedChange={(value) => table.toggleAllPageRowsSelected(!!value)}
                    aria-label="Seleccionar todo"
                />
            ),
            cell: ({ row }) => (
                <Checkbox
                    checked={row.getIsSelected()}
                    onCheckedChange={(value) => row.toggleSelected(!!value)}
                    aria-label="Seleccionar fila"
                />
            ),
        },
        { accessorKey: 'title', header: ({ column }) => <Button variant="ghost" onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}>Título<ArrowUpDown className="ml-2 h-4 w-4" /></Button> },
        { accessorKey: 'type', header: 'Tipo', cell: ({ getValue }) => <Badge variant="outline">{getValue<string>()}</Badge> },
        { accessorKey: 'status', header: 'Estado', cell: ({ getValue }) => <Badge variant="secondary">{getStatusText(getValue<ContentItem['status']>())}</Badge> },
        { accessorKey: 'lang', header: 'Idioma', cell: ({ getValue }) => <Badge variant="outline" className="uppercase">{getValue<string>()}</Badge> },
    ], []);

  const table = useReactTable({
    data,
    columns,
    state: { columnFilters, sorting, rowSelection },
    onColumnFiltersChange: setColumnFilters,
    onSortingChange: setSorting,
    onRowSelectionChange: setRowSelection,
    getCoreRowModel: getCoreRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getSortedRowModel: getSortedRowModel(),
  });
  
  const languages = React.useMemo(() => {
    const langSet = new Set(data.map(item => item.lang).filter(Boolean));
    return Array.from(langSet) as string[];
  }, [data]);

  return (
    <div className="w-full space-y-4">
      <div className="flex flex-col sm:flex-row gap-2 py-4">
        <Input
          placeholder="Filtrar por título..."
          value={(table.getColumn('title')?.getFilterValue() as string) ?? ''}
          onChange={(event) => table.getColumn('title')?.setFilterValue(event.target.value)}
          className="max-w-sm"
        />
        <Select
            value={(table.getColumn('type')?.getFilterValue() as string) ?? 'all'}
            onValueChange={(value) => table.getColumn('type')?.setFilterValue(value === 'all' ? null : value)}
        >
            <SelectTrigger className="w-full sm:w-[180px]"><SelectValue placeholder="Filtrar por tipo" /></SelectTrigger>
            <SelectContent>
                <SelectItem value="all">Todos los Tipos</SelectItem>
                <SelectItem value="Post">Entradas (Posts)</SelectItem>
                <SelectItem value="Page">Páginas</SelectItem>
            </SelectContent>
        </Select>
        <Select
            value={table.getColumn('lang')?.getFilterValue() as string ?? 'all'}
            onValueChange={(value) => table.getColumn('lang')?.setFilterValue(value === 'all' ? null : value)}
            disabled={languages.length === 0}
        >
            <SelectTrigger className="w-full sm:w-[180px]"><SelectValue placeholder="Filtrar por idioma" /></SelectTrigger>
            <SelectContent>
                <SelectItem value="all">Todos los Idiomas</SelectItem>
                 {languages.map(lang => (
                    <SelectItem key={lang} value={lang}>{lang.toUpperCase()}</SelectItem>
                ))}
            </SelectContent>
        </Select>
      </div>

      <div className="rounded-md border">
        <Table>
          <TableHeader>
            {table.getHeaderGroups().map((headerGroup) => (
              <TableRow key={headerGroup.id}>
                {headerGroup.headers.map((header) => (
                  <TableHead key={header.id}>
                    {header.isPlaceholder ? null : flexRender(header.column.columnDef.header, header.getContext())}
                  </TableHead>
                ))}
              </TableRow>
            ))}
          </TableHeader>
          <TableBody>
            {table.getRowModel().rows?.length ? (
              table.getRowModel().rows.map((row) => (
                <TableRow key={row.id} data-state={row.getIsSelected() && "selected"}>
                  {row.getVisibleCells().map((cell) => (
                    <TableCell key={cell.id}>{flexRender(cell.column.columnDef.cell, cell.getContext())}</TableCell>
                  ))}
                </TableRow>
              ))
            ) : (
              <TableRow><TableCell colSpan={columns.length} className="h-24 text-center">No se encontraron resultados.</TableCell></TableRow>
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
