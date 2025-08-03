

"use client";

import * as React from "react";
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
  type RowSelectionState,
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
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { SearchCheck, ChevronRight, FileText, Languages } from "lucide-react";
import type { ContentItem, HierarchicalContentItem } from "@/lib/types";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";

interface SeoPageListTableProps {
  data: ContentItem[];
  scores: Record<number, number>;
  onAnalyzePage: (page: ContentItem) => void;
  onViewReport: (page: ContentItem) => void;
  pageCount: number;
  pagination: { pageIndex: number; pageSize: number };
  setPagination: React.Dispatch<React.SetStateAction<{ pageIndex: number; pageSize: number }>>;
}

const getStatusText = (status: ContentItem['status']) => {
    const statusMap: { [key: string]: string } = {
        publish: 'Publicado',
        draft: 'Borrador',
        pending: 'Pendiente',
        private: 'Privado',
        future: 'Programado',
    };
    return statusMap[status] || status;
};

const ScoreBadge = ({ score }: { score: number | undefined }) => {
    if (score === undefined) return null;
    
    const scoreColor = score >= 80 ? 'bg-green-500' : score >= 50 ? 'bg-amber-500' : 'bg-destructive';

    return (
        <Badge className={cn("text-white", scoreColor)}>{score}</Badge>
    );
};

export function SeoPageListTable({ data, scores, onAnalyzePage, onViewReport, pageCount, pagination, setPagination }: SeoPageListTableProps) {
  const [columnFilters, setColumnFilters] = React.useState<ColumnFiltersState>([]);
  const [expanded, setExpanded] = React.useState<ExpandedState>({});
  
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


  const columns = React.useMemo<ColumnDef<HierarchicalContentItem>[]>(
    () => [
      {
        accessorKey: 'title',
        header: 'Título',
        cell: ({ row, getValue }) => (
            <div
                style={{ paddingLeft: `${row.depth * 1.5}rem` }}
                className="flex items-center gap-1"
            >
                {row.getCanExpand() ? (
                    <button
                        onClick={row.getToggleExpandedHandler()}
                        className="cursor-pointer p-1 -ml-1"
                        aria-label={row.getIsExpanded() ? 'Contraer fila' : 'Expandir fila'}
                    >
                        <ChevronRight className={cn("h-4 w-4 transition-transform", row.getIsExpanded() && 'rotate-90')} />
                    </button>
                ) : (
                   row.depth > 0 && <span className="w-4 h-4 text-muted-foreground ml-1">↳</span>
                )}
                <span className="font-medium">{getValue<string>()}</span>
            </div>
        ),
      },
      {
        accessorKey: 'type',
        header: 'Tipo',
        cell: ({ getValue }) => {
          const type = getValue<string>();
          let variant: "secondary" | "outline" | "default" = "secondary";
          if (type.includes('Page') || type.includes('Página')) variant = 'outline';
          if (type.includes('Product') || type.includes('Producto')) variant = 'default';

          return <Badge variant={variant}>{type}</Badge>
        }
      },
      {
        accessorKey: 'status',
        header: 'Estado',
        cell: ({ getValue }) => <Badge variant={getValue<string>() === 'publish' ? 'default' : 'secondary'}>{getStatusText(getValue<ContentItem['status']>())}</Badge>
      },
       {
        accessorKey: 'lang',
        header: 'Idioma',
        cell: ({ getValue }) => {
            const lang = getValue<string>();
            if (!lang || lang === 'default') {
                return <Badge variant="outline" className="opacity-60">N/A</Badge>
            }
            return <Badge variant="outline" className="uppercase">{lang}</Badge>;
        },
        filterFn: (row, id, value) => {
            const lang = row.getValue(id) as string;
            return value.includes(lang)
        },
      },
      {
        id: 'score',
        header: 'Score SEO',
        cell: ({ row }) => <ScoreBadge score={scores[row.original.id]} />,
      },
      {
        id: 'actions',
        header: () => <div className="text-right">Acción</div>,
        cell: ({ row }) => {
            const hasScore = scores[row.original.id] !== undefined;
            return (
                <div className="text-right">
                    {hasScore ? (
                        <Button onClick={() => onViewReport(row.original)} size="sm" variant="outline">
                            <FileText className="mr-0 md:mr-2 h-4 w-4" />
                            <span className="hidden md:inline">Ver Informe</span>
                        </Button>
                    ) : (
                        <Button onClick={() => onAnalyzePage(row.original)} size="sm">
                            <SearchCheck className="mr-0 md:mr-2 h-4 w-4" />
                            <span className="hidden md:inline">Analizar</span>
                        </Button>
                    )}
                </div>
            );
        },
      },
    ],
    [onAnalyzePage, onViewReport, scores]
  );

  const table = useReactTable({
    data: tableData,
    columns,
    pageCount: pageCount,
    state: {
      expanded,
      columnFilters,
      pagination,
    },
    onExpandedChange: setExpanded,
    onColumnFiltersChange: setColumnFilters,
    onPaginationChange: setPagination,
    getSubRows: (row) => row.subRows,
    getCoreRowModel: getCoreRowModel(),
    getExpandedRowModel: getExpandedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    manualPagination: true,
  });
  
  const availableLanguages = React.useMemo(() => {
    const langSet = new Set<string>();
    data.forEach(item => {
        if (item.lang && item.lang !== 'default') langSet.add(item.lang);
    });
    return Array.from(langSet).map(code => ({ code, name: LANGUAGE_MAP[code as keyof typeof LANGUAGE_MAP] || code.toUpperCase() }));
  }, [data]);

  return (
    <div className="w-full space-y-4">
      <div className="flex flex-col sm:flex-row gap-2 py-4">
        <Input
          placeholder="Filtrar por título..."
          value={(table.getColumn('title')?.getFilterValue() as string) ?? ''}
          onChange={(event) =>
            table.getColumn('title')?.setFilterValue(event.target.value)
          }
          className="max-w-sm"
        />
        <Select
            value={(table.getColumn('type')?.getFilterValue() as string) ?? 'all'}
            onValueChange={(value) => table.getColumn('type')?.setFilterValue(value === 'all' ? null : value)}
        >
            <SelectTrigger className="w-full sm:w-[180px]">
                <SelectValue placeholder="Filtrar por tipo" />
            </SelectTrigger>
            <SelectContent>
                <SelectItem value="all">Todos los Tipos</SelectItem>
                <SelectItem value="Page">Páginas</SelectItem>
                 <SelectItem value="Categoría de Entradas">Cat. Entradas</SelectItem>
            </SelectContent>
        </Select>
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
            value={(table.getColumn('lang')?.getFilterValue() as string) ?? 'all'}
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
                <TableRow key={row.id}>
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
                  No se encontraron resultados para los filtros seleccionados.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
      
       <div className="flex items-center justify-between space-x-2 py-4">
        <div className="flex-1 text-sm text-muted-foreground">
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
