
"use client";

import * as React from "react";
import {
  ColumnFiltersState,
  flexRender,
  getCoreRowModel,
  getFilteredRowModel,
  useReactTable,
  getExpandedRowModel,
  getSortedRowModel,
  getPaginationRowModel,
  type ExpandedState,
  type RowSelectionState,
  type SortingState,
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
import { Label } from "@/components/ui/label";
import { getColumns } from "./columns"; 
import type { ContentItem as RawContentItem } from "@/lib/types";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2, ChevronDown, Copy } from "lucide-react";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";

type ContentItem = RawContentItem & { subRows: ContentItem[] };

export function ContentClonerTable() {
  const [data, setData] = React.useState<ContentItem[]>([]);
  const [isLoading, setIsLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);

  const [sorting, setSorting] = React.useState<SortingState>([{ id: 'title', desc: false }]);
  const [columnFilters, setColumnFilters] = React.useState<ColumnFiltersState>([]);
  const [expanded, setExpanded] = React.useState<ExpandedState>({});
  const [rowSelection, setRowSelection] = React.useState<RowSelectionState>({});
  const [pagination, setPagination] = React.useState({ pageIndex: 0, pageSize: 10 });


  const [isCloneDialogOpen, setIsCloneDialogOpen] = React.useState(false);
  const [targetLang, setTargetLang] = React.useState<string>("");
  const [isCloning, setIsCloning] = React.useState(false);


  const { toast } = useToast();

  const availableTargetLanguages = React.useMemo(() => {
    const langSet = new Set<string>();
    data.forEach(item => {
        if (item.lang && item.lang !== 'default') langSet.add(item.lang);
        item.subRows?.forEach(sub => {
            if (sub.lang && sub.lang !== 'default') langSet.add(sub.lang);
        })
    });

    const langMap: { [key: string]: string } = {
        es: 'Español',
        en: 'Inglés',
        fr: 'Francés',
        de: 'Alemán',
        pt: 'Portugués',
        it: 'Italiano',
    };

    return Array.from(langSet).map(code => ({ code, name: langMap[code] || code.toUpperCase() }));
  }, [data]);

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

  const handleBatchClone = async () => {
    setIsCloning(true);
    const selectedRows = table.getSelectedRowModel().rows;
    const post_ids = selectedRows.map(row => row.original.id);
    
    if (post_ids.length === 0 || !targetLang) {
      toast({ title: "Datos incompletos", description: "Selecciona contenido y un idioma de destino.", variant: "destructive" });
      setIsCloning(false);
      return;
    }
    
    const user = auth.currentUser;
    if (!user) {
        toast({ title: "No autenticado", variant: "destructive" });
        setIsCloning(false);
        return;
    }

    try {
        const token = await user.getIdToken();
        toast({ title: `Iniciando clonación y traducción...`, description: `Procesando ${post_ids.length} elemento(s). Esto puede tardar.` });

        const response = await fetch('/api/wordpress/content-cloner/clone', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
            body: JSON.stringify({ post_ids, target_lang: targetLang })
        });

        const result = await response.json();
        if (!response.ok) {
            throw new Error(result.message || 'Error en el servidor al clonar.');
        }

        const successCount = result.data?.success?.length || 0;
        const failedCount = result.data?.failed?.length || 0;

        toast({
            title: "¡Clonación en Lote Exitosa!",
            description: `${successCount} elemento(s) clonado(s) y ${failedCount} fallido(s).`,
            variant: failedCount > 0 ? "destructive" : "default"
        });

        fetchData(); // Refresh the table
        table.resetRowSelection();
        setIsCloneDialogOpen(false);
    } catch (error: any) {
        toast({ title: 'Error al Clonar', description: error.message, variant: 'destructive' });
    } finally {
        setIsCloning(false);
    }
  };

  const columns = React.useMemo(() => getColumns(), []);

  const table = useReactTable({
    data,
    columns,
    state: {
      sorting,
      expanded,
      columnFilters,
      rowSelection,
      pagination,
    },
    onSortingChange: setSorting,
    onExpandedChange: setExpanded,
    onColumnFiltersChange: setColumnFilters,
    onRowSelectionChange: setRowSelection,
    onPaginationChange: setPagination,
    getSubRows: (row) => row.subRows,
    getCoreRowModel: getCoreRowModel(),
    getExpandedRowModel: getExpandedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
  });

  const selectedRowCount = table.getFilteredSelectedRowModel().rows.length;

  return (
    <div className="space-y-4">
        <AlertDialog open={isCloneDialogOpen} onOpenChange={setIsCloneDialogOpen}>
            <AlertDialogContent>
                <AlertDialogHeader>
                    <AlertDialogTitle>Clonar y Traducir Contenido</AlertDialogTitle>
                    <AlertDialogDescription>
                        Has seleccionado {selectedRowCount} elemento(s). Por favor, elige el idioma al que deseas clonar y traducir este contenido.
                    </AlertDialogDescription>
                </AlertDialogHeader>
                <div className="py-4">
                    <Label htmlFor="language-select">Idioma de Destino</Label>
                     <Select value={targetLang} onValueChange={setTargetLang}>
                        <SelectTrigger id="language-select">
                           <SelectValue placeholder="Selecciona un idioma..." />
                        </SelectTrigger>
                        <SelectContent>
                             {availableTargetLanguages.map(lang => (
                                <SelectItem key={lang.code} value={lang.code}>{lang.name}</SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                </div>
                <AlertDialogFooter>
                    <AlertDialogCancel onClick={() => setIsCloneDialogOpen(false)}>Cancelar</AlertDialogCancel>
                    <AlertDialogAction onClick={handleBatchClone} disabled={!targetLang || isCloning}>
                        {isCloning && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                        {isCloning ? 'Procesando...' : 'Iniciar Clonación'}
                    </AlertDialogAction>
                </AlertDialogFooter>
            </AlertDialogContent>
        </AlertDialog>

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
                    <Button variant="outline" disabled={selectedRowCount === 0 || isCloning}>
                        <ChevronDown className="mr-2 h-4 w-4" />
                        Acciones ({selectedRowCount})
                    </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                    <DropdownMenuItem onSelect={() => setIsCloneDialogOpen(true)}>
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
      <div className="flex items-center justify-between space-x-2 py-4">
        <div className="flex-1 text-sm text-muted-foreground">
          {table.getFilteredSelectedRowModel().rows.length} de{" "}
          {table.getFilteredRowModel().rows.length} fila(s) seleccionadas.
        </div>
        <div className="flex items-center space-x-2">
            <span className="text-sm font-medium">
                Página {table.getState().pagination.pageIndex + 1} de{' '}
                {table.getPageCount()}
            </span>
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
    </div>
  );
}
