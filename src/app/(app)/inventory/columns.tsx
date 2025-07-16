"use client"

import { ColumnDef } from "@tanstack/react-table"
import Image from "next/image"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { HierarchicalProduct } from "@/lib/types"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"

export type EditableProduct = HierarchicalProduct & {
  isEditing?: boolean
  pendingChanges?: Partial<Pick<EditableProduct, 'regular_price' | 'sale_price' | 'stock_quantity' | 'manage_stock'>>
}

// Helper function for the input cells
const EditableCell = ({
  getValue,
  row,
  column,
  table,
}: {
  getValue: () => any
  row: any
  column: any
  table: any
}) => {
  const initialValue = getValue()
  const { updateRow } = table.options.meta || {}

  const onBlur = (event: React.FocusEvent<HTMLInputElement>) => {
    updateRow(row.index, column.id, event.target.value)
  }

  return (
    <Input
      defaultValue={initialValue}
      onBlur={onBlur}
      type="number"
      className="max-w-[120px] h-8"
      min="0"
    />
  )
}

const EditableStockCell = ({
  getValue,
  row,
  column,
  table,
}: {
  getValue: () => any
  row: any
  column: any
  table: any
}) => {
    const initialValue = getValue()
    const { updateRow } = table.options.meta || {}

    const onStockChange = (event: React.FocusEvent<HTMLInputElement>) => {
        updateRow(row.index, 'stock_quantity', event.target.value)
    }

    const onManageStockChange = (checked: boolean) => {
        updateRow(row.index, 'manage_stock', checked)
    }

    const manageStock = row.original.pendingChanges?.manage_stock ?? row.original.manage_stock;

    return (
        <div className="flex items-center gap-2">
            <Checkbox
                checked={manageStock}
                onCheckedChange={onManageStockChange}
            />
            <Input
                defaultValue={initialValue}
                onBlur={onStockChange}
                type="number"
                className="max-w-[100px] h-8"
                min="0"
                disabled={!manageStock}
            />
        </div>
    )
}

export const getColumns = (): ColumnDef<EditableProduct>[] => [
  {
    id: "select",
    header: ({ table }) => (
      <Checkbox
        checked={
          table.getIsAllPageRowsSelected() ||
          (table.getIsSomePageRowsSelected() && "indeterminate")
        }
        onCheckedChange={(value) => table.toggleAllPageRowsSelected(!!value)}
        aria-label="Seleccionar todas las filas"
      />
    ),
    cell: ({ row }) => (
      <Checkbox
        checked={row.getIsSelected()}
        onCheckedChange={(value) => row.toggleSelected(!!value)}
        aria-label="Seleccionar fila"
      />
    ),
    enableSorting: false,
    enableHiding: false,
  },
  {
    accessorKey: "name",
    header: "Producto",
    cell: ({ row }) => {
      const product = row.original;
      return (
        <div className="flex items-center gap-3">
          <Image
            src={product.image || "https://placehold.co/64x64.png"}
            alt={product.name}
            width={40}
            height={40}
            className="rounded-md object-cover h-10 w-10"
          />
          <div className="flex flex-col">
            <span className="font-medium max-w-xs truncate">{product.name}</span>
            <span className="text-xs text-muted-foreground">{product.sku || "Sin SKU"}</span>
          </div>
        </div>
      )
    },
    enableHiding: false,
  },
  {
    accessorKey: "status",
    header: "Estado",
    cell: ({ row }) => {
      const status = row.getValue("status") as string;
      const statusText: { [key: string]: string } = {
        publish: 'Publicado',
        draft: 'Borrador',
        pending: 'Pendiente',
        private: 'Privado',
      };
      
      let variant: "default" | "secondary" | "destructive" = 'secondary';
      if (status === 'publish') variant = 'default';

      return <Badge variant={variant}>{statusText[status] || status}</Badge>
    }
  },
  {
    accessorKey: 'regular_price',
    header: 'Precio Regular (€)',
    cell: EditableCell,
  },
  {
    accessorKey: 'sale_price',
    header: 'Precio Oferta (€)',
    cell: EditableCell,
  },
  {
    accessorKey: 'stock_quantity',
    header: 'Stock',
    cell: EditableStockCell,
  },
  {
    id: 'actions',
    cell: ({ table, row }) => {
        const { saveRow, cancelChanges } = table.options.meta as any;
        const isEditing = row.original.isEditing;

        if (!isEditing) return null;

        return (
            <div className="flex items-center gap-2">
                <Button size="sm" onClick={() => saveRow(row.index)}>
                    Guardar
                </Button>
                <Button size="sm" variant="outline" onClick={() => cancelChanges(row.index)}>
                    Cancelar
                </Button>
            </div>
        )
    }
  }
]
