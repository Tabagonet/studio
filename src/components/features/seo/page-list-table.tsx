
"use client";

import * as React from "react";
import {
  flexRender,
  getCoreRowModel,
  getExpandedRowModel,
  getFilteredRowModel,
  useReactTable,
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
import { SearchCheck, ChevronRight } from "lucide-react";
import type { ContentItem } from "@/app/(app)/seo-optimizer/page";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";


interface SeoPageListTableProps {
  data: ContentItem[];
  onAnalyze: (page: ContentItem) => void;
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

export function SeoPageListTable({ data, onAnalyze }: SeoPageListTableProps) {
  const [titleFilter, setTitleFilter] = React.useState('');
  const [typeFilter, setTypeFilter] = React.useState('all');
  const [statusFilter, setStatusFilter] = React.useState('all');
  const [expanded, setExpanded] = React.useState<ExpandedState>({});

  const tableData = React.useMemo(() => {
    const filteredData = data.filter(item => {
      const typeMatch = typeFilter === 'all' || item.type.toLowerCase() === typeFilter;
      const statusMatch = statusFilter === 'all' || item.status === statusFilter;
      const titleMatch = !titleFilter || item.title.toLowerCase().includes(titleFilter.toLowerCase());
      return typeMatch && statusMatch && titleMatch;
    });

    const posts = filteredData.filter((item) => item.type === 'Post');
    const pages = filteredData.filter((item) => item.type === 'Page');
    
    const pageMap = new Map(pages.map(p => [p.id, { ...p, subRows: [] as ContentItem[] }]));
    const rootPages: ContentItem[] = [];

    pages.forEach((page) => {
      if (page.parent && pageMap.has(page.parent)) {
        pageMap.get(page.parent)?.subRows.push(page);
      } else {
        rootPages.push(pageMap.get(page.id)!);
      }
    });

    return [...rootPages, ...posts];
  }, [data, titleFilter, typeFilter, statusFilter]);

  const columns = React.useMemo(
    () => [
      {
        accessorKey: 'title',
        header: 'Título',
        cell: ({ row, getValue }: { row: any, getValue: any }) => {
          const isPage = row.original.type === 'Page';
          return (
            <div style={{ paddingLeft: `${row.depth * 1.5}rem` }} className="flex items-center gap-2">
              {row.getCanExpand() ? (
                <button
                  {...{
                    onClick: row.getToggleExpandedHandler(),
                    style: { cursor: 'pointer' },
                  }}
                >
                  <ChevronRight className={cn("h-4 w-4 transition-transform", row.getIsExpanded() && 'rotate-90')} />
                </button>
              ) : (
                isPage && <div className="w-4 h-4" /> // Placeholder for alignment
              )}
              <span className="font-medium">{getValue()}</span>
            </div>
          );
        },
      },
      {
        accessorKey: 'type',
        header: 'Tipo',
        cell: ({ getValue }: { getValue: any }) => <Badge variant={getValue() === 'Post' ? "secondary" : "outline"}>{getValue()}</Badge>
      },
      {
        accessorKey: 'status',
        header: 'Estado',
        cell: ({ getValue }: { getValue: any }) => <Badge variant={getValue() === 'publish' ? 'default' : 'secondary'}>{getStatusText(getValue())}</Badge>
      },
      {
        id: 'actions',
        header: () => <div className="text-right">Acción</div>,
        cell: ({ row }: { row: any }) => (
          <div className="text-right">
            <Button onClick={() => onAnalyze(row.original)} size="sm">
              <SearchCheck className="mr-0 md:mr-2 h-4 w-4" />
              <span className="hidden md:inline">Analizar</span>
            </Button>
          </div>
        ),
      },
    ],
    [onAnalyze]
  );

  const table = useReactTable({
    data: tableData,
    columns,
    state: {
      expanded,
    },
    onExpandedChange: setExpanded,
    getSubRows: (row) => row.subRows,
    getCoreRowModel: getCoreRowModel(),
    getExpandedRowModel: getExpandedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
  });

  return (
    <div className="w-full space-y-4">
      <div className="flex flex-col sm:flex-row gap-2 py-4">
        <Input
          placeholder="Filtrar por título..."
          value={titleFilter}
          onChange={(event) => setTitleFilter(event.target.value)}
          className="max-w-sm"
        />
        <Select value={typeFilter} onValueChange={setTypeFilter}>
            <SelectTrigger className="w-full sm:w-[180px]">
                <SelectValue placeholder="Filtrar por tipo" />
            </SelectTrigger>
            <SelectContent>
                <SelectItem value="all">Todos los Tipos</SelectItem>
                <SelectItem value="post">Entradas (Posts)</SelectItem>
                <SelectItem value="page">Páginas</SelectItem>
            </SelectContent>
        </Select>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
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
