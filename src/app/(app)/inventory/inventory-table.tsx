"use client";

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  flexRender,
  getCoreRowModel,
  getFilteredRowModel,
  getPaginationRowModel,
  useReactTable,
  getSortedRowModel,
  type ColumnFiltersState,
  type SortingState,
  type RowSelectionState,
} from "@tanstack/react-table";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { getColumns, EditableProduct } from './columns';
import { useToast } from '@/hooks/use-toast';
import { auth, onAuthStateChanged } from '@/lib/firebase';
import { Loader2 } from 'lucide-react';

export function InventoryTable() {
    const [data, setData] = useState<EditableProduct[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [isSaving, setIsSaving] = useState<number | null>(null); // Store saving row index
    const { toast } = useToast();

    const [sorting, setSorting] = useState<SortingState>([]);
    const [columnFilters, setColumnFilters] = useState<ColumnFiltersState>([]);
    const [rowSelection, setRowSelection] = useState<RowSelectionState>({});
    const [pagination, setPagination] = useState({ pageIndex: 0, pageSize: 20 });
    const [totalPages, setTotalPages] = useState(1);

    const fetchData = useCallback(async () => {
        setIsLoading(true);
        const user = auth.currentUser;
        if (!user) {
            setIsLoading(false);
            return;
        }

        try {
            const token = await user.getIdToken();
            const nameFilter = columnFilters.find(f => f.id === 'name') as { id: string; value: string } | undefined;
            
            const params = new URLSearchParams({
                page: (pagination.pageIndex + 1).toString(),
                per_page: pagination.pageSize.toString(),
            });
            if (nameFilter?.value) params.append('q', nameFilter.value);

            const response = await fetch(`/api/woocommerce/products/search-products?${params.toString()}`, {
                headers: { 'Authorization': `Bearer ${token}` }
            });

            if (!response.ok) throw new Error((await response.json()).error || 'Failed to fetch products');
            
            const { products, totalPages } = await response.json();
            setData(products.map((p: any) => ({ ...p, isEditing: false, pendingChanges: {} })));
            setTotalPages(totalPages);

        } catch (error: any) {
            toast({ title: "Error", description: error.message, variant: "destructive" });
        } finally {
            setIsLoading(false);
        }
    }, [pagination, columnFilters, toast]);

    useEffect(() => {
        const unsubscribe = onAuthStateChanged(auth, user => {
            if (user) fetchData();
        });
        return () => unsubscribe();
    }, [fetchData]);

    const updateRow = useCallback((rowIndex: number, columnId: string, value: any) => {
        setData(old => old.map((row, index) => {
            if (index === rowIndex) {
                return {
                    ...row,
                    isEditing: true,
                    pendingChanges: {
                        ...row.pendingChanges,
                        [columnId]: value,
                    },
                };
            }
            return row;
        }));
    }, []);

    const saveRow = useCallback(async (rowIndex: number) => {
        setIsSaving(rowIndex);
        const row = data[rowIndex];
        if (!row.pendingChanges) {
            setIsSaving(null);
            return;
        }
        
        const user = auth.currentUser;
        if (!user) {
            toast({ title: "No autenticado", variant: "destructive" });
            setIsSaving(null);
            return;
        }
        
        try {
            const token = await user.getIdToken();
            const payload = { ...row.pendingChanges };
            
            // Ensure stock quantity is a number if it exists
            if (payload.stock_quantity !== undefined && payload.stock_quantity !== null && payload.stock_quantity !== '') {
                payload.stock_quantity = parseInt(payload.stock_quantity as string, 10);
            }

            const response = await fetch(`/api/woocommerce/products/${row.id}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
                body: JSON.stringify(payload)
            });

            if (!response.ok) throw new Error((await response.json()).error || "Fallo al guardar");

            toast({ title: `Producto "${row.name}" actualizado.` });

            // Update local state after successful save
            setData(old => old.map((oldRow, index) => {
                if (index === rowIndex) {
                    const updatedRow = { ...oldRow, ...payload, isEditing: false, pendingChanges: {} };
                    if (payload.stock_quantity !== undefined) {
                      updatedRow.stock_quantity = payload.stock_quantity;
                    }
                    if (payload.manage_stock !== undefined) {
                      updatedRow.manage_stock = payload.manage_stock;
                    }
                    return updatedRow;
                }
                return oldRow;
            }));

        } catch (error: any) {
            toast({ title: 'Error al Guardar', description: error.message, variant: 'destructive' });
        } finally {
            setIsSaving(null);
        }
    }, [data, toast]);
    
    const cancelChanges = useCallback((rowIndex: number) => {
      setData(old => old.map((row, index) => {
        if (index === rowIndex) {
          return { ...row, isEditing: false, pendingChanges: {} };
        }
        return row;
      }));
    }, []);

    const table = useReactTable({
        data,
        columns: getColumns(),
        state: { sorting, columnFilters, rowSelection, pagination },
        onSortingChange: setSorting,
        onColumnFiltersChange: setColumnFilters,
        onRowSelectionChange: setRowSelection,
        onPaginationChange: setPagination,
        getCoreRowModel: getCoreRowModel(),
        getSortedRowModel: getSortedRowModel(),
        getFilteredRowModel: getFilteredRowModel(),
        getPaginationRowModel: getPaginationRowModel(),
        manualPagination: true,
        pageCount: totalPages,
        meta: {
            updateRow,
            saveRow,
            cancelChanges
        }
    });

    return (
        <div className="space-y-4">
            <Input
              placeholder="Filtrar por nombre..."
              value={(table.getColumn("name")?.getFilterValue() as string) ?? ""}
              onChange={(event) => table.getColumn("name")?.setFilterValue(event.target.value)}
              className="max-w-sm"
            />
            <div className="rounded-md border">
                <Table>
                    <TableHeader>
                        {table.getHeaderGroups().map(headerGroup => (
                            <TableRow key={headerGroup.id}>
                                {headerGroup.headers.map(header => (
                                    <TableHead key={header.id}>
                                        {header.isPlaceholder ? null : flexRender(header.column.columnDef.header, header.getContext())}
                                    </TableHead>
                                ))}
                            </TableRow>
                        ))}
                    </TableHeader>
                    <TableBody>
                        {isLoading ? (
                            <TableRow><TableCell colSpan={table.getAllColumns().length} className="h-24 text-center"><Loader2 className="h-8 w-8 animate-spin mx-auto" /></TableCell></TableRow>
                        ) : table.getRowModel().rows.length ? (
                            table.getRowModel().rows.map(row => (
                                <TableRow key={row.id} data-state={row.getIsSelected() && "selected"} className={row.original.isEditing ? "bg-accent/50" : ""}>
                                    {row.getVisibleCells().map(cell => (
                                        <TableCell key={cell.id}>
                                            {isSaving === row.index && cell.column.id === 'actions' ? <Loader2 className="h-5 w-5 animate-spin"/> : flexRender(cell.column.columnDef.cell, cell.getContext())}
                                        </TableCell>
                                    ))}
                                </TableRow>
                            ))
                        ) : (
                            <TableRow><TableCell colSpan={table.getAllColumns().length} className="h-24 text-center">No se encontraron productos.</TableCell></TableRow>
                        )}
                    </TableBody>
                </Table>
            </div>
             <div className="flex items-center justify-end space-x-2 py-4">
                <div className="flex-1 text-sm text-muted-foreground">
                  {table.getFilteredSelectedRowModel().rows.length} de{" "}
                  {data.length} fila(s) seleccionadas.
                </div>
                <div className="space-x-2">
                  <Button variant="outline" size="sm" onClick={() => table.previousPage()} disabled={!table.getCanPreviousPage()}>Anterior</Button>
                  <Button variant="outline" size="sm" onClick={() => table.nextPage()} disabled={!table.getCanNextPage()}>Siguiente</Button>
                </div>
            </div>
        </div>
    );
}
