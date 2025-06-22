
"use client"

import { ColumnDef } from "@tanstack/react-table"
import Image from "next/image"
import { ArrowUpDown, MoreHorizontal, Eye, EyeOff, Pencil, CheckCircle2, XCircle } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Badge } from "@/components/ui/badge"
import type { ProductSearchResult } from "@/lib/types"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"

export const getColumns = (
  handleStatusUpdate: (productId: number, newStatus: 'publish' | 'draft') => void,
  handleEdit: (productId: number) => void,
): ColumnDef<ProductSearchResult>[] => [
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
    header: ({ column }) => {
      return (
        <Button
          variant="ghost"
          onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
        >
          Producto
          <ArrowUpDown className="ml-2 h-4 w-4" />
        </Button>
      )
    },
    cell: ({ row }) => {
      const product = row.original
      return (
        <div className="flex items-center gap-3">
          <Image
            src={product.image || "https://placehold.co/64x64.png"}
            alt={product.name}
            width={48}
            height={48}
            className="rounded-md object-cover h-12 w-12"
          />
          <div className="flex flex-col">
            <span className="font-medium max-w-xs truncate">{product.name}</span>
            <span className="text-xs text-muted-foreground">{product.sku || "Sin SKU"}</span>
          </div>
        </div>
      )
    }
  },
  {
    accessorKey: "status",
    header: ({ column }) => {
      return (
        <Button
          variant="ghost"
          onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
        >
          Estado
          <ArrowUpDown className="ml-2 h-4 w-4" />
        </Button>
      )
    },
    cell: ({ row }) => {
      const status = row.getValue("status") as string;
      const statusText = {
        publish: 'Publicado',
        draft: 'Borrador',
        pending: 'Pendiente',
        private: 'Privado',
      }[status] || status;
      
      return <Badge variant={status === 'publish' ? 'default' : 'secondary'}>{statusText}</Badge>
    }
  },
  {
    accessorKey: "type",
    header: ({ column }) => {
      return (
        <Button
          variant="ghost"
          onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
        >
          Tipo
          <ArrowUpDown className="ml-2 h-4 w-4" />
        </Button>
      )
    },
    cell: ({ row }) => {
      const type = row.getValue("type") as string;
      const typeText = {
        simple: 'Simple',
        variable: 'Variable',
        grouped: 'Agrupado',
        external: 'Externo',
      }[type] || type;

      return <span className="capitalize">{typeText}</span>;
    },
  },
  {
    accessorKey: "stock_status",
    header: () => <div className="text-center">Stock</div>,
    cell: ({ row }) => {
      const stock_status = row.getValue("stock_status") as string;
      const centeredDiv = (child: React.ReactNode) => <div className="flex justify-center">{child}</div>;

      if (stock_status === 'instock') {
        return centeredDiv(
          <TooltipProvider delayDuration={100}>
            <Tooltip>
              <TooltipTrigger>
                <CheckCircle2 className="h-5 w-5 text-green-600" />
              </TooltipTrigger>
              <TooltipContent>
                <p>En Stock</p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        )
      }

      if (stock_status === 'outofstock') {
        return centeredDiv(
          <TooltipProvider delayDuration={100}>
            <Tooltip>
              <TooltipTrigger>
                <XCircle className="h-5 w-5 text-destructive" />
              </TooltipTrigger>
              <TooltipContent>
                <p>Agotado</p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        )
      }
      
      if (stock_status === 'onbackorder') {
          return centeredDiv(<Badge variant="secondary">En Reserva</Badge>)
      }

      return centeredDiv(<span className="text-muted-foreground text-sm">N/A</span>)
    },
  },
  {
    accessorKey: "price",
    header: () => <div className="text-right">Precio</div>,
    cell: ({ row }) => {
      const price = parseFloat(row.getValue("price"))
      const formatted = new Intl.NumberFormat("es-ES", {
        style: "currency",
        currency: "EUR",
      }).format(price)

      return <div className="text-right font-medium">{price ? formatted : "N/A"}</div>
    },
  },
  {
    accessorKey: "date_created",
    header: ({ column }) => {
      return (
        <Button
          variant="ghost"
          onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
        >
          Fecha
          <ArrowUpDown className="ml-2 h-4 w-4" />
        </Button>
      )
    },
    cell: ({ row }) => {
      const date = row.getValue("date_created") as string;
      if (!date) return 'N/A';
      const formattedDate = new Date(date).toLocaleDateString('es-ES', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric'
      });
      return <div>{formattedDate}</div>;
    },
  },
  {
    id: "actions",
    cell: ({ row }) => {
      const product = row.original

      return (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" className="h-8 w-8 p-0">
              <span className="sr-only">Abrir menú</span>
              <MoreHorizontal className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuLabel>Acciones Rápidas</DropdownMenuLabel>
            <DropdownMenuItem onClick={() => handleEdit(product.id)}>
              <Pencil className="mr-2 h-4 w-4" />
              Editar producto
            </DropdownMenuItem>
            {product.status === 'publish' ? (
              <DropdownMenuItem onClick={() => handleStatusUpdate(product.id, 'draft')}>
                <EyeOff className="mr-2 h-4 w-4" />
                Ocultar en la tienda
              </DropdownMenuItem>
            ) : (
              <DropdownMenuItem onClick={() => handleStatusUpdate(product.id, 'publish')}>
                <Eye className="mr-2 h-4 w-4" />
                Hacer Visible
              </DropdownMenuItem>
            )}
            <DropdownMenuSeparator />
             <DropdownMenuLabel>Otras Acciones</DropdownMenuLabel>
            <DropdownMenuItem
              onClick={() => navigator.clipboard.writeText(product.id.toString())}
            >
              Copiar ID del producto
            </DropdownMenuItem>
            <DropdownMenuItem disabled>Ver en la tienda</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      )
    },
  },
]
