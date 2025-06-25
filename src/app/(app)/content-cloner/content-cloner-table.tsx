
"use client";

import * as React from "react";
import {
  ColumnFiltersState,
  SortingState,
  flexRender,
  getCoreRowModel,
  getFilteredRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  useReactTable,
  getExpandedRowModel,
  type ExpandedState,
  RowSelectionState,
} from "@tanstack/react-table";
import { useToast } from "@/hooks/use-toast";
import { auth, onAuthStateChanged } from "@/lib/firebase";

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
import { getColumns } from "./columns"; 
import type { ContentItem as RawContentItem } from "@/lib/types";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2, ChevronDown, Copy } from "lucide-react";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";

type ContentItem = RawContentItem & { subRows?: ContentItem[] };

export function ContentClonerTable() {
  const [data, setData] = React.useState<ContentItem[]>([]);
  const [isLoading, setIsLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);

  const [columnFilters, setColumnFilters] = React.useState<ColumnFiltersState>([]);
  const [expanded, setExpanded] = React.useState<ExpandedState>({});
  const [rowSelection, setRowSelection] = React.useState<RowSelectionState>({});

  const { toast } = useToast();

  const fetchData = React.useCallback(async () => {
    setIsLoading(true);
    setError(null);
    const user = auth.currentUser;
    if (!user) {
      setError("Debes iniciar sesión para usar esta función.");
      setIsLoading(false);
      return;
    }
    try {
      const token = await user.getIdToken();
      const response = await fetch(`/api/wordpress/content-list`, { headers: { 'Authorization': `Bearer ${token}` } });
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'No se pudo cargar el contenido del sitio.');
      }
      const { content } = await response.json();

      const dataMap = new Map(content.map((item: ContentItem) => [item.id, { ...item, subRows: [] as ContentItem[] }]));
      const roots: ContentItem[] = [];

      content.forEach((item: ContentItem) => {
        if (item.translations && Object.keys(item.translations).length > 1) {
          const mainPostId = Math.min(...Object.values(item.translations));
          if (item.id === mainPostId) {
            const mainPost = dataMap.get(item.id)!;
            mainPost.subRows = Object.values(item.translations)
              .filter(id => id !== mainPostId)
              .map(id => dataMap.get(id))
              .filter(Boolean) as ContentItem[];
            roots.push(mainPost);
          }
        } else if (!Object.values(item.translations || {}).some(id => id < item.id)) {
          // It's a root or has no translations
          roots.push(dataMap.get(item.id)!);
        }
      });
      setData(roots);

    } catch (err: any) {
      setError(err.message);
      setData([]);
    } finally {
      setIsLoading(false);
    }
  }, []);

  React.useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      if (user) fetchData();
    });
     window.addEventListener('connections-updated', fetchData);
    return () => {
      unsubscribe();
      window.removeEventListener('connections-updated', fetchData);
    };
  }, [fetchData]);

  const handleCloneAndTranslate = () => {
    toast({
        title: "Funcionalidad en Desarrollo",
        description: "La clonación y traducción por lotes se implementará en la Fase 3.",
    });
  };

  const columns = React.useMemo(() => getColumns(handleCloneAndTranslate), [handleCloneAndTranslate]);

  const table = useReactTable({
    data,
    columns,
    state: {
      expanded,
      columnFilters,
      rowSelection,
    },
    onExpandedChange: setExpanded,
    onColumnFiltersChange: setColumnFilters,
    onRowSelectionChange: setRowSelection,
    getSubRows: (row) => row.subRows,
    getCoreRowModel: getCoreRowModel(),
    getExpandedRowModel: getExpandedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
  });

  const selectedRowCount = table.getFilteredSelectedRowModel().rows.length;

  return (
    <div className="space-y-4">
        <div className="flex items-center justify-between">
            <div className="flex flex-col sm:flex-row gap-2">
                <Input
                  placeholder="Filtrar por título..."
                  value={(table.getColumn('title')?.getFilterValue() as string) ?? ''}
                  onChange={(event) => table.getColumn('title')?.setFilterValue(event.target.value)}
                  className="max-w-sm"
                />
                 <Select
                    value={(table.getColumn('type')?.getFilterValue() as string) ?? 'all'}
                    onValueChange={(value) => table.getColumn('type')?.setFilterValue(value === 'all' ? undefined : value)}
                >
                    <SelectTrigger className="w-full sm:w-[180px]">
                        <SelectValue placeholder="Filtrar por tipo..." />
                    </SelectTrigger>
                    <SelectContent>
                        <SelectItem value="all">Todos los Tipos</SelectItem>
                        <SelectItem value="Post">Entradas</SelectItem>
                        <SelectItem value="Page">Páginas</SelectItem>
                    </SelectContent>
                </Select>
            </div>
             <DropdownMenu>
                <DropdownMenuTrigger asChild>
                    <Button variant="outline" disabled={selectedRowCount === 0}>
                        <ChevronDown className="mr-2 h-4 w-4" />
                        Acciones ({selectedRowCount})
                    </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                    <DropdownMenuItem onSelect={handleCloneAndTranslate}>
                        <Copy className="mr-2 h-4 w-4" /> Clonar y Traducir
                    </DropdownMenuItem>
                </DropdownMenuContent>
            </DropdownMenu>
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
            {isLoading ? (
              <TableRow>
                <TableCell colSpan={columns.length} className="h-24 text-center">
                  <Loader2 className="mx-auto h-6 w-6 animate-spin" />
                </TableCell>
              </TableRow>
            ) : table.getRowModel().rows?.length ? (
              table.getRowModel().rows.map((row) => (
                <TableRow key={row.id} data-state={row.getIsSelected() && "selected"}>
                  {row.getVisibleCells().map((cell) => (
                    <TableCell key={cell.id}>
                      {flexRender(cell.column.columnDef.cell, cell.getContext())}
                    </TableCell>
                  ))}
                </TableRow>
              ))
            ) : (
              <TableRow>
                <TableCell colSpan={columns.length} className="h-24 text-center">
                  No se encontraron resultados.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
