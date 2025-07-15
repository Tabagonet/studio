
// src/app/(app)/shopify/jobs/data-table.tsx
"use client";

import * as React from "react";
import {
  flexRender,
  getCoreRowModel,
  getFilteredRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  useReactTable,
  type ColumnFiltersState,
  type SortingState,
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
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { getColumns } from "./columns"; 
import type { ShopifyCreationJob } from "@/lib/types";
import { Loader2, Trash2, AlertCircle } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { auth, onAuthStateChanged } from "@/lib/firebase";
import { Checkbox } from "@/components/ui/checkbox";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { deleteShopifyJobsAction } from "./actions";
import { AssignStoreDialog } from "./assign-store-dialog";
import Link from 'next/link';
import { useRouter, useSearchParams } from "next/navigation";


export function JobsDataTable() {
  const [data, setData] = React.useState<ShopifyCreationJob[]>([]);
  const [isLoading, setIsLoading] = React.useState(true);
  const router = useRouter();
  const searchParams = useSearchParams();
  
  const [sorting, setSorting] = React.useState<SortingState>([{ id: 'createdAt', desc: true }]);
  const [columnFilters, setColumnFilters] = React.useState<ColumnFiltersState>([]);
  const [rowSelection, setRowSelection] = React.useState<RowSelectionState>({});

  const { toast } = useToast();
  const [isDeleting, setIsDeleting] = React.useState<string[]>([]);
  const [jobToAssign, setJobToAssign] = React.useState<ShopifyCreationJob | null>(null);
  const [populatingJobId, setPopulatingJobId] = React.useState<string | null>(null);
  const [authActionLoading, setAuthActionLoading] = React.useState(false);

  const [showConfigErrorDialog, setShowConfigErrorDialog] = React.useState(false);
  const [configErrorMessage, setConfigErrorMessage] = React.useState('');


  const fetchData = React.useCallback(async () => {
    setIsLoading(true);
    const user = auth.currentUser;
    if (!user) {
      setIsLoading(false);
      setData([]);
      return;
    }

    try {
      const token = await user.getIdToken();
      const response = await fetch('/api/shopify/jobs', { headers: { 'Authorization': `Bearer ${token}` } });
      if (!response.ok) {
        throw new Error((await response.json()).error || 'Failed to fetch Shopify jobs');
      }
      const data = await response.json();
      setData(data.jobs || []);
    } catch (error: any) {
      toast({ title: "Error al cargar trabajos", description: error.message, variant: "destructive" });
    } finally {
      setIsLoading(false);
    }
  }, [toast]);
  
  React.useEffect(() => {
    const authSuccess = searchParams.get('auth_success');
    if(authSuccess === 'true') {
        toast({ title: '¡Autorización Exitosa!', description: 'La tienda está lista para ser poblada con contenido.' });
        // Clean the URL
        router.replace('/shopify/jobs');
    }
    const authError = searchParams.get('auth_error');
    if(authError === 'true') {
         toast({ title: 'Error de Autorización', description: searchParams.get('error_message') || 'Ocurrió un error desconocido.', variant: 'destructive'});
         router.replace('/shopify/jobs');
    }
  }, [searchParams, toast, router]);

  React.useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      if (user) fetchData();
    });
    
    const intervalId = setInterval(() => {
        if(auth.currentUser) {
            fetchData();
        }
    }, 10000);

    return () => {
        unsubscribe();
        clearInterval(intervalId);
    };
  }, [fetchData]);
  
  const handleDelete = async (jobIds: string[]) => {
      const user = auth.currentUser;
      if (!user) {
          toast({ title: "No autenticado", variant: "destructive" });
          return;
      }
      const token = await user.getIdToken();
      setIsDeleting(jobIds);

      const result = await deleteShopifyJobsAction(jobIds, token);
      
      if (result.success) {
          toast({ title: "Trabajo(s) eliminado(s)", description: result.error ? result.error : `${jobIds.length} trabajo(s) han sido eliminados.`});
          fetchData();
          if (jobIds.length > 1) {
              setRowSelection({});
          }
      } else {
          toast({ title: "Error al eliminar", description: result.error, variant: "destructive" });
      }
      setIsDeleting([]);
  };

  const handlePopulate = async (jobId: string) => {
     const user = auth.currentUser;
      if (!user) {
          toast({ title: "No autenticado", variant: "destructive" });
          return;
      }
      setPopulatingJobId(jobId);
      try {
        const token = await user.getIdToken();
        const response = await fetch(`/api/shopify/jobs/${jobId}/populate`, {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${token}` },
        });

        if (!response.ok) {
          const errorData = await response.json();
          throw new Error(errorData.error || 'No se pudo iniciar el proceso de poblado.');
        }

        toast({ title: 'Proceso Iniciado', description: 'La tarea de poblado de contenido ha comenzado. El estado se actualizará en breve.' });
        fetchData(); 
      } catch (error: any) {
         toast({ title: 'Error', description: error.message, variant: 'destructive' });
      } finally {
         setPopulatingJobId(null);
      }
  };

  const handleInitiateAuth = async (job: ShopifyCreationJob) => {
    setAuthActionLoading(true);
    const user = auth.currentUser;
    if (!user) {
        toast({ title: "No autenticado", variant: "destructive" });
        setAuthActionLoading(false);
        return;
    }
    
    try {
        const token = await user.getIdToken();
        const response = await fetch('/api/shopify/auth/initiate', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
            body: JSON.stringify({ jobId: job.id, clientBaseUrl: window.location.origin })
        });
        
        const result = await response.json();
        if (!response.ok) {
            throw new Error(result.error || result.details?.message || "Fallo al iniciar la autorización.");
        }
        
        // This is now the definitive way to redirect.
        window.location.href = result.authorizationUrl;

    } catch (error: any) {
        toast({ title: "Error de Autorización", description: error.message, variant: "destructive" });
        setAuthActionLoading(false);
    }
  };

  const handleAssignSuccess = () => {
    setJobToAssign(null);
    fetchData();
  };

  const handleAssignError = (error: { code: string; message: string }) => {
    if (error.code === 'CONFIGURATION_ERROR') {
      setConfigErrorMessage(error.message);
      setShowConfigErrorDialog(true);
    } else {
      toast({ title: 'Error al Asignar', description: error.message, variant: 'destructive' });
    }
  };


  const isJobDeleting = (jobId: string) => isDeleting.includes(jobId) || isDeleting.includes('batch');
  
  const columns = React.useMemo(() => getColumns(
      (jobId) => handleDelete([jobId]),
      (job) => setJobToAssign(job),
      handlePopulate,
      handleInitiateAuth,
      isJobDeleting,
      populatingJobId,
  ), [isDeleting, populatingJobId]); // eslint-disable-line react-hooks/exhaustive-deps

  const table = useReactTable({
    data,
    columns,
    state: {
      sorting,
      columnFilters,
      rowSelection,
    },
    onSortingChange: setSorting,
    onColumnFiltersChange: setColumnFilters,
    getCoreRowModel: getCoreRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    getSortedRowModel: getSortedRowModel(),
    onRowSelectionChange: setRowSelection,
    getRowId: (row) => row.id,
  });

  const getSelectedJobIds = () => {
    return table.getSelectedRowModel().rows.map(row => row.original.id);
  }

  return (
    <div className="w-full space-y-4">
       <AssignStoreDialog 
        job={jobToAssign}
        onOpenChange={(open) => !open && setJobToAssign(null)}
        onSuccess={handleAssignSuccess}
        onError={handleAssignError}
       />

        <AlertDialog open={showConfigErrorDialog} onOpenChange={setShowConfigErrorDialog}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle className="flex items-center gap-2">
                <AlertCircle className="text-destructive h-6 w-6"/>
                Configuración Requerida
              </AlertDialogTitle>
              <AlertDialogDescription>
                {configErrorMessage}
                <br/><br/>
                Para continuar, un Super Administrador debe configurar las credenciales globales de Shopify.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cerrar</AlertDialogCancel>
              <AlertDialogAction asChild>
                <Link href="/settings/connections">Ir a Configuración</Link>
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

      <div className="flex items-center justify-between">
         <Input
          placeholder="Filtrar por nombre de tienda..."
          value={(table.getColumn("storeName")?.getFilterValue() as string) ?? ""}
          onChange={(event) =>
            table.getColumn("storeName")?.setFilterValue(event.target.value)
          }
          className="max-w-sm"
        />
        {Object.keys(rowSelection).length > 0 && (
          <AlertDialog>
            <AlertDialogTrigger asChild>
                <Button variant="destructive" disabled={isDeleting.length > 0}>
                    {isDeleting.includes('batch') ? <Loader2 className="mr-2 h-4 w-4 animate-spin"/> : <Trash2 className="mr-2 h-4 w-4"/>}
                    Eliminar ({Object.keys(rowSelection).length})
                </Button>
            </AlertDialogTrigger>
             <AlertDialogContent>
                <AlertDialogHeader>
                    <AlertDialogTitle>¿Confirmar eliminación en lote?</AlertDialogTitle>
                    <AlertDialogDescription>
                        Esta acción eliminará permanentemente los {Object.keys(rowSelection).length} trabajos seleccionados. No se pueden recuperar.
                    </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                    <AlertDialogCancel>Cancelar</AlertDialogCancel>
                    <AlertDialogAction onClick={() => handleDelete(getSelectedJobIds())} className={buttonVariants({ variant: 'destructive' })}>
                        Sí, eliminar
                    </AlertDialogAction>
                </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        )}
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
                  <div className="flex justify-center items-center"><Loader2 className="mr-2 h-6 w-6 animate-spin" /> Cargando...</div>
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
                  No se han encontrado trabajos.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
       <div className="flex items-center justify-end space-x-2 py-4">
        <Button variant="outline" size="sm" onClick={() => table.previousPage()} disabled={!table.getCanPreviousPage()}>
          Anterior
        </Button>
        <Button variant="outline" size="sm" onClick={() => table.nextPage()} disabled={!table.getCanNextPage()}>
          Siguiente
        </Button>
      </div>
    </div>
  )
}
