
"use client";

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
import type { BlogPostSearchResult, WordPressPostCategory, BlogStats, HierarchicalBlogPost } from "@/lib/types"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import { BookOpen, FileCheck2, FileText, Loader2, Lock, Trash2, ChevronDown, Languages, Link2 } from "lucide-react"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog"

const LANGUAGE_MAP: { [key: string]: string } = {
    es: 'Español',
    en: 'Inglés',
    fr: 'Francés',
    de: 'Alemán',
    pt: 'Portugués',
};

export function BlogDataTable() {
  const [data, setData] = React.useState<HierarchicalBlogPost[]>([])
  const [isLoading, setIsLoading] = React.useState(true)
  const [totalPages, setTotalPages] = React.useState(1)
  
  const [categories, setCategories] = React.useState<WordPressPostCategory[]>([]);
  const [categoryTree, setCategoryTree] = React.useState<{ category: WordPressPostCategory; depth: number }[]>([]);
  const [isLoadingCategories, setIsLoadingCategories] = React.useState(true);

  const [stats, setStats] = React.useState<BlogStats | null>(null);
  const [isLoadingStats, setIsLoadingStats] = React.useState(true);
  const [isBatchActionLoading, setIsBatchActionLoading] = React.useState(false);
  const [isLinking, setIsLinking] = React.useState(false);
  const [availableLanguages, setAvailableLanguages] = React.useState<{code: string; name: string}[]>([]);

  // Filter states
  const [selectedCategory, setSelectedCategory] = React.useState('all');
  const [selectedStatus, setSelectedStatus] = React.useState('all');
  const [selectedLanguage, setSelectedLanguage] = React.useState('all');

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
      setIsLoading(false);
      return;
    }

    try {
      const token = await user.getIdToken();
      const titleFilter = columnFilters.find(f => f.id === 'title') as { id: string; value: string } | undefined;
      const sort = sorting[0];

      // Always fetch all languages from the API to correctly build hierarchies
      const params = new URLSearchParams({
        page: (pagination.pageIndex + 1).toString(),
        per_page: pagination.pageSize.toString(),
        category: selectedCategory,
        status: selectedStatus,
        lang: 'all', // Fetch all to get translation data
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

      const { posts, totalPages }: { posts: BlogPostSearchResult[], totalPages: number } = await response.json();
      
      const stringLangCodes: string[] = [...new Set<string>(posts.map((p: BlogPostSearchResult) => p.lang).filter((l: string | null | undefined): l is string => !!l && l !== 'N/A'))];
      setAvailableLanguages(stringLangCodes.map(code => ({ code, name: LANGUAGE_MAP[code] || code.toUpperCase() })));


      const postsById = new Map<number, HierarchicalBlogPost>(posts.map((p: BlogPostSearchResult) => [p.id, { ...p, subRows: [] as HierarchicalBlogPost[] }]));
      const roots: HierarchicalBlogPost[] = [];
      const processedIds = new Set<number>();

      posts.forEach((post: BlogPostSearchResult) => {
          if (processedIds.has(post.id)) return;

          let mainPost: HierarchicalBlogPost | undefined;
          const translationIds = new Set(Object.values(post.translations || {}));
          
          if (translationIds.size > 1) {
              const groupPosts = Array.from(translationIds)
                  .map(id => postsById.get(id))
                  .filter((p): p is HierarchicalBlogPost => !!p);

              if (groupPosts.length > 0) {
                  // Find the post that matches the selected language, or fall back to the first one in the group
                  mainPost = groupPosts.find(p => p.lang === selectedLanguage) || groupPosts[0];
                  
                  // If a main post for the group was determined, process the group
                  if (mainPost) {
                      mainPost.subRows = groupPosts.filter(p => p.id !== mainPost!.id);
                      groupPosts.forEach(p => processedIds.add(p.id));
                  }
              } else {
                  // This case happens when a post has translations, but none of them are on the current page of results.
                  // We treat this post as a standalone root for now.
                  mainPost = postsById.get(post.id);
                  if (mainPost) {
                      processedIds.add(mainPost.id);
                  }
              }
          } else {
              // This is a post with no translations, or the API didn't provide them.
              mainPost = postsById.get(post.id);
              if (mainPost) {
                  processedIds.add(mainPost.id);
              }
          }
          
          // Add the determined mainPost to the roots if it exists and matches the language filter
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
  }, [pagination, columnFilters, selectedCategory, selectedStatus, selectedLanguage, sorting, toast]); 

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
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error(error);
      toast({ title: "Error", description: errorMessage, variant: "destructive" });
    }
  }, [fetchData, fetchStats, toast]);

  const handleDeletePost = React.useCallback(async (postId: number) => {
    const user = auth.currentUser;
    if (!user) {
      return;
    }
    toast({ title: `Moviendo entrada a la papelera...` });
    try {
      const token = await user.getIdToken();
      const response = await fetch(`/api/wordpress/posts/${postId}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${token}` },
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Error al mover a la papelera.');
      toast({ title: "¡Entrada movida a la papelera!", description: "Podrás restaurarla o eliminarla desde WordPress." });
      fetchData();
      fetchStats();
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error('Error deleting post:', error);
      toast({ title: "Error al Eliminar", description: errorMessage, variant: "destructive" });
    }
  }, [fetchData, fetchStats, toast]);

  const handleEditPost = (postId: number) => {
    router.push(`/blog/edit/${postId}`);
  };

  const columns = React.useMemo(() => getColumns(handleStatusUpdate, handleEditPost, handleDeletePost), [handleStatusUpdate, handleEditPost, handleDeletePost]);

  const table = useReactTable({
    data,
    columns,
    onSortingChange: setSorting,
    onColumnFiltersChange: setColumnFilters,
    onRowSelectionChange: setRowSelection,
    onExpandedChange: setExpanded,
    getSubRows: (row) => row.subRows,
    getCoreRowModel: getCoreRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getExpandedRowModel: getExpandedRowModel(),
    manualPagination: true,
    manualFiltering: true,
    manualSorting: true,
    pageCount: totalPages,
    onPaginationChange: setPagination,
    state: {
      sorting,
      columnFilters,
      pagination,
      rowSelection,
      expanded,
    },
  });

  const handleBatchDelete = async () => {
    setIsBatchActionLoading(true);
    const selectedRows = table.getSelectedRowModel().rows;
    
    const postIdsWithDuplicates = selectedRows.flatMap((row: Row<HierarchicalBlogPost>) => [
        row.original.id,
        ...(row.original.subRows?.map((subRow: HierarchicalBlogPost) => subRow.id) || [])
    ]);
    const postIds = [...new Set(postIdsWithDuplicates)];

    if (postIds.length === 0) {
        toast({ title: "No hay entradas seleccionadas", variant: "destructive" });
        setIsBatchActionLoading(false);
        return;
    }

    const user = auth.currentUser;
    if (!user) {
        setIsBatchActionLoading(false);
        return;
    }

    toast({ title: `Moviendo ${postIds.length} entrada(s) a la papelera...` });

    try {
        const token = await user.getIdToken();
        const response = await fetch('/api/wordpress/posts/batch', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify({ postIds, action: 'delete' })
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
        });
    } finally {
        setIsBatchActionLoading(false);
    }
  };

  const handleBatchLinkTranslations = async () => {
    setIsLinking(true);
    const selectedRows = table.getSelectedRowModel().rows;
    
    if (selectedRows.length < 2) {
        toast({ title: "Selección insuficiente", description: "Debes seleccionar al menos dos entradas para enlazarlas.", variant: "destructive" });
        setIsLinking(false);
        return;
    }

    const languages = selectedRows.map((row: Row<HierarchicalBlogPost>) => row.original.lang);
    if (new Set(languages).size !== languages.length) {
        toast({ title: "Idiomas duplicados", description: "No puedes enlazar dos entradas del mismo idioma.", variant: "destructive" });
        setIsLinking(false);
        return;
    }
    
    const translations: Record<string, number> = {};
    selectedRows.forEach((row: Row<HierarchicalBlogPost>) => {
        if(row.original.lang) {
            translations[row.original.lang] = row.original.id;
        }
    });

    const user = auth.currentUser;
    if (!user) {
        setIsLinking(false);
        return;
    }

    toast({ title: `Enlazando ${selectedRows.length} entrada(s)...` });
    try {
        const token = await user.getIdToken();
        const response = await fetch('/api/wordpress/posts/link-translations', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify({ translations })
        });

        const result = await response.json();
        if (!response.ok) {
            throw new Error(result.error || result.message || 'Fallo el enlace de traducciones.');
        }

        toast({ title: "¡Traducciones enlazadas!", description: result.message });
        table.resetRowSelection();
        fetchData();
        fetchStats();
    } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
         toast({ title: "Error al enlazar", description: errorMessage, variant: "destructive" });
    } finally {
        setIsLinking(false);
    }
  };


  const selectedRowCount = table.getFilteredSelectedRowModel().rows.length;
  const isActionLoading = isBatchActionLoading || isLinking;

  return (
    <div className="w-full space-y-4">
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
              <Button variant="outline" disabled={selectedRowCount === 0 || isActionLoading} className="w-full md:w-auto mt-2 md:mt-0">
                {isActionLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <ChevronDown className="mr-2 h-4 w-4" />}
                Acciones ({selectedRowCount})
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuLabel>Acciones en Lote</DropdownMenuLabel>
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
                      Las entradas seleccionadas y todas sus traducciones enlazadas se moverán a la papelera de WordPress. Podrás restaurarlas o eliminarlas permanentemente desde allí.
                  </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                  <AlertDialogCancel onClick={() => setIsBatchActionLoading(false)}>Cancelar</AlertDialogCancel>
                  <AlertDialogAction onClick={handleBatchDelete} className={buttonVariants({ variant: "destructive" })}>
                      Sí, mover a la papelera
                  </AlertDialogAction>
              </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
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
      <div className="flex items-center justify-between space-x-2 py-4">
        <div className="flex-1 text-sm text-muted-foreground">
          {table.getFilteredSelectedRowModel().rows.length} de{" "}
          {table.getFilteredRowModel().rows.length} fila(s) seleccionadas.
        </div>
        <div className="space-x-2">
            <Button variant="outline" size="sm" onClick={() => table.previousPage()} disabled={!table.getCanPreviousPage()}>Anterior</Button>
            <Button variant="outline" size="sm" onClick={() => table.nextPage()} disabled={!table.getCanNextPage()}>Siguiente</Button>
        </div>
      </div>
    </div>
  )
}
