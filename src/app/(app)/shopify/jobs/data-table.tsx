
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
import { Loader2, Trash2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { auth, onAuthStateChanged } from "@/lib/firebase";
import { Checkbox } from "@/components/ui/checkbox";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { deleteShopifyJobsAction } from "./actions";
import { AssignStoreDialog } from "./assign-store-dialog";


export function JobsDataTable() {
  const [data, setData] = React.useState<ShopifyCreationJob[]>([]);
  const [isLoading, setIsLoading] = React.useState(true);
  
  const [sorting, setSorting] = React.useState<SortingState>([{ id: 'createdAt', desc: true }]);
  const [columnFilters, setColumnFilters] = React.useState<ColumnFiltersState>([]);
  const [rowSelection, setRowSelection] = React.useState<RowSelectionState>({});

  const { toast } = useToast();
  const [isDeleting, setIsDeleting] = React.useState<string[]>([]);
  const [jobToAssign, setJobToAssign] = React.useState<ShopifyCreationJob | null>(null);

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
      console.log("Datos de trabajos recibidos desde la API:", data.jobs); // LOG
      setData(data.jobs || []);
    } catch (error: any) {
      toast({ title: "Error al cargar trabajos", description: error.message, variant: "destructive" });
    } finally {
      setIsLoading(false);
    }
  }, [toast]);

  React.useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      if (user) fetchData();
    });
    
    // Set up a poller to refresh data every 10 seconds
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

  const isJobDeleting = (jobId: string) => isDeleting.includes(jobId) || isDeleting.includes('batch');
  
  const columns = React.useMemo(() => getColumns(
      (jobId) => handleDelete([jobId]),
      (job) => setJobToAssign(job),
      isJobDeleting
  ), [isDeleting]); // eslint-disable-line react-hooks/exhaustive-deps

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
    getRowId: (row) => row.id, // Use the actual document ID for the row
  });

  const getSelectedJobIds = () => {
    return table.getSelectedRowModel().rows.map(row => row.original.id);
  }

  return (
    <div className="w-full space-y-4">
       <AssignStoreDialog 
        job={jobToAssign}
        onOpenChange={(open) => !open && setJobToAssign(null)}
        onSuccess={() => {
            setJobToAssign(null);
            fetchData();
        }}
       />
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
