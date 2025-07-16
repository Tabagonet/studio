
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
  type ColumnFiltersState,
  type ExpandedState,
  type RowSelectionState,
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
import { getColumns } from "./columns"; 
import type { ContentItem, HierarchicalContentItem } from '@/lib/types';
import { Loader2, ChevronDown, Trash2, Link2 } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, DropdownMenuSeparator, DropdownMenuLabel } from "@/components/ui/dropdown-menu";
import { useToast } from "@/hooks/use-toast";
import { auth } from "@/lib/firebase";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";

interface PageDataTableProps {
  data: ContentItem[];
  scores: Record<number, number>;
  isLoading: boolean;
  onAnalyzePage: (item: ContentItem) => void;
  onEditPage: (item: ContentItem) => void;
  isAnalyzingId: number | null;
  onDataChange: (token: string) => void;
}

export function PageDataTable({ data, scores, isLoading, onAnalyzePage, onEditPage, isAnalyzingId, onDataChange }: PageDataTableProps) {
  const [columnFilters, setColumnFilters] = React.useState<ColumnFiltersState>([]);
  const [sorting, setSorting] = React.useState<React.ComponentProps<typeof useReactTable>['state']['sorting']>([]);
  const [expanded, setExpanded] = React.useState<ExpandedState>({});
  const [rowSelection, setRowSelection] = React.useState<RowSelectionState>({});
  const [isActionLoading, setIsActionLoading] = React.useState(false);
  const { toast } = useToast();

  const tableData = React.useMemo((): HierarchicalContentItem[] => {
    if (!data) return [];
    
    const itemsById = new Map<number, HierarchicalContentItem>(data.map((p) => [p.id, { ...p, subRows: [] }]));
    const roots: HierarchicalContentItem[] = [];
    
    data.forEach((item) => {
        const currentItem = itemsById.get(item.id);
        if (!currentItem) return;

        if (item.parent && itemsById.has(item.parent)) {
            const parent = itemsById.get(item.parent);
            parent?.subRows?.push(currentItem);
        } else {
            // Handle translations: if it's a translation, find its source and add as sub-row
            const translationSourceId = item.translations ? Object.values(item.translations).find(id => id !== item.id && itemsById.has(id)) : undefined;
            if (translationSourceId) {
                const sourceItem = itemsById.get(translationSourceId);
                if (sourceItem && !sourceItem.subRows?.some(sub => sub.id === item.id)) {
                    sourceItem.subRows?.push(currentItem);
                }
            } else {
                roots.push(currentItem);
            }
        }
    });

    return roots;
  }, [data]);

  const columns = React.useMemo(() => getColumns(onAnalyzePage, onEditPage, isAnalyzingId), [onAnalyzePage, onEditPage, isAnalyzingId]);

  const table = useReactTable({
    data: tableData,
    columns,
    state: { sorting, columnFilters, expanded, rowSelection },
    onSortingChange: setSorting,
    onColumnFiltersChange: setColumnFilters,
    onExpandedChange: setExpanded,
    onRowSelectionChange: setRowSelection,
    getSubRows: (row) => row.subRows,
    getCoreRowModel: getCoreRowModel(),
    getExpandedRowModel: getExpandedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
  });
  
  const languages = React.useMemo(() => {
    const langSet = new Set(data.map(item => item.lang).filter(Boolean));
    return Array.from(langSet) as string[];
  }, [data]);

  const handleBatchDelete = async () => {
    setIsActionLoading(true);
    const selectedRows = table.getSelectedRowModel().rows;
    const postIds = selectedRows.flatMap(row => [row.original.id, ...(row.original.subRows?.map(sub => sub.id) || [])]);
    const uniqueIds = [...new Set(postIds)];

    const user = auth.currentUser;
    if (!user) {
        toast({ title: 'No autenticado', variant: 'destructive' });
        setIsActionLoading(false);
        return;
    }
    const token = await user.getIdToken();
    try {
        const response = await fetch('/api/wordpress/posts/batch', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
            body: JSON.stringify({ postIds: uniqueIds, action: 'delete' })
        });
        const result = await response.json();
        if (!response.ok) throw new Error(result.error || result.message);
        toast({ title: "Páginas movidas a la papelera", description: result.message });
        onDataChange(token);
        table.resetRowSelection();
    } catch (e: any) {
        toast({ title: "Error al eliminar", description: e.message, variant: "destructive" });
    } finally {
        setIsActionLoading(false);
    }
  };
  
  const handleLinkTranslations = async () => {
    setIsActionLoading(true);
    const selectedRows = table.getSelectedRowModel().rows;
    const translations = selectedRows.reduce((acc, row) => {
        if (row.original.lang) acc[row.original.lang] = row.original.id;
        return acc;
    }, {} as Record<string, number>);

    const user = auth.currentUser;
    if (!user) {
        toast({ title: 'No autenticado', variant: 'destructive' });
        setIsActionLoading(false);
        return;
    }
    const token = await user.getIdToken();
    try {
        const response = await fetch('/api/wordpress/posts/link-translations', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
            body: JSON.stringify({ translations })
        });
        const result = await response.json();
        if (!response.ok) throw new Error(result.error || result.message);
        toast({ title: "Traducciones enlazadas", description: result.message });
        onDataChange(token);
        table.resetRowSelection();
    } catch(e: any) {
        toast({ title: "Error al enlazar", description: e.message, variant: 'destructive' });
    } finally {
        setIsActionLoading(false);
    }
  };
  
  const selectedRowCount = Object.keys(rowSelection).length;

  return (
    <div className="w-full space-y-4">
      <div className="flex flex-col md:flex-row items-center justify-between gap-4 py-4">
        <div className="flex flex-wrap gap-2 w-full md:w-auto">
            <Input
              placeholder="Filtrar por título..."
              value={(table.getColumn('title')?.getFilterValue() as string) ?? ''}
              onChange={(event) => table.getColumn('title')?.setFilterValue(event.target.value)}
              className="max-w-sm"
            />
            <Select
              value={(table.getColumn('status')?.getFilterValue() as string) ?? 'all'}
              onValueChange={(value) => table.getColumn('status')?.setFilterValue(value === 'all' ? null : value)}
            >
              <SelectTrigger className="w-full sm:w-[180px]"><SelectValue placeholder="Filtrar por estado" /></SelectTrigger>
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
        
        <AlertDialog>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
                <Button variant="outline" disabled={selectedRowCount === 0 || isActionLoading} className="w-full md:w-auto">
                    {isActionLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <ChevronDown className="mr-2 h-4 w-4" />}
                    Acciones ({selectedRowCount})
                </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuLabel>Acciones en Lote</DropdownMenuLabel>
              <DropdownMenuItem onSelect={handleLinkTranslations} disabled={selectedRowCount < 2}>
                  <Link2 className="mr-2 h-4 w-4" /> Enlazar Traducciones
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <AlertDialogTrigger asChild>
                <DropdownMenuItem className="text-destructive focus:text-destructive">
                  <Trash2 className="mr-2 h-4 w-4" /> Mover a la Papelera
                </DropdownMenuItem>
              </AlertDialogTrigger>
            </DropdownMenuContent>
          </DropdownMenu>
          <AlertDialogContent>
              <AlertDialogHeader>
                  <AlertDialogTitle>¿Mover a la papelera?</AlertDialogTitle>
                  <AlertDialogDescription>
                      Las páginas seleccionadas y todas sus traducciones enlazadas se moverán a la papelera de WordPress.
                  </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                  <AlertDialogCancel>Cancelar</AlertDialogCancel>
                  <AlertDialogAction onClick={handleBatchDelete}>Sí, mover a la papelera</AlertDialogAction>
              </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

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
                  <div className="flex justify-center items-center"><Loader2 className="mr-2 h-6 w-6 animate-spin" /> Cargando páginas...</div>
                </TableCell>
              </TableRow>
            ) : table.getRowModel().rows?.length ? (
              table.getRowModel().rows.map((row) => (
                <TableRow key={row.id} data-state={row.getIsSelected() && "selected"}>
                  {row.getVisibleCells().map((cell) => (
                    <TableCell key={cell.id}>{flexRender(cell.column.columnDef.cell, cell.getContext())}</TableCell>
                  ))}
                </TableRow>
              ))
            ) : (
              <TableRow><TableCell colSpan={columns.length} className="h-24 text-center">No se encontraron páginas.</TableCell></TableRow>
            )}
          </TableBody>
        </Table>
      </div>

      <div className="flex items-center justify-end space-x-2 py-4">
        <Button variant="outline" size="sm" onClick={() => table.previousPage()} disabled={!table.getCanPreviousPage()}>Anterior</Button>
        <Button variant="outline" size="sm" onClick={() => table.nextPage()} disabled={!table.getCanNextPage()}>Siguiente</Button>
      </div>
    </div>
  );
}
