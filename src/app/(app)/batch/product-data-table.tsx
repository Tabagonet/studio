
"use client"

import * as React from "react"
import { useRouter } from "next/navigation"
import {
  ColumnFiltersState,
  RowSelectionState,
  SortingState,
  flexRender,
  getCoreRowModel,
  getFilteredRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  useReactTable,
  getExpandedRowModel,
  type ExpandedState,
  type Row,
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
import { Button, buttonVariants } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { getColumns } from "./columns" 
import type { ProductSearchResult, WooCommerceCategory, ProductStats, HierarchicalProduct } from "@/lib/types"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { BrainCircuit, ChevronDown, Loader2, Box, FileCheck2, FileText, BarChart3, Eye, EyeOff, Image as ImageIcon, Trash2, BadgeDollarSign, Languages, Package } from "lucide-react"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Label } from "@/components/ui/label"
import { Checkbox } from "@/components/ui/checkbox"


const LANGUAGE_MAP: { [key: string]: string } = {
    es: 'Español',
    en: 'Inglés',
    fr: 'Francés',
    de: 'Alemán',
    pt: 'Portugués',
};


export function ProductDataTable() {
  const [data, setData] = React.useState<HierarchicalProduct[]>([])
  const [isLoading, setIsLoading] = React.useState(true)
  const [isActionRunning, setIsActionRunning] = React.useState(false);
  const [actionText, setActionText] = React.useState('');
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
  const [selectedLanguage, setSelectedLanguage] = React.useState('all');
  const [availableLanguages, setAvailableLanguages] = React.useState<{code: string; name: string}[]>([]);


  const [sorting, setSorting] = React.useState<SortingState>([
    { id: 'date_created', desc: true }
  ]);
  const [columnFilters, setColumnFilters] = React.useState<ColumnFiltersState>([])
  const [rowSelection, setRowSelection] = React.useState<RowSelectionState>({})
  const [expanded, setExpanded] = React.useState<ExpandedState>({});

  const [pagination, setPagination] = React.useState({
    pageIndex: 0, 
    pageSize: 10, 
  })
  
  const router = useRouter();

  const [confirmationData, setConfirmationData] = React.useState<{
    products: { id: number; name: string; reason: string }[];
    action: 'generateDescriptions' | 'generateImageMetadata';
    productIds: number[];
  } | null>(null);
  
  const [isPriceModalOpen, setIsPriceModalOpen] = React.useState(false);
  const [isQuickUpdateModalOpen, setIsQuickUpdateModalOpen] = React.useState(false);
  
  const [priceModification, setPriceModification] = React.useState({
    field: 'regular_price' as 'regular_price' | 'sale_price',
    operation: 'increase' as 'increase' | 'set',
    type: 'percentage' as 'percentage' | 'fixed',
    value: '',
  });

  const [quickUpdateData, setQuickUpdateData] = React.useState({
    weight: '',
    dimensions: { length: '', width: '', height: '' },
    shipping_class: '',
    manage_stock: false,
    stock_quantity: '',
  });

  const { toast, dismiss } = useToast()

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
        lang: 'all', // Fetch all to build hierarchy
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
      
      const stringLangCodes: string[] = [...new Set<string>(products.map((p: ProductSearchResult) => p.lang).filter((l: string | null | undefined): l is string => !!l && l !== 'N/A'))];
      setAvailableLanguages(stringLangCodes.map(code => ({ code, name: LANGUAGE_MAP[code] || code.toUpperCase() })));


      const productsById = new Map<number, HierarchicalProduct>(products.map((p: ProductSearchResult) => [p.id, { ...p, subRows: [] as HierarchicalProduct[] }]));
      const roots: HierarchicalProduct[] = [];
      const processedIds = new Set<number>();

      products.forEach((product: ProductSearchResult) => {
          if (processedIds.has(product.id)) return;

          let mainPost: HierarchicalProduct | undefined;
          const translationIds = new Set(Object.values(product.translations || {}));
          
          if (translationIds.size > 1) {
              const groupPosts = Array.from(translationIds)
                  .map(id => productsById.get(id))
                  .filter((p): p is HierarchicalProduct => !!p);

              if (groupPosts.length > 0) {
                  mainPost = groupPosts.find(p => p.lang === selectedLanguage) || groupPosts[0];
                  if (mainPost) {
                      mainPost.subRows = groupPosts.filter(p => p.id !== mainPost!.id);
                      groupPosts.forEach(p => processedIds.add(p.id));
                  }
              } else {
                  mainPost = productsById.get(product.id);
                  if (mainPost) processedIds.add(mainPost.id);
              }
          } else {
              mainPost = productsById.get(product.id);
              if (mainPost) processedIds.add(mainPost.id);
          }
          
          if (mainPost && (selectedLanguage === 'all' || mainPost.lang === selectedLanguage)) {
              roots.push(mainPost);
          }
      });
      
      setData(roots);
      setTotalPages(totalPages);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error(error);
      toast({ title: "Error", description: errorMessage, variant: "destructive" });
    } finally {
      setIsLoading(false);
    }
  }, [pagination, columnFilters, selectedCategory, selectedStatus, selectedStockStatus, selectedLanguage, sorting, toast]); 

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
        const errorMessage = error instanceof Error ? error.message : String(error);
        console.error(error);
        toast({ title: "Error al Cargar Categorías", description: errorMessage, variant: "destructive" });
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
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error(error);
      toast({ title: "Error", description: errorMessage, variant: "destructive" });
    }
  }, [fetchData, fetchStats, toast]);

  const handleDeleteProduct = React.useCallback(async (productId: number) => {
    const user = auth.currentUser;
    if (!user) {
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
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error('Error deleting product:', error);
      toast({ title: "Error al Eliminar", description: errorMessage, variant: "destructive" });
    }
  }, [fetchData, fetchStats, toast]);

  const handleEditProduct = (productId: number) => {
    router.push(`/products/edit/${productId}`);
  };

  const columns = React.useMemo(() => getColumns(handleStatusUpdate, handleEditProduct, handleDeleteProduct), [handleStatusUpdate, handleEditProduct, handleDeleteProduct]);

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
    onExpandedChange: setExpanded,
    getSubRows: (row) => row.subRows,
    getExpandedRowModel: getExpandedRowModel(),
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
      expanded,
    },
  })

  const getProductIdsForAction = () => {
    const productIdsSet = new Set<number>();
    table.getSelectedRowModel().rows.forEach((row) => {
      let current = row;
      while (current.getParentRow()) {
        current = current.getParentRow() as Row<HierarchicalProduct>;
      }
      productIdsSet.add(current.original.id);
      current.original.subRows?.forEach(subRow => productIdsSet.add(subRow.id));
    });
    return Array.from(productIdsSet);
  };

  const handleAiAction = async (action: 'generateDescriptions' | 'generateImageMetadata', force = false) => {
    const productIds = force && confirmationData ? confirmationData.productIds : getProductIdsForAction();

    if (productIds.length === 0) {
      toast({ title: "No hay productos seleccionados", variant: "destructive" });
      return;
    }
    
    setIsActionRunning(true);
    setActionText('Procesando IA...');
    const user = auth.currentUser;
    if (!user) {
        setIsActionRunning(false);
        return;
    }

    const actionTextToast = action === 'generateDescriptions' ? 'descripciones' : 'metadatos de imagen';

    toast({
        title: "Procesando con IA...",
        description: `Generando ${actionTextToast} para ${productIds.length} producto(s). Esto puede tardar.`,
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
            throw new Error(result.message || result.error || 'Fallo en la comunicación con el servidor.');
        }
        
        if (result.confirmationRequired) {
            dismiss();
            setConfirmationData({
                products: result.products,
                action: action,
                productIds: productIds,
            });
            return;
        }
        
        toast({
            title: "¡Acción completada!",
            description: result.message,
        });
        table.resetRowSelection();
        fetchData();
        fetchStats();

    } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        toast({
            title: "Error en la acción de IA",
            description: errorMessage,
            variant: "destructive",
        });
    } finally {
        setIsActionRunning(false);
        setActionText('');
        if (force) {
            setConfirmationData(null);
        }
    }
  }

  const handleBatchUpdate = async (updates: any) => {
    const productIds = getProductIdsForAction();
    if (productIds.length === 0) {
      toast({ title: "No hay productos seleccionados", variant: "destructive" });
      return;
    }
    
    setIsActionRunning(true);
    setActionText('Actualizando...');

    const user = auth.currentUser;
    if (!user) {
        setIsActionRunning(false);
        return;
    }

    toast({
        title: "Actualizando en lote...",
        description: `Se están aplicando cambios a ${productIds.length} producto(s).`,
    });

    try {
        const token = await user.getIdToken();
        const response = await fetch('/api/woocommerce/products/batch-update', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`,
            },
            body: JSON.stringify({ productIds, updates }),
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

    } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        toast({
            title: "Error en la acción en lote",
            description: errorMessage,
            variant: "destructive",
        });
    } finally {
        setIsActionRunning(false);
        setActionText('');
        setIsPriceModalOpen(false);
        setIsQuickUpdateModalOpen(false);
    }
  }
  
    const handleBatchDelete = async () => {
        setIsActionRunning(true);
        setActionText('Eliminando...');
        const productIds = getProductIdsForAction();
    
        if (productIds.length === 0) {
            toast({ title: "No hay productos seleccionados", variant: "destructive" });
            setIsActionRunning(false);
            return;
        }
    
        const user = auth.currentUser;
        if (!user) {
            setIsActionRunning(false);
            return;
        }
    
        toast({ title: `Eliminando ${productIds.length} producto(s)...` });
    
        try {
            const token = await user.getIdToken();
            const response = await fetch('/api/woocommerce/products/batch', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify({ productIds, action: 'delete' })
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
    
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            toast({
                title: "Error en la eliminación en lote",
                description: errorMessage,
                variant: "destructive",
            });
        } finally {
            setIsActionRunning(false);
            setActionText('');
        }
    };
    
    const handleApplyPriceChange = () => {
        const value = parseFloat(priceModification.value);
        if (isNaN(value) || value <= 0) {
            toast({ title: 'Valor inválido', description: 'Por favor, introduce un número positivo.', variant: 'destructive' });
            return;
        }
        handleBatchUpdate({
            priceModification: {
                ...priceModification,
                value: value
            }
        });
    }

    const handleApplyQuickUpdate = () => {
      const payload: any = {};
      if (quickUpdateData.weight) payload.weight = quickUpdateData.weight;
      if (quickUpdateData.shipping_class) payload.shipping_class = quickUpdateData.shipping_class;
      if (Object.values(quickUpdateData.dimensions).some(d => d)) {
        payload.dimensions = quickUpdateData.dimensions;
      }
      
      payload.manage_stock = quickUpdateData.manage_stock;
      if (quickUpdateData.manage_stock && quickUpdateData.stock_quantity) {
        payload.stock_quantity = quickUpdateData.stock_quantity;
      }
      
      if (Object.keys(payload).length === 0) {
        toast({ title: "Nada que actualizar", description: "Por favor, introduce al menos un valor.", variant: "destructive" });
        return;
      }
      handleBatchUpdate(payload);
    };

  const selectedRowCount = Object.keys(rowSelection).length;

  const getButtonText = () => {
    if (isActionRunning) return actionText;
    return `Acciones (${selectedRowCount})`;
  };

  return (
    <div className="w-full space-y-4">
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
                <AlertDialogCancel onClick={() => { setConfirmationData(null); setIsActionRunning(false); }}>Cancelar</AlertDialogCancel>
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

    <AlertDialog open={isPriceModalOpen} onOpenChange={setIsPriceModalOpen}>
        <AlertDialogContent>
            <AlertDialogHeader>
                <AlertDialogTitle>Modificar Precios en Lote</AlertDialogTitle>
                <AlertDialogDescription>
                    Define cómo quieres modificar los precios para los {selectedRowCount} productos seleccionados.
                </AlertDialogDescription>
            </AlertDialogHeader>
            <div className="space-y-4 py-4">
                <div className="grid grid-cols-2 gap-4">
                    <div>
                        <Label>Campo de Precio</Label>
                        <Select value={priceModification.field} onValueChange={(v) => setPriceModification(p => ({...p, field: v as any}))}>
                            <SelectTrigger><SelectValue /></SelectTrigger>
                            <SelectContent>
                                <SelectItem value="regular_price">Precio Regular</SelectItem>
                                <SelectItem value="sale_price">Precio de Oferta</SelectItem>
                            </SelectContent>
                        </Select>
                    </div>
                     <div>
                        <Label>Operación</Label>
                        <Select value={priceModification.operation} onValueChange={(v) => setPriceModification(p => ({...p, operation: v as any}))}>
                            <SelectTrigger><SelectValue /></SelectTrigger>
                            <SelectContent>
                                <SelectItem value="increase">Aumentar</SelectItem>
                                <SelectItem value="decrease">Disminuir</SelectItem>
                                <SelectItem value="set">Establecer Nuevo Precio</SelectItem>
                            </SelectContent>
                        </Select>
                    </div>
                </div>
                 <div className="grid grid-cols-2 gap-4">
                     <div>
                        <Label>Tipo de Valor</Label>
                        <Select value={priceModification.type} onValueChange={(v) => setPriceModification(p => ({...p, type: v as any}))} disabled={priceModification.operation === 'set'}>
                            <SelectTrigger><SelectValue /></SelectTrigger>
                            <SelectContent>
                                <SelectItem value="percentage">Porcentaje (%)</SelectItem>
                                <SelectItem value="fixed">Cantidad Fija (€)</SelectItem>
                            </SelectContent>
                        </Select>
                    </div>
                    <div>
                        <Label>Valor</Label>
                        <Input type="number" placeholder="Ej: 10" value={priceModification.value} onChange={(e) => setPriceModification(p => ({...p, value: e.target.value}))}/>
                    </div>
                </div>
            </div>
            <AlertDialogFooter>
                <AlertDialogCancel>Cancelar</AlertDialogCancel>
                <AlertDialogAction onClick={handleApplyPriceChange}>Aplicar Cambios</AlertDialogAction>
            </AlertDialogFooter>
        </AlertDialogContent>
    </AlertDialog>

    <AlertDialog open={isQuickUpdateModalOpen} onOpenChange={setIsQuickUpdateModalOpen}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Actualización Rápida de Datos</AlertDialogTitle>
          <AlertDialogDescription>
              Aplica los mismos datos físicos y de inventario a los {selectedRowCount} productos seleccionados. Los campos vacíos se ignorarán.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <div className="space-y-4 py-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label>Peso (kg)</Label>
              <Input placeholder="Ej: 0.5" value={quickUpdateData.weight} onChange={(e) => setQuickUpdateData(d => ({ ...d, weight: e.target.value }))} />
            </div>
            <div>
              <Label>Clase de envío</Label>
              <Input placeholder="Slug de la clase" value={quickUpdateData.shipping_class} onChange={(e) => setQuickUpdateData(d => ({ ...d, shipping_class: e.target.value }))} />
            </div>
          </div>
          <div>
            <Label>Dimensiones (cm)</Label>
            <div className="grid grid-cols-3 gap-2">
              <Input placeholder="Largo" value={quickUpdateData.dimensions.length} onChange={(e) => setQuickUpdateData(d => ({ ...d, dimensions: { ...d.dimensions, length: e.target.value } }))} />
              <Input placeholder="Ancho" value={quickUpdateData.dimensions.width} onChange={(e) => setQuickUpdateData(d => ({ ...d, dimensions: { ...d.dimensions, width: e.target.value } }))} />
              <Input placeholder="Alto" value={quickUpdateData.dimensions.height} onChange={(e) => setQuickUpdateData(d => ({ ...d, dimensions: { ...d.dimensions, height: e.target.value } }))} />
            </div>
          </div>
          <div className="pt-4 border-t space-y-2">
            <div className="flex items-center space-x-2">
              <Checkbox id="manage_stock_quick" checked={quickUpdateData.manage_stock} onCheckedChange={(checked) => setQuickUpdateData(d => ({ ...d, manage_stock: !!checked }))} />
              <Label htmlFor="manage_stock_quick" className="font-normal">Gestionar inventario</Label>
            </div>
            <Input type="number" placeholder="Cantidad" disabled={!quickUpdateData.manage_stock} value={quickUpdateData.stock_quantity} onChange={(e) => setQuickUpdateData(d => ({ ...d, stock_quantity: e.target.value }))} />
          </div>
        </div>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancelar</AlertDialogCancel>
          <AlertDialogAction onClick={handleApplyQuickUpdate}>Aplicar Actualización</AlertDialogAction>
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
                <SelectItem value="trash">En Papelera</SelectItem>
              </SelectContent>
            </Select>
             <Select value={selectedLanguage} onValueChange={setSelectedLanguage}>
                <SelectTrigger className="w-full sm:w-auto sm:min-w-[150px] flex-grow">
                    <Languages className="mr-2 h-4 w-4" />
                    <SelectValue placeholder="Idioma..." />
                </SelectTrigger>
                <SelectContent>
                    <SelectItem value="all">Todos los idiomas</SelectItem>
                    {availableLanguages.map(lang => (
                        <SelectItem key={lang.code} value={lang.code}>{lang.name}</SelectItem>
                    ))}
                </SelectContent>
            </Select>
        </div>
        <AlertDialog>
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
                     <DropdownMenuLabel>Gestión de Datos</DropdownMenuLabel>
                     <DropdownMenuItem onSelect={() => setIsQuickUpdateModalOpen(true)}>
                        <Package className="mr-2 h-4 w-4" /> Actualización Rápida
                    </DropdownMenuItem>
                    <DropdownMenuItem onSelect={() => setIsPriceModalOpen(true)}>
                        <BadgeDollarSign className="mr-2 h-4 w-4" /> Modificar Precios
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuLabel>Acciones de Estado</DropdownMenuLabel>
                    <DropdownMenuItem onSelect={() => handleBatchUpdate({status: 'publish'})}>
                        <Eye className="mr-2 h-4 w-4" /> Hacer Visibles (Publicar)
                    </DropdownMenuItem>
                    <DropdownMenuItem onSelect={() => handleBatchUpdate({status: 'draft'})}>
                        <EyeOff className="mr-2 h-4 w-4" /> Ocultar (Poner como Borrador)
                    </DropdownMenuItem>
                     <DropdownMenuSeparator />
                    <DropdownMenuLabel>Otras Acciones</DropdownMenuLabel>
                    <AlertDialogTrigger asChild>
                        <DropdownMenuItem className="text-destructive focus:text-destructive">
                            <Trash2 className="mr-2 h-4 w-4" /> Eliminar Productos
                        </DropdownMenuItem>
                    </AlertDialogTrigger>
                </DropdownMenuContent>
            </DropdownMenu>
            <AlertDialogContent>
              <AlertDialogHeader>
                  <AlertDialogTitle>¿Estás absolutamente seguro?</AlertDialogTitle>
                  <AlertDialogDescription>
                      Esta acción no se puede deshacer. Se eliminarán permanentemente los {selectedRowCount} productos seleccionados y todas sus traducciones.
                  </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                  <AlertDialogCancel onClick={() => setIsActionRunning(false)}>Cancelar</AlertDialogCancel>
                  <AlertDialogAction onClick={handleBatchDelete} className={buttonVariants({ variant: "destructive" })}>
                      Sí, eliminar productos
                  </AlertDialogAction>
              </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
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
