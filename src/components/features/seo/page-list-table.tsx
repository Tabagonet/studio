
"use client";

import * as React from "react";
import {
  ColumnDef,
  ColumnFiltersState,
  flexRender,
  getCoreRowModel,
  getFilteredRowModel,
  getPaginationRowModel,
  useReactTable,
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
import { SearchCheck } from "lucide-react";
import type { ContentItem } from "@/app/(app)/seo-optimizer/page";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

interface TreeItem {
  item: ContentItem;
  depth: number;
}

interface SeoPageListTableProps {
  data: ContentItem[];
  onAnalyze: (page: ContentItem) => void;
  typeFilter: string;
  onTypeFilterChange: (value: string) => void;
  statusFilter: string;
  onStatusFilterChange: (value: string) => void;
}

export function SeoPageListTable({ 
    data, 
    onAnalyze, 
    typeFilter, 
    onTypeFilterChange, 
    statusFilter, 
    onStatusFilterChange 
}: SeoPageListTableProps) {
  const [columnFilters, setColumnFilters] = React.useState<ColumnFiltersState>([]);

  const contentTree = React.useMemo(() => {
    const posts = data
      .filter((item) => item.type === 'Post')
      .sort((a, b) => a.title.localeCompare(b.title))
      .map((item) => ({ item, depth: 0 }));

    const pages = data.filter((item) => item.type === 'Page');
    const pageMap = new Map(pages.map((p) => [p.id, { ...p, children: [] as (ContentItem & {children: any[]})[] }]));
    
    const rootPages: (ContentItem & {children: any[]})[] = [];
    pageMap.forEach((page) => {
        if (page.parent && pageMap.has(page.parent)) {
            const parent = pageMap.get(page.parent);
            if (parent) {
                parent.children.push(page);
            }
        } else {
            rootPages.push(page);
        }
    });

    const flattenedPages: TreeItem[] = [];
    const flatten = (nodes: (ContentItem & {children: any[]})[], depth: number) => {
        nodes.sort((a,b) => a.title.localeCompare(b.title));
        
        for (const node of nodes) {
            flattenedPages.push({ item: node, depth });
            if (node.children.length > 0) {
                flatten(node.children, depth + 1);
            }
        }
    };
    
    flatten(rootPages, 0);

    return [...posts, ...flattenedPages];
  }, [data]);


  const columns: ColumnDef<TreeItem>[] = [
    {
      accessorFn: row => row.item.title,
      id: "title",
      header: "Título",
      cell: ({ row }) => {
        const { item, depth } = row.original;
        return (
            <span style={{ paddingLeft: `${depth * 1.5}rem` }} className="font-medium flex items-center">
              {depth > 0 && <span className="text-muted-foreground mr-1">↳</span>}
              {item.title}
            </span>
        );
      },
    },
    {
      accessorFn: row => row.item.type,
      id: 'type',
      header: "Tipo",
      cell: ({ row }) => (
        <Badge variant={row.original.item.type === 'Post' ? "secondary" : "outline"}>
          {row.original.item.type}
        </Badge>
      ),
    },
    {
      accessorFn: row => row.original.item.status,
      id: 'status',
      header: "Estado",
      cell: ({ row }) => {
        const status = row.original.item.status;
        const statusText: { [key: string]: string } = {
            publish: 'Publicado',
            draft: 'Borrador',
            pending: 'Pendiente',
            private: 'Privado',
            future: 'Programado',
        };
        return <Badge variant={status === 'publish' ? 'default' : 'secondary'}>{statusText[status] || status}</Badge>
      }
    },
    {
      id: "actions",
      cell: ({ row }) => (
        <Button onClick={() => onAnalyze(row.original.item)} size="sm">
          <SearchCheck className="mr-2 h-4 w-4" />
          Analizar
        </Button>
      ),
    },
  ];

  const table = useReactTable({
    data: contentTree,
    columns,
    onColumnFiltersChange: setColumnFilters,
    getCoreRowModel: getCoreRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    state: {
      columnFilters,
    },
  });

  return (
    <div className="w-full">
      <div className="flex flex-col sm:flex-row gap-2 py-4">
        <Input
          placeholder="Filtrar por título..."
          value={(table.getColumn("title")?.getFilterValue() as string) ?? ""}
          onChange={(event) =>
            table.getColumn("title")?.setFilterValue(event.target.value)
          }
          className="max-w-sm"
        />
        <Select value={typeFilter} onValueChange={onTypeFilterChange}>
            <SelectTrigger className="w-full sm:w-[180px]">
                <SelectValue placeholder="Filtrar por tipo" />
            </SelectTrigger>
            <SelectContent>
                <SelectItem value="all">Todos los Tipos</SelectItem>
                <SelectItem value="post">Entradas (Posts)</SelectItem>
                <SelectItem value="page">Páginas</SelectItem>
            </SelectContent>
        </Select>
        <Select value={statusFilter} onValueChange={onStatusFilterChange}>
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
                    {header.isPlaceholder
                      ? null
                      : flexRender(
                          header.column.columnDef.header,
                          header.getContext()
                        )}
                  </TableHead>
                ))}
              </TableRow>
            ))}
          </TableHeader>
          <TableBody>
            {table.getRowModel().rows?.length ? (
              table.getRowModel().rows.map((row) => (
                <TableRow
                  key={row.original.item.id}
                >
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
      <div className="flex items-center justify-end space-x-2 py-4">
        <Button
          variant="outline"
          size="sm"
          onClick={() => table.previousPage()}
          disabled={!table.getCanPreviousPage()}
        >
          Anterior
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={() => table.nextPage()}
          disabled={!table.getCanNextPage()}
        >
          Siguiente
        </Button>
      </div>
    </div>
  );
}
