
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
import { SearchCheck, ChevronRight } from "lucide-react";
import type { ContentItem as RawContentItem, MenuItem } from "@/app/(app)/seo-optimizer/page";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";

// Define a new type for the table that includes the optional subRows
type ContentItem = RawContentItem & {
    subRows?: ContentItem[];
};

interface SeoPageListTableProps {
  data: ContentItem[];
  menu: MenuItem[];
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

export function SeoPageListTable({ data, menu, onAnalyze }: SeoPageListTableProps) {
  const [columnFilters, setColumnFilters] = React.useState<ColumnFiltersState>([]);
  const [expanded, setExpanded] = React.useState<ExpandedState>({});

  const languages = React.useMemo(() => {
    const langSet = new Set(data.map(item => item.lang));
    return Array.from(langSet).sort();
  }, [data]);
  
  const tableData = React.useMemo(() => {
    // If a menu structure is provided, use it as the source of truth for hierarchy
    if (menu && menu.length > 0) {
        const contentMap = new Map(data.map(item => [item.id.toString(), { ...item, subRows: [] as ContentItem[] }]));
        
        const buildTreeFromMenu = (menuItems: MenuItem[]): ContentItem[] => {
            const tree: ContentItem[] = [];
            menuItems.forEach(menuItem => {
                const contentItem = contentMap.get(menuItem.object_id);
                if (contentItem) {
                    if (menuItem.children && menuItem.children.length > 0) {
                        contentItem.subRows = buildTreeFromMenu(menuItem.children);
                    }
                    tree.push(contentItem);
                }
            });
            return tree;
        };
        return buildTreeFromMenu(menu);
    }

    // Fallback to original parent/child logic if no menu is available
    const items = data.map(item => ({ ...item, subRows: [] as ContentItem[] }));
    const itemMap = new Map(items.map(item => [item.id, item]));
    const roots: ContentItem[] = [];
    
    items.forEach(item => {
        if (item.parent && item.parent > 0 && itemMap.has(item.parent)) {
            const parent = itemMap.get(item.parent);
            parent?.subRows?.push(item);
        } else {
            roots.push(item);
        }
    });

    const sortAlphabetically = (a: ContentItem, b: ContentItem) => a.title.localeCompare(b.title);
    return roots.sort(sortAlphabetically);

  }, [data, menu]);


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
        accessorKey: 'lang',
        header: 'Idioma',
        cell: ({ getValue }) => <Badge variant="outline">{getValue<string>()?.toUpperCase() || 'N/A'}</Badge>
      },
      {
        accessorKey: 'status',
        header: 'Estado',
        cell: ({ getValue }) => <Badge variant={getValue<string>() === 'publish' ? 'default' : 'secondary'}>{getStatusText(getValue<ContentItem['status']>())}</Badge>
      },
      {
        id: 'actions',
        header: () => <div className="text-right">Acción</div>,
        cell: ({ row }) => (
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
      columnFilters,
    },
    onExpandedChange: setExpanded,
    onColumnFiltersChange: setColumnFilters,
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
            value={(table.getColumn('lang')?.getFilterValue() as string) ?? 'all'}
            onValueChange={(value) => table.getColumn('lang')?.setFilterValue(value === 'all' ? null : value)}
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
