
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
} from "@tanstack/react-table";
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
import { getColumns } from "./columns"; 
import type { ShopifyCreationJob } from "@/lib/types";
import { Loader2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { auth, onAuthStateChanged } from "@/lib/firebase";

export function JobsDataTable() {
  const [data, setData] = React.useState<ShopifyCreationJob[]>([]);
  const [isLoading, setIsLoading] = React.useState(true);
  
  const [sorting, setSorting] = React.useState<SortingState>([{ id: 'createdAt', desc: true }]);
  const [columnFilters, setColumnFilters] = React.useState<ColumnFiltersState>([]);

  const { toast } = useToast();

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
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      if (user) fetchData();
    });
    return () => unsubscribe();
  }, [fetchData]);

  const columns = React.useMemo(() => getColumns(), []);

  const table = useReactTable({
    data,
    columns,
    state: {
      sorting,
      columnFilters,
    },
    onSortingChange: setSorting,
    onColumnFiltersChange: setColumnFilters,
    getCoreRowModel: getCoreRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    getSortedRowModel: getSortedRowModel(),
  });

  return (
    <div className="w-full space-y-4">
      <div className="flex items-center justify-between">
         <Input
          placeholder="Filtrar por nombre de tienda..."
          value={(table.getColumn("storeName")?.getFilterValue() as string) ?? ""}
          onChange={(event) =>
            table.getColumn("storeName")?.setFilterValue(event.target.value)
          }
          className="max-w-sm"
        />
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
                <TableRow key={row.id}>
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
