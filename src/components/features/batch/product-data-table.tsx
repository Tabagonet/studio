
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
import { BrainCircuit, ChevronDown, Loader2, Box, FileCheck2, FileText, BarChart3 } from "lucide-react"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"


export function ProductDataTable() {
  const [data, setData] = React.useState<ProductSearchResult[]>([])
  const [isLoading, setIsLoading] = React.useState(true)
  const [isAiProcessing, setIsAiProcessing] = React.useState(false);
  const [totalPages, setTotalPages] = React.useState(1)
  
  const [categories, setCategories] = React.useState<WooCommerceCategory[]>([]);
  const [categoryTree, setCategoryTree] = React.useState<{ category: WooCommerceCategory; depth: number }[]>([]);
  const [isLoadingCategories, setIsLoadingCategories] = React.useState(false);
  const [selectedCategory, setSelectedCategory] = React.useState('all');

  const [stats, setStats] = React.useState<ProductStats | null>(null);
  const [isLoadingStats, setIsLoadingStats] = React.useState(true);

  const [sorting, setSorting] = React.useState<SortingState>([])
  const [columnFilters, setColumnFilters] = React.useState<ColumnFiltersState>([])
  const [rowSelection, setRowSelection] = React.useState({})
  
  const [pagination, setPagination] = React.useState({
    pageIndex: 0, 
    pageSize: 10, 
  })

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

      const params = new URLSearchParams({
        page: (pagination.pageIndex + 1).toString(),
        per_page: pagination.pageSize.toString(),
        type: 'all',
      });
      if (nameFilter?.value) {
        params.append('q', nameFilter.value);
      }
      if (selectedCategory !== 'all') {
        params.append('category', selectedCategory);
      }

      const response = await fetch(`/api/woocommerce/search-products?${params.toString()}`, {
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
  }, [pagination, columnFilters, selectedCategory, toast]); 

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

  const columns = React.useMemo(() => getColumns(handleStatusUpdate), [handleStatusUpdate]);

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
    pageCount: totalPages,
    onPaginationChange: setPagination,
    state: {
      sorting,
      columnFilters,
      rowSelection,
      pagination,
    },
  })

  const handleAiAction = async (action: string) => {
    const selectedRows = table.getSelectedRowModel().rows;
    if (selectedRows.length === 0) {
      toast({ title: "No hay productos seleccionados", variant: "destructive" });
      return;
    }
    
    setIsAiProcessing(true);
    const productIds = selectedRows.map(row => row.original.id);
    const user = auth.currentUser;
    if (!user) {
        toast({ title: "No autenticado", variant: "destructive" });
        setIsAiProcessing(false);
        return;
    }

    toast({
        title: "Procesando con IA...",
        description: `Aplicando "${action}" a ${productIds.length} producto(s). Esto puede tardar.`,
    });

    try {
        const token = await user.getIdToken();
        const response = await fetch('/api/process-photos', { // This is the repurposed endpoint
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`,
            },
            body: JSON.stringify({ productIds }),
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
            title: "Error en la acción de IA",
            description: error.message,
            variant: "destructive",
        });
    } finally {
        setIsAiProcessing(false);
    }
  }


  const selectedRowCount = Object.keys(rowSelection).length;

  return (
    <div className="w-full space-y-4">
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
        <div className="flex flex-col sm:flex-row gap-4 w-full md:w-auto">
            <Input
              placeholder="Filtrar por nombre..."
              value={(table.getColumn("name")?.getFilterValue() as string) ?? ""}
              onChange={(event) =>
                table.getColumn("name")?.setFilterValue(event.target.value)
              }
              className="w-full sm:max-w-xs"
            />
            <Select value={selectedCategory} onValueChange={setSelectedCategory} disabled={isLoadingCategories}>
              <SelectTrigger className="w-full sm:max-w-xs">
                <SelectValue placeholder="Filtrar por categoría..." />
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
        </div>
        <DropdownMenu>
            <DropdownMenuTrigger asChild>
                <Button variant="outline" disabled={selectedRowCount === 0 || isAiProcessing} className="w-full md:w-auto">
                    {isAiProcessing ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <BrainCircuit className="mr-2 h-4 w-4" />}
                    {isAiProcessing ? "Procesando..." : `Acciones (${selectedRowCount})`}
                    <ChevronDown className="ml-2 h-4 w-4" />
                </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
                 <DropdownMenuLabel>Acciones de IA</DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={() => handleAiAction("Generar Descripciones")}>
                    Generar/Actualizar Descripciones
                </DropdownMenuItem>
                <DropdownMenuItem disabled>
                    Generar Metadatos para Imágenes
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
