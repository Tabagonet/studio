
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
import { Loader2, ChevronDown, Trash2, Sparkles, Edit, Image as ImageIcon, Link2, Languages, X, Eye, EyeOff } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, DropdownMenuSeparator, DropdownMenuLabel } from "@/components/ui/dropdown-menu";
import { useToast } from "@/hooks/use-toast";
import { auth } from "@/lib/firebase";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { useDebounce } from "@/hooks/use-debounce";


interface PageDataTableProps {
  data: ContentItem[];
  scores: Record<number, number>;
  isLoading: boolean;
  onDataChange: (token: string, force: boolean) => void;
}

const LANGUAGE_MAP: { [key: string]: string } = {
    es: 'Español',
    en: 'Inglés',
    fr: 'Francés',
    de: 'Alemán',
    pt: 'Portugués',
};


export function PageDataTable({
  data,
  scores,
  isLoading,
  onDataChange,
}: PageDataTableProps) {
  const router = useRouter();
  const [sorting, setSorting] = React.useState<SortingState>([{ id: 'title', desc: false }]);
  const [columnFilters, setColumnFilters] = React.useState<ColumnFiltersState>([]);
  const [expanded, setExpanded] = React.useState<ExpandedState>({});
  const [rowSelection, setRowSelection] = React.useState<RowSelectionState>({});
  const [isActionLoading, setIsActionLoading] = React.useState(false);
  const [userRole, setUserRole] = React.useState<string | null>(null);
  const { toast } = useToast();

  React.useEffect(() => {
    const fetchUserRole = async () => {
      const user = auth.currentUser;
      if (user) {
        const tokenResult = await user.getIdTokenResult();
        const customRole = (tokenResult.claims.role as string) || 'user';
        setUserRole(customRole);
      }
    };
    
    fetchUserRole();
    const unsubscribe = auth.onAuthStateChanged((user) => {
        if (user) fetchUserRole();
        else setUserRole(null);
    });

    return () => unsubscribe();
  }, []);

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
        
        if (mainItem && !processedIds.has(mainItem.id)) {
            roots.push(mainItem);
            processedIds.add(mainItem.id);
        }
    });

    return roots.sort((a,b) => a.title.localeCompare(b.title));
  }, [data, scores]);

  const handleEditContent = (item: ContentItem) => {
    router.push(`/pages/edit/${item.id}`);
  };
  
  const handleEditImages = (item: ContentItem) => {
    router.push(`/pages/edit-images?ids=${item.id}&type=${item.type}`);
  };

  const handleDeleteContent = async (item: ContentItem) => {
    const user = auth.currentUser;
    if (!user) {
      toast({ title: 'No autenticado', variant: 'destructive' });
      return;
    }
    const token = await user.getIdToken();
    try {
      const endpoint = `/api/wordpress/pages/${item.id}`;
      const response = await fetch(endpoint, { method: 'DELETE', headers: { 'Authorization': `Bearer ${token}` } });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || result.message);
      toast({ title: "Movido a la papelera", description: "El contenido ha sido enviado a la papelera de WordPress." });
      onDataChange(token, true);
    } catch (e: any) {
      toast({ title: "Error al mover a papelera", description: e.message, variant: "destructive" });
    }
  };

  const columns = React.useMemo(() => getColumns(handleEditContent, handleDeleteContent, handleEditImages), []); 

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
  
  const handleBatchStatusUpdate = async (status: 'publish' | 'draft') => {
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
            body: JSON.stringify({ postIds: uniqueIds, action: 'update', updates: { status } })
        });
        const result = await response.json();
        if (!response.ok) throw new Error(result.error || result.message);
        toast({ title: `Estado actualizado a "${status}"`, description: result.message });
        onDataChange(token, true);
        table.resetRowSelection();
    } catch (e: any) {
        toast({ title: "Error al actualizar estado", description: e.message, variant: "destructive" });
    } finally {
        setIsActionLoading(false);
    }
  };


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
        onDataChange(token, true);
        table.resetRowSelection();
    } catch (e: any) {
        toast({ title: "Error al eliminar", description: e.message, variant: "destructive" });
    } finally {
        setIsActionLoading(false);
    }
  };
  
  const handleBatchLinkTranslations = async () => {
    setIsActionLoading(true);
    const selectedRows = table.getSelectedRowModel().rows;
    
    if (selectedRows.length < 2) {
        toast({ title: "Selección insuficiente", description: "Debes seleccionar al menos dos elementos para enlazarlos.", variant: "destructive" });
        setIsActionLoading(false);
        return;
    }

    const languages = selectedRows.map((row) => row.original.lang);
    if (new Set(languages).size !== languages.length) {
        toast({ title: "Idiomas duplicados", description: "No puedes enlazar dos elementos del mismo idioma.", variant: "destructive" });
        setIsActionLoading(false);
        return;
    }
    
    const translations: Record<string, number> = {};
    selectedRows.forEach((row) => {
        if(row.original.lang) {
            translations[row.original.lang] = row.original.id;
        }
    });

    const user = auth.currentUser;
    if (!user) {
        setIsActionLoading(false);
        return;
    }

    toast({ title: `Enlazando ${selectedRows.length} elemento(s)...` });
    try {
        const token = await user.getIdToken();
        const response = await fetch('/api/wordpress/posts/link-translations', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
            body: JSON.stringify({ translations })
        });

        const result = await response.json();
        if (!response.ok) {
            throw new Error(result.error || result.message || 'Fallo el enlace de traducciones.');
        }

        toast({ title: "¡Traducciones enlazadas!", description: result.message });
        table.resetRowSelection();
        onDataChange(token, true);
    } catch (error: any) {
         toast({ title: "Error al enlazar", description: error.message, variant: "destructive" });
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
  
  const handleBatchEditImages = () => {
    const selectedIds = table.getSelectedRowModel().rows.map(row => row.original.id);
    router.push(`/pages/edit-images?ids=${selectedIds.join(',')}&type=Page`);
  };

  const handleRowClick = (row: any) => {
    router.push(`/seo-optimizer?id=${row.original.id}&type=${row.original.type}`);
  };
  
  const availableLanguages = React.useMemo(() => {
    const langSet = new Set<string>();
    data.forEach(item => {
        if (item.lang && item.lang !== 'default') langSet.add(item.lang);
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
                value={(table.getColumn('type')?.getFilterValue() as string) ?? 'all'}
                onValueChange={(value) => table.getColumn('type')?.setFilterValue(value === 'all' ? undefined : value)}
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
              <DropdownMenuItem onSelect={() => handleBatchStatusUpdate('publish')}>
                <Eye className="mr-2 h-4 w-4" /> Hacer Visibles
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={() => handleBatchStatusUpdate('draft')}>
                <EyeOff className="mr-2 h-4 w-4" /> Ocultar (Borrador)
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={handleBatchSeoMeta}>
                <Sparkles className="mr-2 h-4 w-4" /> Generar Título y Descripción SEO
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={handleBatchLinkTranslations} disabled={selectedRowCount < 2}>
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
                      if (!(target instanceof HTMLButtonElement || target.tagName === 'A' || target.closest('button, a, [role=checkbox], [role=menuitem]') )) {
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
              <TableRow><TableCell colSpan={columns.length} className="h-24 text-center">No se encontraron resultados para los filtros seleccionados.</TableCell></TableRow>
            )}
          </TableBody>
        </Table>
      </div>
      
       <div className="flex items-center justify-between space-x-2 py-4">
        <div className="flex-1 text-sm text-muted-foreground">
          {table.getFilteredSelectedRowModel().rows.length} de{" "}
          {table.getCoreRowModel().rows.length} fila(s) seleccionadas.
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
