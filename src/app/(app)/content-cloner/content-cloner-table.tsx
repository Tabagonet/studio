
"use client";

import * as React from "react";
import {
  ColumnFiltersState,
  flexRender,
  getCoreRowModel,
  getFilteredRowModel,
  useReactTable,
  getSortedRowModel,
  getPaginationRowModel,
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
import type { ContentItem } from "@/lib/types";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2, ChevronDown, Copy, Languages } from "lucide-react";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { Progress } from "@/components/ui/progress";
import { ScrollArea } from "@/components/ui/scroll-area";

type CloningStatus = 'pending' | 'cloning' | 'translating' | 'updating' | 'success' | 'failed' | 'skipped';
type CloningProgress = Record<string, { title: string; status: CloningStatus; message: string; progress: number }>;

const LANG_CODE_MAP: { [key: string]: string } = {
    'es': 'Español', 'en': 'Inglés', 'fr': 'Francés',
    'de': 'Alemán', 'pt': 'Portugués', 'it': 'Italiano',
};

const CloningProgressDialog = ({ open, progressData, onDone }: { open: boolean, progressData: CloningProgress, onDone: () => void }) => {
    const isDone = React.useMemo(() => 
        Object.values(progressData).every(p => ['success', 'failed', 'skipped'].includes(p.status)),
    [progressData]);
    
    const getStatusColor = (status: CloningStatus) => {
        switch(status) {
            case 'success': return 'text-green-500';
            case 'failed': return 'text-destructive';
            case 'skipped': return 'text-blue-500';
            default: return 'text-muted-foreground';
        }
    }
    const getStatusLabel = (status: CloningStatus) => {
        const labels: Record<CloningStatus, string> = {
            pending: 'En cola',
            cloning: 'Clonando',
            translating: 'Traduciendo',
            updating: 'Actualizando',
            success: 'Completado',
            failed: 'Fallido',
            skipped: 'Omitido',
        };
        return labels[status];
    };

    return (
        <Dialog open={open}>
            <DialogContent className="max-w-2xl">
                <DialogHeader>
                    <DialogTitle>Proceso de Clonación en Lote</DialogTitle>
                    <DialogDescription>
                        {isDone ? 'El proceso ha finalizado.' : 'Clonando y traduciendo el contenido seleccionado...'}
                    </DialogDescription>
                </DialogHeader>
                <ScrollArea className="max-h-[60vh] my-4 pr-4">
                    <div className="space-y-4">
                        {Object.entries(progressData).map(([id, item]) => (
                            <div key={id}>
                                <div className="flex justify-between items-center mb-1">
                                    <p className="text-sm font-medium truncate pr-4">{item.title}</p>
                                    <p className={`text-sm font-semibold capitalize ${getStatusColor(item.status)}`}>
                                        {getStatusLabel(item.status)}
                                    </p>
                                </div>
                                <Progress value={item.progress} />
                                <p className="text-xs text-muted-foreground mt-1">{item.message}</p>
                            </div>
                        ))}
                    </div>
                </ScrollArea>
                <DialogFooter>
                    <Button onClick={onDone} disabled={!isDone}>Cerrar</Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
};


export function ContentClonerTable() {
  const [data, setData] = React.useState<ContentItem[]>([]);
  const [isLoading, setIsLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);

  const [sorting, setSorting] = React.useState<SortingState>([{ id: 'title', desc: false }]);
  const [columnFilters, setColumnFilters] = React.useState<ColumnFiltersState>([]);
  const [rowSelection, setRowSelection] = React.useState<RowSelectionState>({});
  const [pagination, setPagination] = React.useState({ pageIndex: 0, pageSize: 15 });
  const [totalPages, setTotalPages] = React.useState(1);

  const [isCloneDialogOpen, setIsCloneDialogOpen] = React.useState(false);
  const [targetLang, setTargetLang] = React.useState<string>("");
  const [isCloning, setIsCloning] = React.useState(false);
  const [isProgressDialogOpen, setIsProgressDialogOpen] = React.useState(false);
  const [cloningProgress, setCloningProgress] = React.useState<CloningProgress>({});

  const { toast } = useToast();
  
  const availableTargetLanguages = React.useMemo(() => {
    const langSet = new Set<string>();
    data.forEach(item => {
        if (item.lang && item.lang !== 'default') langSet.add(item.lang);
    });
    return Array.from(langSet).map(code => ({ code, name: LANG_CODE_MAP[code] || code.toUpperCase() }));
  }, [data]);

  const fetchData = React.useCallback(async (pageIndex: number, pageSize: number) => {
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
      
      const response = await fetch(`/api/wordpress/content-list?page=${pageIndex + 1}&per_page=${pageSize}`, { 
          headers: { 'Authorization': `Bearer ${token}` }
      });
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'No se pudo cargar el contenido del sitio.');
      }
      const { content, total, totalPages: pages } = await response.json();
      setData(content);
      setTotalPages(pages || 1);

    } catch (err: any) {
      setError(err.message);
      setData([]);
    } finally {
      setIsLoading(false);
    }
  }, []);

  React.useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      if (user) {
        fetchData(pagination.pageIndex, pagination.pageSize);
      }
    });
     window.addEventListener('connections-updated', () => { if (auth.currentUser) fetchData(pagination.pageIndex, pagination.pageSize) });
    return () => {
      unsubscribe();
      window.removeEventListener('connections-updated', () => { if (auth.currentUser) fetchData(pagination.pageIndex, pagination.pageSize) });
    };
  }, [fetchData, pagination]);

  const handleBatchClone = async () => {
    setIsCloning(true);
    setIsCloneDialogOpen(false);
    
    const selectedRows = table.getSelectedRowModel().rows;
    const itemsToClone = selectedRows.map(row => row.original);
    
    if (itemsToClone.length === 0 || !targetLang) {
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

    const initialProgress: CloningProgress = {};
    itemsToClone.forEach(item => {
        initialProgress[item.id] = { title: item.title, status: 'pending', message: 'En cola...', progress: 0 };
    });
    setCloningProgress(initialProgress);
    setIsProgressDialogOpen(true);

    try {
        const token = await user.getIdToken();
        const response = await fetch('/api/wordpress/content-cloner/clone', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
            body: JSON.stringify({ items: itemsToClone, target_lang: targetLang })
        });
        
        if (!response.body) {
          throw new Error("La respuesta no es un stream.");
        }

        const reader = response.body.getReader();
        const decoder = new TextDecoder();

        while(true) {
          const { value, done } = await reader.read();
          if (done) break;
          
          const chunk = decoder.decode(value, { stream: true });
          const jsonObjects = chunk.split('\n').filter(s => s.trim() !== '');

          jsonObjects.forEach(jsonStr => {
            try {
              const update = JSON.parse(jsonStr);
              setCloningProgress(prev => ({
                ...prev,
                [update.id]: {
                  ...prev[update.id],
                  status: update.status,
                  message: update.message,
                  progress: update.progress
                }
              }));
            } catch (e) {
                console.error("Error parsing JSON chunk from stream:", jsonStr, e);
            }
          });
        }
        
        toast({ title: "Proceso finalizado", description: "La clonación en lote ha terminado. Revisa los resultados en el diálogo." });
        fetchData(pagination.pageIndex, pagination.pageSize); // Refresh data
        table.resetRowSelection();

    } catch (error: any) {
        toast({ title: 'Error al Clonar', description: error.message, variant: 'destructive' });
        setIsProgressDialogOpen(false);
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
      columnFilters,
      rowSelection,
      pagination,
    },
    onSortingChange: setSorting,
    onColumnFiltersChange: setColumnFilters,
    onRowSelectionChange: setRowSelection,
    onPaginationChange: setPagination,
    getCoreRowModel: getCoreRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    pageCount: totalPages,
    manualPagination: true,
  });

  const selectedRowCount = table.getFilteredSelectedRowModel().rows.length;

  return (
    <div className="space-y-4">
        <AlertDialog open={isCloneDialogOpen} onOpenChange={setIsCloneDialogOpen}>
            <AlertDialogContent>
                <AlertDialogHeader>
                    <AlertDialogTitle>Clonar y Traducir Contenido</AlertDialogTitle>
                    <AlertDialogDescription>
                        Has seleccionado {selectedRowCount} elemento(s). Por favor, elige el idioma al que deseas clonar y traducir este contenido. La herramienta omitirá automáticamente los elementos que ya tengan una traducción a ese idioma.
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

        <CloningProgressDialog 
            open={isProgressDialogOpen} 
            progressData={cloningProgress} 
            onDone={() => {
                setIsProgressDialogOpen(false);
                setCloningProgress({});
            }}
        />

        <div className="flex flex-col md:flex-row items-center justify-between gap-4">
             <div className="flex flex-wrap gap-2 w-full md:w-auto">
                <Input
                  placeholder="Filtrar por título..."
                  value={(table.getColumn('title')?.getFilterValue() as string) ?? ''}
                  onChange={(event) => table.getColumn('title')?.setFilterValue(event.target.value)}
                  className="w-full sm:w-auto sm:min-w-[200px] flex-grow"
                />
                 <Select
                    value={(table.getColumn('type')?.getFilterValue() as string) ?? 'all'}
                    onValueChange={(value) => table.getColumn('type')?.setFilterValue(value === 'all' ? undefined : value)}
                >
                    <SelectTrigger className="w-full sm:w-auto sm:min-w-[180px] flex-grow">
                        <SelectValue placeholder="Filtrar por tipo..." />
                    </SelectTrigger>
                    <SelectContent>
                        <SelectItem value="all">Todos los Tipos</SelectItem>
                        <SelectItem value="Post">Entradas</SelectItem>
                        <SelectItem value="Page">Páginas</SelectItem>
                        <SelectItem value="Producto">Productos</SelectItem>
                    </SelectContent>
                </Select>
                 <Select
                    value={(table.getColumn('lang')?.getFilterValue() as string) ?? 'all'}
                    onValueChange={(value) => table.getColumn('lang')?.setFilterValue(value === 'all' ? undefined : value)}
                >
                    <SelectTrigger className="w-full sm:w-auto sm:min-w-[180px] flex-grow">
                         <Languages className="mr-2 h-4 w-4" />
                        <SelectValue placeholder="Filtrar por idioma..." />
                    </SelectTrigger>
                    <SelectContent>
                        <SelectItem value="all">Todos los Idiomas</SelectItem>
                         {availableTargetLanguages.map(lang => (
                            <SelectItem key={lang.code} value={lang.code}>{lang.name}</SelectItem>
                        ))}
                    </SelectContent>
                </Select>
            </div>
            <DropdownMenu>
                <DropdownMenuTrigger asChild>
                    <Button variant="outline" disabled={selectedRowCount === 0 || isCloning} className="w-full md:w-auto">
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
