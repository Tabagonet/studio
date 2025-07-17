

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
import { getColumns } from "./columns"; 
import type { ContentItem, HierarchicalContentItem } from '@/lib/types';
import { Loader2, ChevronDown, Trash2, Sparkles, Edit, Image as ImageIcon } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, DropdownMenuSeparator, DropdownMenuLabel } from "@/components/ui/dropdown-menu";
import { useToast } from "@/hooks/use-toast";
import { auth } from "@/lib/firebase";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";

interface PageDataTableProps {
  data: ContentItem[];
  scores: Record<number, number>;
  isLoading: boolean;
  onDataChange: (token: string) => void;
}

export function PageDataTable({ data, scores, isLoading, onDataChange }: PageDataTableProps) {
  const router = useRouter();
  const [sorting, setSorting] = React.useState<SortingState>([{ id: 'title', desc: false }]);
  const [columnFilters, setColumnFilters] = React.useState<ColumnFiltersState>([]);
  const [expanded, setExpanded] = React.useState<ExpandedState>({});
  const [rowSelection, setRowSelection] = React.useState<RowSelectionState>({});
  const [isActionLoading, setIsActionLoading] = React.useState(false);
  const { toast } = useToast();

  const tableData = React.useMemo((): HierarchicalContentItem[] => {
    if (!data) return [];
    
    const enrichedData = data.map(item => ({ ...item, score: scores[item.id] }));
    
    const itemsById = new Map<number, HierarchicalContentItem>(enrichedData.map((p) => [p.id, { ...p, subRows: [] }]));
    const roots: HierarchicalContentItem[] = [];
    const processedIds = new Set<number>();

    enrichedData.forEach((item) => {
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
                  groupItems.forEach(groupItem => processedIds.add(groupItem.id));
                }
            }
        } else {
            mainItem = itemsById.get(item.id);
        }
        
        if (mainItem) {
            roots.push(mainItem);
            processedIds.add(mainItem.id);
        }
    });

    return roots.sort((a,b) => a.title.localeCompare(b.title));
  }, [data, scores]);

  const handleEditContent = (item: ContentItem) => {
    const editPath = item.type === 'Page' ? `/pages/edit/${item.id}` : 
                     item.type === 'Post' ? `/blog/edit/${item.id}` :
                     `/products/edit/${item.id}`;
    router.push(editPath);
  };

  const handleDeleteContent = async (item: ContentItem) => {
    const user = auth.currentUser;
    if (!user) {
      toast({ title: 'No autenticado', variant: 'destructive' });
      return;
    }
    const token = await user.getIdToken();
    try {
      const endpoint = item.type === 'Page' ? `/api/wordpress/pages/${item.id}` : `/api/wordpress/posts/${item.id}`;
      const response = await fetch(endpoint, { method: 'DELETE', headers: { 'Authorization': `Bearer ${token}` } });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || result.message);
      toast({ title: "Movido a la papelera", description: "El contenido ha sido enviado a la papelera de WordPress." });
      onDataChange(token);
    } catch (e: any) {
      toast({ title: "Error al mover a papelera", description: e.message, variant: "destructive" });
    }
  };

  const columns = React.useMemo(() => getColumns(handleEditContent, handleDeleteContent), [scores]); // eslint-disable-line react-hooks/exhaustive-deps

  const table = useReactTable({
    data: tableData,
    columns,
    state: {
      sorting,
      expanded,
      columnFilters,
      rowSelection,
    },
    onSortingChange: setSorting,
    onExpandedChange: setExpanded,
    onColumnFiltersChange: setColumnFilters,
    onRowSelectionChange: setRowSelection,
    getSubRows: (row) => row.subRows,
    getCoreRowModel: getCoreRowModel(),
    getExpandedRowModel: getExpandedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    getSortedRowModel: getSortedRowModel(),
  });
  
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
        toast({ title: "Contenido movido a la papelera", description: result.message });
        onDataChange(token);
        table.resetRowSelection();
    } catch (e: any) {
        toast({ title: "Error al eliminar", description: e.message, variant: "destructive" });
    } finally {
        setIsActionLoading(false);
    }
  };
  
  const handleBatchSeoMeta = async () => {
    const selectedRows = table.getSelectedRowModel().rows;
    if (selectedRows.length === 0) {
      toast({ title: "Nada seleccionado", description: "Por favor, selecciona al menos una página.", variant: "destructive" });
      return;
    }
    setIsActionLoading(true);
    const user = auth.currentUser;
    if (!user) return;
    const token = await user.getIdToken();
    let successes = 0;
    
    toast({ title: `Procesando ${selectedRows.length} elemento(s) con IA...`, description: "Esto puede tardar un momento." });
    
    for (const row of selectedRows) {
      try {
        const response = await fetch('/api/batch-actions/seo-meta', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
            body: JSON.stringify({ postId: row.original.id, postType: row.original.type })
        });
        if (response.ok) {
          successes++;
        } else {
            console.error(`Fallo para ${row.original.title}:`, await response.json());
        }
      } catch (error) {
        console.error(`Fallo para ${row.original.title}:`, error);
      }
    }
    
    toast({ title: "Proceso Completado", description: `${successes} de ${selectedRows.length} elementos han sido actualizados con metadatos SEO.` });
    setIsActionLoading(false);
    table.resetRowSelection();
  };
  
  const selectedRowCount = Object.keys(rowSelection).length;
  
  const handleEditImages = () => {
    const selectedIds = table.getSelectedRowModel().rows.map(row => row.original.id);
    const postType = table.getSelectedRowModel().rows[0]?.original.type || 'Page'; // Assume all are same type for now
    router.push(`/pages/edit-images?ids=${selectedIds.join(',')}&type=${postType}`);
  };

  const handleRowClick = (row: any) => {
    router.push(`/seo-optimizer/edit/${row.original.id}?type=${row.original.type}`);
  };

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
                value={(table.getColumn('type')?.getFilterValue() as string) ?? 'all'}
                onValueChange={(value) => table.getColumn('type')?.setFilterValue(value === 'all' ? undefined : value)}
            >
                <SelectTrigger className="w-full sm:w-[180px]">
                    <SelectValue placeholder="Filtrar por tipo" />
                </SelectTrigger>
                <SelectContent>
                    <SelectItem value="all">Todos los Tipos</SelectItem>
                    <SelectItem value="Post">Entradas</SelectItem>
                    <SelectItem value="Page">Páginas</SelectItem>
                    <SelectItem value="Producto">Productos</SelectItem>
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
               <DropdownMenuItem onSelect={handleEditImages}>
                <ImageIcon className="mr-2 h-4 w-4" /> Editar Imágenes
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={handleBatchSeoMeta}>
                <Sparkles className="mr-2 h-4 w-4" /> Generar Título y Descripción SEO
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
                      Los elementos seleccionados y todas sus traducciones enlazadas se moverán a la papelera de WordPress.
                  </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                  <AlertDialogCancel>Cancelar</AlertDialogCancel>
                  <AlertDialogAction onClick={handleBatchDelete} className={buttonVariants({variant: "destructive"})}>Sí, mover a la papelera</AlertDialogAction>
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
                      if (!(target instanceof HTMLButtonElement || target instanceof HTMLAnchorElement || target.closest('button, a, [role=checkbox], [role=menuitem]') )) {
                        handleRowClick(row);
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

      <div className="flex items-center justify-end space-x-2 py-4">
        <Button variant="outline" size="sm" onClick={() => table.previousPage()} disabled={!table.getCanPreviousPage()}>Anterior</Button>
        <Button variant="outline" size="sm" onClick={() => table.nextPage()} disabled={!table.getCanNextPage()}>Siguiente</Button>
      </div>
    </div>
  );
}
