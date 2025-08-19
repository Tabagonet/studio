// src/app/(app)/pages/page-data-table.tsx
"use client";

import * as React from "react";
import { useRouter } from 'next/navigation';
import {
  flexRender,
  getCoreRowModel,
  getExpandedRowModel,
  getFilteredRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  useReactTable,
  type ColumnDef,
  type ColumnFiltersState,
  type ExpandedState,
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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2, SearchCheck, Languages, X } from "lucide-react";
import type { ContentItem, HierarchicalContentItem } from '@/lib/types';
import { getColumns } from './columns';

interface PageDataTableProps {
  data: ContentItem[];
  scores: Record<number, number>;
  isLoading: boolean;
  onDataChange: () => void;
  // These are now handled locally by the table component
  // pageCount: number;
  // totalItems: number;
  // pagination: { pageIndex: number; pageSize: number };
  // setPagination: React.Dispatch<React.SetStateAction<{ pageIndex: number; pageSize: number }>>;
}

export function PageDataTable({
  data,
  scores,
  isLoading,
  onDataChange,
  // pageCount,
  // totalItems,
  // pagination,
  // setPagination,
}: PageDataTableProps) {
  const router = useRouter();
  const [sorting, setSorting] = React.useState<SortingState>([{ id: 'title', desc: false }]);
  const [columnFilters, setColumnFilters] = React.useState<ColumnFiltersState>([]);
  const [rowSelection, setRowSelection] = React.useState({})
  const [expanded, setExpanded] = React.useState<ExpandedState>({});
  const [pagination, setPagination] = React.useState({
    pageIndex: 0,
    pageSize: 10,
  });
  
  const LANGUAGE_MAP: { [key: string]: string } = {
    es: 'Español',
    en: 'Inglés',
    fr: 'Francés',
    de: 'Alemán',
    pt: 'Portugués',
  };

  const tableData = React.useMemo((): HierarchicalContentItem[] => {
    if (!data) return [];
    
    const itemsById = new Map<number, HierarchicalContentItem>(data.map((p) => [p.id, { ...p, subRows: [] }]));
    const roots: HierarchicalContentItem[] = [];
    const processedIds = new Set<number>();

    data.forEach((item) => {
        if (processedIds.has(item.id)) return;

        let mainItem: HierarchicalContentItem | undefined;
        const translationIds = new Set(Object.values(item.translations || {}));
        
        if (translationIds.size > 1) {
            const groupItems = Array.from(translationIds)
                .map(id => itemsById.get(id))
                .filter((p): p is HierarchicalContentItem => !!p);

            if (groupItems.length > 0) {
                mainItem = groupItems.find(p => p.lang === 'es') || groupItems[0];
                
                if (mainItem) {
                    mainItem.subRows = groupItems.filter(p => p.id !== mainItem!.id);
                    groupItems.forEach(p => processedIds.add(p.id));
                }
            } else {
                mainItem = itemsById.get(item.id);
                if(mainItem) processedIds.add(mainItem.id);
            }
        } else {
            mainItem = itemsById.get(item.id);
            if(mainItem) processedIds.add(mainItem.id);
        }

        if (mainItem) {
            roots.push(mainItem);
        }
    });

    return roots.sort((a,b) => a.title.localeCompare(b.title));
  }, [data]);

  const handleEditContent = (item: ContentItem) => {
    router.push(`/seo-optimizer/edit/${item.id}?type=${item.type}`);
  };

  const columns = React.useMemo(() => getColumns(handleEditContent), []);

  const table = useReactTable({
    data: tableData,
    columns,
    state: {
      sorting,
      expanded,
      columnFilters,
      pagination,
      rowSelection,
    },
    onPaginationChange: setPagination,
    onSortingChange: setSorting,
    onExpandedChange: setExpanded,
    onRowSelectionChange: setRowSelection,
    onColumnFiltersChange: setColumnFilters,
    getSubRows: (row) => row.subRows,
    getCoreRowModel: getCoreRowModel(),
    getExpandedRowModel: getExpandedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    getSortedRowModel: getSortedRowModel(),
    // manualPagination: true, // Now handled client-side
  });
  
  const availableLanguages = React.useMemo(() => {
    const langSet = new Set<string>();
    data.forEach(item => {
        if (item.lang) langSet.add(item.lang);
    });
    return Array.from(langSet).map(code => ({ code, name: LANGUAGE_MAP[code as keyof typeof LANGUAGE_MAP] || code.toUpperCase() }));
  }, [data]);
  
  const titleFilterValue = (table.getColumn('title')?.getFilterValue() as string) ?? '';

  return (
    <div className="w-full space-y-4">
      <div className="flex flex-col md:flex-row items-center justify-between gap-4 py-4">
        <div className="flex flex-wrap gap-2 w-full md:w-auto">
            <div className="relative max-w-sm w-full sm:w-auto">
              <Input
                placeholder="Filtrar por título..."
                value={titleFilterValue}
                onChange={(event) => table.getColumn('title')?.setFilterValue(event.target.value)}
                className="pr-8"
              />
              {titleFilterValue && (
                <Button
                  variant="ghost"
                  size="icon-sm"
                  className="absolute right-1 top-1/2 -translate-y-1/2 h-6 w-6 text-muted-foreground"
                  onClick={() => table.getColumn('title')?.setFilterValue('')}
                >
                  <X className="h-4 w-4" />
                </Button>
              )}
            </div>
            <Select
                value={(table.getColumn('status')?.getFilterValue() as string) ?? 'all'}
                onValueChange={(value) => table.getColumn('status')?.setFilterValue(value === 'all' ? null : value)}
            >
                <SelectTrigger className="w-full sm:w-[180px]">
                    <SelectValue placeholder="Filtrar por estado" />
                </SelectTrigger>
                <SelectContent>
                    <SelectItem value="all">Todos los Estados</SelectItem>
                    <SelectItem value="publish">Publicado</SelectItem>
                    <SelectItem value="draft">Borrador</SelectItem>
                    <SelectItem value="pending">Pendiente</SelectItem>
                    <SelectItem value="private">Privado</SelectItem>
                </SelectContent>
            </Select>
             <Select
                value={table.getColumn('lang')?.getFilterValue() as string ?? 'all'}
                onValueChange={(value) => table.getColumn('lang')?.setFilterValue(value === 'all' ? null : value)}
                disabled={availableLanguages.length === 0}
            >
                <SelectTrigger className="w-full sm:w-[180px]">
                    <Languages className="mr-2 h-4 w-4" />
                    <SelectValue placeholder="Filtrar por idioma" />
                </SelectTrigger>
                <SelectContent>
                    <SelectItem value="all">Todos los Idiomas</SelectItem>
                     {availableLanguages.map(lang => (
                        <SelectItem key={lang.code} value={lang.code}>{lang.name}</SelectItem>
                    ))}
                </SelectContent>
            </Select>
        </div>
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
                  <div className="flex justify-center items-center"><Loader2 className="mr-2 h-6 w-6 animate-spin" /> Cargando contenido...</div>
                </TableCell>
              </TableRow>
            ) : table.getRowModel().rows?.length ? (
              table.getRowModel().rows.map((row) => (
                <TableRow 
                  key={row.id} 
                  data-state={row.getIsSelected() && "selected"}
                  onClick={(e) => {
                      const target = e.target as HTMLElement;
                      if (!(target instanceof HTMLButtonElement || target.tagName === 'A' || target.closest('button, a, [role=checkbox], [role=menuitem]') )) {
                        router.push(`/seo-optimizer?id=${row.original.id}&type=${row.original.type}`);
                      }
                    }}
                  className="cursor-pointer"
                >
                  {row.getVisibleCells().map((cell) => (
                    <TableCell key={cell.id} onClick={(e) => {
                      if (cell.column.id === 'select' || cell.column.id === 'actions') {
                        e.stopPropagation();
                      }
                    }}>
                      {flexRender(cell.column.columnDef.cell, cell.getContext())}
                    </TableCell>
                  ))}
                </TableRow>
              ))
            ) : (
              <TableRow><TableCell colSpan={columns.length} className="h-24 text-center">No se encontraron resultados.</TableCell></TableRow>
            )}
          </TableBody>
        </Table>
      </div>
      
       <div className="flex items-center justify-between space-x-2 py-4">
        <div className="flex-1 text-sm text-muted-foreground">
           Total de páginas (principales) encontradas: {table.getCoreRowModel().rows.length}
        </div>
        <div className="flex items-center gap-4">
            <div className="flex items-center gap-2">
                <p className="text-sm font-medium">Filas por página</p>
                <Select
                    value={`${table.getState().pagination.pageSize}`}
                    onValueChange={(value) => { table.setPageSize(Number(value)) }}
                >
                    <SelectTrigger className="h-8 w-[70px]">
                        <SelectValue placeholder={table.getState().pagination.pageSize} />
                    </SelectTrigger>
                    <SelectContent side="top">
                        {[10, 20, 50, 100].map((pageSize) => (
                        <SelectItem key={pageSize} value={`${pageSize}`}>
                            {pageSize}
                        </SelectItem>
                        ))}
                    </SelectContent>
                </Select>
            </div>
            <div className="flex items-center space-x-2">
                <span className="text-sm font-medium">
                    Página {table.getState().pagination.pageIndex + 1} de{' '}
                    {table.getPageCount()}
                </span>
                <Button variant="outline" size="sm" onClick={() => table.previousPage()} disabled={!table.getCanPreviousPage()}>
                    Anterior
                </Button>
                <Button variant="outline" size="sm" onClick={() => table.nextPage()} disabled={!table.getCanNextPage()}>
                    Siguiente
                </Button>
            </div>
        </div>
      </div>
    </div>
  );
}
