

"use client";

import * as React from "react";
import {
  flexRender,
  getCoreRowModel,
  getExpandedRowModel,
  getFilteredRowModel,
  useReactTable,
  type ColumnDef,
  type ColumnFiltersState,
  type ExpandedState,
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
import { SearchCheck, ChevronRight, FileText } from "lucide-react";
import type { ContentItem as RawContentItem } from "@/app/(app)/seo-optimizer/page";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";

// Define a new type for the table that includes the optional subRows
type ContentItem = RawContentItem & {
    subRows?: ContentItem[];
};

interface SeoPageListTableProps {
  data: ContentItem[];
  scores: Record<number, number>;
  onSelectPage: (page: ContentItem) => void;
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

export function SeoPageListTable({ data, scores, onSelectPage }: SeoPageListTableProps) {
  const [columnFilters, setColumnFilters] = React.useState<ColumnFiltersState>([]);
  const [expanded, setExpanded] = React.useState<ExpandedState>({});
  const [languageFilter, setLanguageFilter] = React.useState('es'); // Default to Spanish

  const tableData = React.useMemo(() => {
    const dataMap = new Map(data.map(item => [item.id, { ...item, subRows: [] as ContentItem[] }]));
    
    // Helper to build hierarchy from a flat list based on parent IDs
    const buildHierarchy = (items: ContentItem[]): ContentItem[] => {
        const itemMap = new Map(items.map(item => [item.id, { ...item, subRows: [] as ContentItem[] }]));
        const roots: ContentItem[] = [];
        
        items.forEach(item => {
            if (item.parent && itemMap.has(item.parent)) {
                const parent = itemMap.get(item.parent);
                parent?.subRows.push(itemMap.get(item.id)!);
            } else {
                roots.push(itemMap.get(item.id)!);
            }
        });

        return roots;
    };
    
    // Filter data by language first
    const filteredData = languageFilter === 'all' 
      ? data 
      : data.filter(item => item.lang === languageFilter);

    // Sort flat list
    const sortedData = [...filteredData].sort((a, b) => a.title.localeCompare(b.title));
    // Then build hierarchy from the filtered & sorted list
    return buildHierarchy(sortedData);

  }, [data, languageFilter]);


  const columns = React.useMemo<ColumnDef<ContentItem>[]>(
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
        cell: ({ getValue }) => <Badge variant={getValue<string>() === 'Post' ? "secondary" : "outline"}>{getValue<string>()}</Badge>
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
                        <Button onClick={() => onSelectPage(row.original)} size="sm" variant="outline">
                            <FileText className="mr-0 md:mr-2 h-4 w-4" />
                            <span className="hidden md:inline">Ver Informe</span>
                        </Button>
                    ) : (
                        <Button onClick={() => onSelectPage(row.original)} size="sm">
                            <SearchCheck className="mr-0 md:mr-2 h-4 w-4" />
                            <span className="hidden md:inline">Analizar</span>
                        </Button>
                    )}
                </div>
            );
        },
      },
    ],
    [onSelectPage, scores]
  );

  const table = useReactTable({
    data: tableData,
    columns,
    state: {
      expanded,
      columnFilters,
    },
    onExpandedChange: setExpanded,
    onColumnFiltersChange: setColumnFilters,
    getSubRows: (row) => row.subRows,
    getCoreRowModel: getCoreRowModel(),
    getExpandedRowModel: getExpandedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
  });
  
  const languages = React.useMemo(() => {
    const langSet = new Set(data.map(item => item.lang).filter(lang => lang && lang !== 'default'));
    return Array.from(langSet) as string[];
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
                <SelectItem value="Post">Entradas (Posts)</SelectItem>
                <SelectItem value="Page">Páginas</SelectItem>
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
            value={languageFilter}
            onValueChange={setLanguageFilter}
            disabled={languages.length === 0}
        >
            <SelectTrigger className="w-full sm:w-[180px]">
                <SelectValue placeholder="Filtrar por idioma" />
            </SelectTrigger>
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
    </div>
  );
}
