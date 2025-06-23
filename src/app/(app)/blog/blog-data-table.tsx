
"use client"

import * as React from "react"
import {
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
import type { BlogPostSearchResult, WordPressPostCategory, BlogStats } from "@/lib/types"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import { BlogEditModal } from "./blog-edit-modal"
import { BookOpen, FileCheck2, FileClock, FileText, Loader2, Lock } from "lucide-react"

export function BlogDataTable() {
  const [data, setData] = React.useState<BlogPostSearchResult[]>([])
  const [isLoading, setIsLoading] = React.useState(true)
  const [totalPages, setTotalPages] = React.useState(1)
  
  const [categories, setCategories] = React.useState<WordPressPostCategory[]>([]);
  const [categoryTree, setCategoryTree] = React.useState<{ category: WordPressPostCategory; depth: number }[]>([]);
  const [isLoadingCategories, setIsLoadingCategories] = React.useState(true);

  const [stats, setStats] = React.useState<BlogStats | null>(null);
  const [isLoadingStats, setIsLoadingStats] = React.useState(true);

  // Filter states
  const [selectedCategory, setSelectedCategory] = React.useState('all');
  const [selectedStatus, setSelectedStatus] = React.useState('all');

  const [sorting, setSorting] = React.useState<SortingState>([
    { id: 'date_created', desc: true }
  ]);
  const [columnFilters, setColumnFilters] = React.useState<ColumnFiltersState>([])
  
  const [pagination, setPagination] = React.useState({
    pageIndex: 0, 
    pageSize: 10, 
  })
  
  const [editingPostId, setEditingPostId] = React.useState<number | null>(null);

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
        const response = await fetch('/api/wordpress/posts/stats', {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        if (!response.ok) {
            console.error("Failed to fetch post stats:", await response.text());
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
      const titleFilter = columnFilters.find(f => f.id === 'title') as { id: string; value: string } | undefined;
      const sort = sorting[0];

      const params = new URLSearchParams({
        page: (pagination.pageIndex + 1).toString(),
        per_page: pagination.pageSize.toString(),
        category: selectedCategory,
        status: selectedStatus,
      });

      if (titleFilter?.value) {
        params.append('q', titleFilter.value);
      }
      if (sort) {
        const orderbyValue = sort.id === 'date_created' ? 'date' : sort.id;
        params.append('orderby', orderbyValue);
        params.append('order', sort.desc ? 'desc' : 'asc');
      }

      const response = await fetch(`/api/wordpress/posts/search?${params.toString()}`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to fetch posts');
      }

      const { posts, totalPages } = await response.json();
      setData(posts);
      setTotalPages(totalPages);
    } catch (error) {
      console.error(error);
      toast({ title: "Error", description: (error as Error).message, variant: "destructive" });
    } finally {
      setIsLoading(false);
    }
  }, [pagination, columnFilters, selectedCategory, selectedStatus, sorting, toast]); 

  React.useEffect(() => {
    const fetchCats = async (token: string) => {
      setIsLoadingCategories(true);
      try {
        const response = await fetch('/api/wordpress/post-categories', {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        if (!response.ok) throw new Error('Failed to load categories');
        setCategories(await response.json());
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
    const buildTree = (parentId = 0, depth = 0): { category: WordPressPostCategory; depth: number }[] => {
      const children = categories.filter(cat => cat.parent === parentId).sort((a, b) => a.name.localeCompare(b.name));
      let result: { category: WordPressPostCategory; depth: number }[] = [];
      for (const child of children) {
        result.push({ category: child, depth });
        result = result.concat(buildTree(child.id, depth + 1));
      }
      return result;
    };
    setCategoryTree(buildTree());
  }, [categories]);

  const handleStatusUpdate = React.useCallback(async (postId: number, newStatus: 'publish' | 'draft') => {
    const user = auth.currentUser;
    if (!user) {
      toast({ title: "No autenticado", variant: "destructive" });
      return;
    }
    
    const actionText = newStatus === 'publish' ? 'publicando' : 'ocultando';
    toast({ title: `Actualizando estado...`, description: `Se está ${actionText} la entrada.` });

    try {
      const token = await user.getIdToken();
      const response = await fetch(`/api/wordpress/posts/${postId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({ status: newStatus })
      });
      
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || `Error al ${actionText} la entrada.`);
      
      toast({ title: "¡Éxito!", description: "El estado de la entrada ha sido actualizado." });
      fetchData();
      fetchStats();
    } catch (error) {
      console.error(error);
      toast({ title: "Error", description: (error as Error).message, variant: "destructive" });
    }
  }, [toast, fetchData, fetchStats]);

  const handleDeletePost = React.useCallback(async (postId: number) => {
    const user = auth.currentUser;
    if (!user) {
      toast({ title: "No autenticado", variant: "destructive" });
      return;
    }
    toast({ title: `Eliminando entrada...` });
    try {
      const token = await user.getIdToken();
      const response = await fetch(`/api/wordpress/posts/${postId}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${token}` },
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Error al eliminar la entrada.');
      toast({ title: "¡Entrada Eliminada!", description: "La entrada se ha eliminado permanentemente." });
      fetchData();
      fetchStats();
    } catch (error) {
      console.error('Error deleting post:', error);
      toast({ title: "Error al Eliminar", description: (error as Error).message, variant: "destructive" });
    }
  }, [toast, fetchData, fetchStats]);

  const handleEditPost = (postId: number) => setEditingPostId(postId);
  
  const handleCloseModal = (refresh: boolean) => {
    setEditingPostId(null);
    if (refresh) {
      fetchData();
      fetchStats();
    }
  };

  const columns = React.useMemo(() => getColumns(handleStatusUpdate, handleEditPost, handleDeletePost), [handleStatusUpdate, handleDeletePost]);

  const table = useReactTable({
    data,
    columns,
    onSortingChange: setSorting,
    onColumnFiltersChange: setColumnFilters,
    getCoreRowModel: getCoreRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    manualPagination: true,
    manualFiltering: true,
    manualSorting: true,
    pageCount: totalPages,
    onPaginationChange: setPagination,
    state: {
      sorting,
      columnFilters,
      pagination,
    },
  })

  return (
    <div className="w-full space-y-4">
      {editingPostId && (
        <BlogEditModal postId={editingPostId} onClose={handleCloseModal} />
      )}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card><CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2"><CardTitle className="text-sm font-medium">Total de Entradas</CardTitle><BookOpen className="h-4 w-4 text-muted-foreground" /></CardHeader><CardContent>{isLoadingStats ? <Skeleton className="h-8 w-16" /> : <div className="text-2xl font-bold">{stats?.total ?? 'N/A'}</div>}</CardContent></Card>
        <Card><CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2"><CardTitle className="text-sm font-medium">Publicadas</CardTitle><FileCheck2 className="h-4 w-4 text-muted-foreground" /></CardHeader><CardContent>{isLoadingStats ? <Skeleton className="h-8 w-16" /> : <div className="text-2xl font-bold">{stats?.status?.publish ?? 'N/A'}</div>}</CardContent></Card>
        <Card><CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2"><CardTitle className="text-sm font-medium">Borradores</CardTitle><FileText className="h-4 w-4 text-muted-foreground" /></CardHeader><CardContent>{isLoadingStats ? <Skeleton className="h-8 w-16" /> : <div className="text-2xl font-bold">{stats?.status?.draft ?? 'N/A'}</div>}</CardContent></Card>
        <Card><CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2"><CardTitle className="text-sm font-medium">Privadas/Futuras</CardTitle><Lock className="h-4 w-4 text-muted-foreground" /></CardHeader><CardContent>{isLoadingStats ? <Skeleton className="h-8 w-16" /> : <div className="text-2xl font-bold">{`${(stats?.status?.private ?? 0) + (stats?.status?.future ?? 0)}`}</div>}</CardContent></Card>
      </div>

      <div className="flex flex-col md:flex-row items-center justify-between gap-4 py-4">
        <div className="flex flex-wrap gap-2 w-full md:w-auto">
            <Input
              placeholder="Filtrar por título..."
              value={(table.getColumn("title")?.getFilterValue() as string) ?? ""}
              onChange={(event) => table.getColumn("title")?.setFilterValue(event.target.value)}
              className="w-full sm:w-auto sm:min-w-[200px] flex-grow"
            />
            <Select value={selectedCategory} onValueChange={setSelectedCategory} disabled={isLoadingCategories}>
              <SelectTrigger className="w-full sm:w-auto sm:min-w-[180px] flex-grow"><SelectValue placeholder="Categoría..." /></SelectTrigger>
              <SelectContent>
                {isLoadingCategories ? <SelectItem value="loading" disabled>Cargando...</SelectItem> :
                <>
                    <SelectItem value="all">Todas las categorías</SelectItem>
                    {categoryTree.map(({ category, depth }) => (
                        <SelectItem key={category.id} value={category.id.toString()}>
                            <span style={{ paddingLeft: `${depth * 1.25}rem` }}>{depth > 0 && '— '}{category.name}</span>
                        </SelectItem>
                    ))}
                </>}
              </SelectContent>
            </Select>
            <Select value={selectedStatus} onValueChange={setSelectedStatus}>
              <SelectTrigger className="w-full sm:w-auto sm:min-w-[150px] flex-grow"><SelectValue placeholder="Estado..." /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos los estados</SelectItem>
                <SelectItem value="publish">Publicado</SelectItem>
                <SelectItem value="draft">Borrador</SelectItem>
                <SelectItem value="pending">Pendiente</SelectItem>
                <SelectItem value="private">Privado</SelectItem>
                <SelectItem value="future">Programado</SelectItem>
              </SelectContent>
            </Select>
        </div>
      </div>
      <div className="rounded-md border">
        <Table>
          <TableHeader>{table.getHeaderGroups().map((headerGroup) => (<TableRow key={headerGroup.id}>{headerGroup.headers.map((header) => (<TableHead key={header.id}>{header.isPlaceholder ? null : flexRender(header.column.columnDef.header, header.getContext())}</TableHead>))}</TableRow>))}</TableHeader>
          <TableBody>
            {isLoading ? (
                <TableRow><TableCell colSpan={columns.length} className="h-24 text-center"><div className="flex justify-center items-center"><Loader2 className="mr-2 h-6 w-6 animate-spin" />Cargando entradas...</div></TableCell></TableRow>
            ) : table.getRowModel().rows?.length ? (
              table.getRowModel().rows.map((row) => (<TableRow key={row.id} data-state={row.getIsSelected() && "selected"}>{row.getVisibleCells().map((cell) => (<TableCell key={cell.id}>{flexRender(cell.column.columnDef.cell, cell.getContext())}</TableCell>))}</TableRow>))
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
  )
}
