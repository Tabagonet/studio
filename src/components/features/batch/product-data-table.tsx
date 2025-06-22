
"use client"

import * as React from "react"
import {
  ColumnDef,
  ColumnFiltersState,
  SortingState,
  flexRender,
  getCoreRowModel,
  getFilteredRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  useReactTable,
} from "@tanstack/react-table"
import { useToast } from "@/hooks/use-toast"
import { auth } from "@/lib/firebase"

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { getColumns } from "./columns" 
import type { ProductSearchResult, WooCommerceCategory, ProductStats } from "@/lib/types"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { BrainCircuit, ChevronDown, Loader2, Box, FileCheck2, FileText, BarChart3, Eye, EyeOff, Image as ImageIcon } from "lucide-react"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import { ProductEditModal } from "./product-edit-modal"
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog"
import { ScrollArea } from "@/components/ui/scroll-area"


export function ProductDataTable() {
  const [data, setData] = React.useState<ProductSearchResult[]>([])
  const [isLoading, setIsLoading] = React.useState(true)
  const [isAiProcessing, setIsAiProcessing] = React.useState(false);
  const [isUpdatingStatus, setIsUpdatingStatus] = React.useState(false);
  const [totalPages, setTotalPages] = React.useState(1)
  
  const [categories, setCategories] = React.useState<WooCommerceCategory[]>([]);
  const [categoryTree, setCategoryTree] = React.useState<{ category: WooCommerceCategory; depth: number }[]>([]);
  const [isLoadingCategories, setIsLoadingCategories] = React.useState(false);

  const [stats, setStats] = React.useState<ProductStats | null>(null);
  const [isLoadingStats, setIsLoadingStats] = React.useState(true);

  // Filter states
  const [selectedCategory, setSelectedCategory] = React.useState('all');
  const [selectedStatus, setSelectedStatus] = React.useState('all');
  const [selectedStockStatus, setSelectedStockStatus] = React.useState('all');

  const [sorting, setSorting] = React.useState<SortingState>([
    { id: 'date_created', desc: true }
  ]);
  const [columnFilters, setColumnFilters] = React.useState<ColumnFiltersState>([])
  const [rowSelection, setRowSelection] = React.useState({})
  
  const [pagination, setPagination] = React.useState({
    pageIndex: 0, 
    pageSize: 10, 
  })
  
  const [editingProductId, setEditingProductId] = React.useState<number | null>(null);

  const [confirmationData, setConfirmationData] = React.useState<{
    products: { id: number; name: string; reason: string }[];
    action: 'generateDescriptions' | 'generateImageMetadata';
    productIds: number[];
  } | null>(null);

  const { toast } = useToast()

  const fetchStats = React.useCallback(async () => {
    setIsLoadingStats(true);
    const user = auth.currentUser;
    if (!user) {
        setIsLoadingStats(false);
        return;
    }
    try {
        const token = await user.getIdToken();
        const response = await fetch('/api/woocommerce/products/stats', {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        if (!response.ok) {
            console.error("Failed to fetch product stats:", await response.text());
            setStats(null);
            return;
        }
        const data = await response.json();
        setStats(data);
    } catch (error) {
        console.error(error);
        setStats(null);
    } finally {
        setIsLoadingStats(false);
    }
  }, []);

  const fetchData = React.useCallback(async () => {
    setIsLoading(true);
    const user = auth.currentUser;
    if (!user) {
      toast({ title: "No autenticado", description: "Por favor, inicie sesión.", variant: "destructive" });
      setIsLoading(false);
      return;
    }

    try {
      const token = await user.getIdToken();
      const nameFilter = columnFilters.find(f => f.id === 'name') as { id: string; value: string } | undefined;
      const sort = sorting[0];

      const params = new URLSearchParams({
        page: (pagination.pageIndex + 1).toString(),
        per_page: pagination.pageSize.toString(),
        category: selectedCategory,
        status: selectedStatus,
        stock_status: selectedStockStatus,
      });

      if (nameFilter?.value) {
        params.append('q', nameFilter.value);
      }
      if (sort) {
        const orderbyValue = sort.id === 'date_created' ? 'date' : sort.id;
        params.append('orderby', orderbyValue);
        params.append('order', sort.desc ? 'desc' : 'asc');
      }


      const response = await fetch(`/api/woocommerce/products/search-products?${params.toString()}`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to fetch products');
      }

      const { products, totalPages } = await response.json();
      setData(products);
      setTotalPages(totalPages);
    } catch (error) {
      console.error(error);
      toast({ title: "Error", description: (error as Error).message, variant: "destructive" });
    } finally {
      setIsLoading(false);
    }
  }, [pagination, columnFilters, selectedCategory, selectedStatus, selectedStockStatus, sorting, toast]); 

  React.useEffect(() => {
    const fetchCats = async (token: string) => {
      setIsLoadingCategories(true);
      try {
        const response = await fetch('/api/woocommerce/categories', {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        if (!response.ok) throw new Error('Failed to load categories');
        const data = await response.json();
        setCategories(data);
      } catch (error) {
        console.error(error);
        toast({ title: "Error al Cargar Categorías", description: (error as Error).message, variant: "destructive" });
      } finally {
        setIsLoadingCategories(false);
      }
    };
    
    const unsubscribe = auth.onAuthStateChanged((user) => {
        if (user) {
            fetchData();
            fetchStats();
            user.getIdToken().then(fetchCats);
        } else {
            setIsLoading(false);
            setData([]);
        }
    });
    return () => unsubscribe();
  }, [fetchData, fetchStats, toast]);

  React.useEffect(() => {
    if (categories.length === 0) return;
    const buildTree = (parentId = 0, depth = 0): { category: WooCommerceCategory; depth: number }[] => {
      const children = categories.filter(cat => cat.parent === parentId).sort((a, b) => a.name.localeCompare(b.name));
      let result: { category: WooCommerceCategory; depth: number }[] = [];
      for (const child of children) {
        result.push({ category: child, depth });
        result = result.concat(buildTree(child.id, depth + 1));
      }
      return result;
    };
    setCategoryTree(buildTree());
  }, [categories]);

  const handleStatusUpdate = React.useCallback(async (productId: number, newStatus: 'publish' | 'draft') => {
    const user = auth.currentUser;
    if (!user) {
      toast({ title: "No autenticado", variant: "destructive" });
      return;
    }
    
    const actionText = newStatus === 'publish' ? 'publicando' : 'ocultando';
    toast({ title: `Actualizando estado...`, description: `Se está ${actionText} el producto.` });

    try {
      const token = await user.getIdToken();
      const response = await fetch(`/api/woocommerce/products/${productId}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ status: newStatus })
      });
      
      const result = await response.json();
      if (!response.ok) {
        throw new Error(result.error || `Error al ${actionText} el producto.`);
      }
      
      toast({ title: "¡Éxito!", description: "El estado del producto ha sido actualizado." });
      fetchData();
      fetchStats();
    } catch (error) {
      console.error(error);
      toast({ title: "Error", description: (error as Error).message, variant: "destructive" });
    }
  }, [toast, fetchData, fetchStats]);

  const handleDeleteProduct = React.useCallback(async (productId: number) => {
    const user = auth.currentUser;
    if (!user) {
      toast({ title: "No autenticado", variant: "destructive" });
      return;
    }

    toast({ title: `Eliminando producto...` });

    try {
      const token = await user.getIdToken();
      const response = await fetch(`/api/woocommerce/products/${productId}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${token}` },
      });

      const result = await response.json();
      if (!response.ok) {
        throw new Error(result.error || 'Error al eliminar el producto.');
      }

      toast({ title: "¡Producto Eliminado!", description: "El producto se ha eliminado permanentemente." });
      fetchData();
      fetchStats();
    } catch (error) {
      console.error('Error deleting product:', error);
      toast({ title: "Error al Eliminar", description: (error as Error).message, variant: "destructive" });
    }
  }, [toast, fetchData, fetchStats]);

  const handleEditProduct = (productId: number) => {
    setEditingProductId(productId);
  };
  
  const handleCloseModal = (refresh: boolean) => {
    setEditingProductId(null);
    if (refresh) {
      fetchData();
      fetchStats();
    }
  };

  const columns = React.useMemo(() => getColumns(handleStatusUpdate, handleEditProduct, handleDeleteProduct), [handleStatusUpdate, handleDeleteProduct]);

  const table = useReactTable({
    data,
    columns,
    onSortingChange: setSorting,
    onColumnFiltersChange: setColumnFilters,
    getCoreRowModel: getCoreRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    onRowSelectionChange: setRowSelection,
    manualPagination: true,
    manualFiltering: true,
    manualSorting: true,
    pageCount: totalPages,
    onPaginationChange: setPagination,
    state: {
      sorting,
      columnFilters,
      rowSelection,
      pagination,
    },
  })

  const handleAiAction = async (action: 'generateDescriptions' | 'generateImageMetadata', force = false) => {
    const selectedRows = table.getSelectedRowModel().rows;
    const productIds = force && confirmationData ? confirmationData.productIds : selectedRows.map(row => row.original.id);

    if (productIds.length === 0) {
      toast({ title: "No hay productos seleccionados", variant: "destructive" });
      return;
    }
    
    setIsAiProcessing(true);
    const user = auth.currentUser;
    if (!user) {
        toast({ title: "No autenticado", variant: "destructive" });
        setIsAiProcessing(false);
        return;
    }

    const actionText = action === 'generateDescriptions' ? 'descripciones' : 'metadatos de imagen';

    toast({
        title: "Procesando con IA...",
        description: `Generando ${actionText} para ${productIds.length} producto(s). Esto puede tardar.`,
    });

    try {
        const token = await user.getIdToken();
        const response = await fetch('/api/process-photos', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`,
            },
            body: JSON.stringify({ productIds, action, force }),
        });

        const result = await response.json();
        if (!response.ok) {
            if (response.status === 409 && result.confirmationRequired) {
                toast.dismiss(); // Hide "processing" toast
                setConfirmationData({
                    products: result.products,
                    action: action,
                    productIds: productIds,
                });
            } else {
                throw new Error(result.error || result.message || 'Fallo la acción en lote.');
            }
        } else {
            toast({
                title: "¡Acción completada!",
                description: result.message,
            });
            table.resetRowSelection();
            fetchData();
            fetchStats();
        }

    } catch (error: any) {
        toast({
            title: "Error en la acción de IA",
            description: error.message,
            variant: "destructive",
        });
    } finally {
        setIsAiProcessing(false);
        if (force) {
            setConfirmationData(null);
        }
    }
  }

  const handleBatchStatusUpdate = async (status: 'publish' | 'draft') => {
    const selectedRows = table.getSelectedRowModel().rows;
    if (selectedRows.length === 0) {
      toast({ title: "No hay productos seleccionados", variant: "destructive" });
      return;
    }
    
    setIsUpdatingStatus(true);
    const productIds = selectedRows.map(row => row.original.id);
    const user = auth.currentUser;
    if (!user) {
        toast({ title: "No autenticado", variant: "destructive" });
        setIsUpdatingStatus(false);
        return;
    }

    const actionText = status === 'publish' ? 'publicando' : 'ocultando';
    toast({
        title: "Actualizando en lote...",
        description: `Se están ${actionText} ${productIds.length} producto(s).`,
    });

    try {
        const token = await user.getIdToken();
        const response = await fetch('/api/woocommerce/products/batch-update', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`,
            },
            body: JSON.stringify({ productIds, status }),
        });

        const result = await response.json();
        if (!response.ok) {
            throw new Error(result.error || result.message || 'Fallo la acción en lote.');
        }
        
        toast({
            title: "¡Acción completada!",
            description: result.message,
        });

        table.resetRowSelection();
        fetchData();
        fetchStats();

    } catch (error: any) {
        toast({
            title: "Error en la acción en lote",
            description: error.message,
            variant: "destructive",
        });
    } finally {
        setIsUpdatingStatus(false);
    }
  }

  const selectedRowCount = Object.keys(rowSelection).length;
  const isActionRunning = isAiProcessing || isUpdatingStatus;

  const getButtonText = () => {
    if (isAiProcessing) return "Procesando IA...";
    if (isUpdatingStatus) return "Actualizando...";
    return `Acciones (${selectedRowCount})`;
  };

  return (
    <div className="w-full space-y-4">
      {editingProductId && (
        <ProductEditModal
          productId={editingProductId}
          onClose={handleCloseModal}
        />
      )}
      <AlertDialog open={!!confirmationData} onOpenChange={(open) => !open && setConfirmationData(null)}>
        <AlertDialogContent>
            <AlertDialogHeader>
                <AlertDialogTitle>Confirmar Sobrescritura</AlertDialogTitle>
                <AlertDialogDescription>
                    Los siguientes productos ya tienen datos. ¿Estás seguro de que quieres que la IA los sobrescriba? Esta acción no se puede deshacer.
                </AlertDialogDescription>
            </AlertDialogHeader>
            <ScrollArea className="max-h-40 my-4 border rounded-md p-2">
                <ul className="text-sm space-y-1">
                    {confirmationData?.products.map(p => (
                        <li key={p.id}>
                            <strong>{p.name}</strong>: <span className="text-muted-foreground">{p.reason}</span>
                        </li>
                    ))}
                </ul>
            </ScrollArea>
            <AlertDialogFooter>
                <AlertDialogCancel onClick={() => setConfirmationData(null)}>Cancelar</AlertDialogCancel>
                <AlertDialogAction 
                    onClick={() => {
                        if (confirmationData) {
                            handleAiAction(confirmationData.action, true);
                        }
                    }}
                >
                    Sí, sobrescribir todo
                </AlertDialogAction>
            </AlertDialogFooter>
        </AlertDialogContent>
    </AlertDialog>
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total de Productos</CardTitle>
            <Box className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            {isLoadingStats ? <Skeleton className="h-8 w-16" /> : <div className="text-2xl font-bold">{stats?.total ?? 'N/A'}</div>}
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Publicados</CardTitle>
            <FileCheck2 className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            {isLoadingStats ? <Skeleton className="h-8 w-16" /> : <div className="text-2xl font-bold">{stats?.status?.publish ?? 'N/A'}</div>}
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Borradores</CardTitle>
            <FileText className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            {isLoadingStats ? <Skeleton className="h-8 w-16" /> : <div className="text-2xl font-bold">{stats?.status?.draft ?? 'N/A'}</div>}
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Tipos (S/V/A)</CardTitle>
            <BarChart3 className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            {isLoadingStats ? <Skeleton className="h-8 w-24" /> : <div className="text-2xl font-bold">{`${stats?.type?.simple ?? 'N/A'} / ${stats?.type?.variable ?? 'N/A'} / ${stats?.type?.grouped ?? 'N/A'}`}</div>}
          </CardContent>
        </Card>
      </div>

      <div className="flex flex-col md:flex-row items-center justify-between gap-4 py-4">
        <div className="flex flex-wrap gap-2 w-full md:w-auto">
            <Input
              placeholder="Filtrar por nombre..."
              value={(table.getColumn("name")?.getFilterValue() as string) ?? ""}
              onChange={(event) =>
                table.getColumn("name")?.setFilterValue(event.target.value)
              }
              className="w-full sm:w-auto sm:min-w-[200px] flex-grow"
            />
            <Select value={selectedCategory} onValueChange={setSelectedCategory} disabled={isLoadingCategories}>
              <SelectTrigger className="w-full sm:w-auto sm:min-w-[180px] flex-grow">
                <SelectValue placeholder="Categoría..." />
              </SelectTrigger>
              <SelectContent>
                {isLoadingCategories ? <SelectItem value="loading" disabled>Cargando...</SelectItem> :
                <>
                    <SelectItem value="all">Todas las categorías</SelectItem>
                    {categoryTree.map(({ category, depth }) => (
                        <SelectItem key={category.id} value={category.id.toString()}>
                            <span style={{ paddingLeft: `${depth * 1.25}rem` }}>
                              {depth > 0 && '— '}
                              {category.name}
                            </span>
                        </SelectItem>
                    ))}
                </>
                }
              </SelectContent>
            </Select>
            <Select value={selectedStatus} onValueChange={setSelectedStatus}>
              <SelectTrigger className="w-full sm:w-auto sm:min-w-[150px] flex-grow">
                <SelectValue placeholder="Estado..." />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos los estados</SelectItem>
                <SelectItem value="publish">Publicado</SelectItem>
                <SelectItem value="draft">Borrador</SelectItem>
                <SelectItem value="pending">Pendiente</SelectItem>
                <SelectItem value="private">Privado</SelectItem>
              </SelectContent>
            </Select>
            <Select value={selectedStockStatus} onValueChange={setSelectedStockStatus}>
              <SelectTrigger className="w-full sm:w-auto sm:min-w-[150px] flex-grow">
                <SelectValue placeholder="Stock..." />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todo el stock</SelectItem>
                <SelectItem value="instock">En Stock</SelectItem>
                <SelectItem value="outofstock">Agotado</SelectItem>
                <SelectItem value="onbackorder">En Reserva</SelectItem>
              </SelectContent>
            </Select>
        </div>
        <DropdownMenu>
            <DropdownMenuTrigger asChild>
                <Button variant="outline" disabled={selectedRowCount === 0 || isActionRunning} className="w-full md:w-auto mt-2 md:mt-0">
                     {isActionRunning ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <ChevronDown className="mr-2 h-4 w-4" />}
                     {getButtonText()}
                </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
                 <DropdownMenuLabel>Acciones de IA</DropdownMenuLabel>
                <DropdownMenuItem onSelect={() => handleAiAction("generateDescriptions", false)}>
                    <BrainCircuit className="mr-2 h-4 w-4" /> Generar Descripciones
                </DropdownMenuItem>
                <DropdownMenuItem onSelect={() => handleAiAction("generateImageMetadata", false)}>
                    <ImageIcon className="mr-2 h-4 w-4" /> Generar Metadatos para Imágenes
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuLabel>Acciones de Estado</DropdownMenuLabel>
                <DropdownMenuItem onSelect={() => handleBatchStatusUpdate('publish')}>
                    <Eye className="mr-2 h-4 w-4" /> Hacer Visibles (Publicar)
                </DropdownMenuItem>
                <DropdownMenuItem onSelect={() => handleBatchStatusUpdate('draft')}>
                    <EyeOff className="mr-2 h-4 w-4" /> Ocultar (Poner como Borrador)
                </DropdownMenuItem>
            </DropdownMenuContent>
        </DropdownMenu>
      </div>
      <div className="rounded-md border">
        <Table>
          <TableHeader>
            {table.getHeaderGroups().map((headerGroup) => (
              <TableRow key={headerGroup.id}>
                {headerGroup.headers.map((header) => {
                  return (
                    <TableHead key={header.id}>
                      {header.isPlaceholder
                        ? null
                        : flexRender(
                            header.column.columnDef.header,
                            header.getContext()
                          )}
                    </TableHead>
                  )
                })}
              </TableRow>
            ))}
          </TableHeader>
          <TableBody>
            {isLoading ? (
                <TableRow>
                    <TableCell colSpan={columns.length} className="h-24 text-center">
                        <div className="flex justify-center items-center">
                            <Loader2 className="mr-2 h-6 w-6 animate-spin" />
                            Cargando productos...
                        </div>
                    </TableCell>
                </TableRow>
            ) : table.getRowModel().rows?.length ? (
              table.getRowModel().rows.map((row) => (
                <TableRow
                  key={row.id}
                  data-state={row.getIsSelected() && "selected"}
                >
                  {row.getVisibleCells().map((cell) => (
                    <TableCell key={cell.id}>
                      {flexRender(
                        cell.column.columnDef.cell,
                        cell.getContext()
                      )}
                    </TableCell>
                  ))}
                </TableRow>
              ))
            ) : (
              <TableRow>
                <TableCell
                  colSpan={columns.length}
                  className="h-24 text-center"
                >
                  No se encontraron resultados.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
      <div className="flex items-center justify-end space-x-2 py-4">
        <div className="flex-1 text-sm text-muted-foreground">
          {table.getFilteredSelectedRowModel().rows.length} de{" "}
          {table.getFilteredRowModel().rows.length} fila(s) seleccionadas.
        </div>
        <div className="space-x-2">
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
  )
}
