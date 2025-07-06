
"use client"

import { ColumnDef } from "@tanstack/react-table"
import Image from "next/image"
import Link from "next/link"
import { ArrowUpDown, MoreHorizontal, Eye, EyeOff, Pencil, ExternalLink, Trash2, ChevronRight, Package, Ruler, Truck } from "lucide-react"

import { Button, buttonVariants } from "@/components/ui/button"
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
import type { HierarchicalProduct } from "@/lib/types"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog"
import { cn } from "@/lib/utils"


export const getColumns = (
  handleStatusUpdate: (productId: number, newStatus: 'publish' | 'draft') => void,
  handleEdit: (productId: number) => void,
  handleDelete: (productId: number) => void,
): ColumnDef<HierarchicalProduct>[] => [
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
          className="w-[350px]"
        >
          Producto
          <ArrowUpDown className="ml-2 h-4 w-4" />
        </Button>
      )
    },
    cell: ({ row }) => {
      const product = row.original;
      return (
        <div style={{ paddingLeft: `${row.depth * 2}rem` }} className="flex items-center gap-3">
           {row.getCanExpand() && (
             <button
                {...{
                  onClick: row.getToggleExpandedHandler(),
                  style: { cursor: 'pointer' },
                }}
              >
               <ChevronRight className={cn("h-4 w-4 transition-transform", row.getIsExpanded() && 'rotate-90')} />
            </button>
          )}
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
        <div className="text-center">
        <Button
          variant="ghost"
          onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
        >
          Estado
          <ArrowUpDown className="ml-2 h-4 w-4" />
        </Button>
        </div>
      )
    },
    cell: ({ row }) => {
      const status = row.getValue("status") as string;
      const statusText = {
        publish: 'Publicado',
        draft: 'Borrador',
        pending: 'Pendiente',
        private: 'Privado',
        trash: 'En Papelera',
      }[status] || status;
      
      let variant: "default" | "secondary" | "destructive" = 'secondary';
      if (status === 'publish') variant = 'default';
      if (status === 'trash') variant = 'destructive';

      return <div className="text-center"><Badge variant={variant}>{statusText}</Badge></div>
    }
  },
  {
    accessorKey: "lang",
    header: () => <div className="text-center">Idioma</div>,
    cell: ({ row }) => {
      const lang = row.original.lang;
      const translations = row.original.translations || {};
      const translationCount = Object.keys(translations).length - 1; // -1 for the current post itself

      const badge = <Badge variant="outline" className="uppercase">{lang || 'N/A'}</Badge>;

      if (translationCount > 0) {
        return (
          <div className="text-center">
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <div className="flex items-center justify-center gap-1.5 cursor-help">
                    {badge}
                    <span className="text-muted-foreground text-xs font-bold">+{translationCount}</span>
                  </div>
                </TooltipTrigger>
                <TooltipContent>
                  <p>Enlazado con {translationCount} otra(s) traducción(es).</p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </div>
        );
      }
      return <div className="text-center">{badge}</div>;
    }
  },
  {
    accessorKey: "type",
    header: () => <div className="text-center">Tipo</div>,
    cell: ({ row }) => <div className="text-center"><Badge variant="secondary">{row.original.type}</Badge></div>
  },
  {
    id: "logistics",
    header: () => <div className="text-center">Logística</div>,
    cell: ({ row }) => {
      const { manage_stock, stock_quantity, weight, dimensions, shipping_class } = row.original;
      const hasWeightOrDims = (weight && parseFloat(weight) > 0) || (dimensions && (parseFloat(dimensions.length) > 0 || parseFloat(dimensions.width) > 0 || parseFloat(dimensions.height) > 0));
      const hasShippingClass = !!shipping_class;
      
      return (
        <TooltipProvider>
            <div className="flex items-center justify-center gap-3">
            {manage_stock && (
                <Tooltip>
                    <TooltipTrigger><Package className="h-4 w-4 text-primary" /></TooltipTrigger>
                    <TooltipContent>Stock: {stock_quantity ?? 'N/A'}</TooltipContent>
                </Tooltip>
            )}
            {hasWeightOrDims && (
                <Tooltip>
                    <TooltipTrigger><Ruler className="h-4 w-4 text-primary" /></TooltipTrigger>
                    <TooltipContent>
                        {weight && `Peso: ${weight} kg`}
                        {weight && dimensions && <br />}
                        {dimensions && `Dims: ${dimensions.length || 'N/A'}x${dimensions.width || 'N/A'}x${dimensions.height || 'N/A'} cm`}
                    </TooltipContent>
                </Tooltip>
            )}
            {hasShippingClass && (
                 <Tooltip>
                    <TooltipTrigger><Truck className="h-4 w-4 text-primary" /></TooltipTrigger>
                    <TooltipContent>Clase de envío: {shipping_class}</TooltipContent>
                </Tooltip>
            )}
            {!manage_stock && !hasWeightOrDims && !hasShippingClass && (
                <span className="text-xs text-muted-foreground">-</span>
            )}
            </div>
        </TooltipProvider>
      );
    }
  },
  {
    accessorKey: "price",
    header: () => <div className="text-right">Precio</div>,
    cell: ({ row }) => {
      const regularPriceVal = parseFloat(row.original.regular_price);
      const salePriceVal = parseFloat(row.original.sale_price);

      const hasSale = !isNaN(salePriceVal) && salePriceVal > 0 && salePriceVal < regularPriceVal;
      const hasRegular = !isNaN(regularPriceVal) && regularPriceVal > 0;

      if (!hasRegular && !hasSale) {
        return <div className="text-right font-medium text-muted-foreground">N/A</div>;
      }

      const formatCurrency = (value: number) => new Intl.NumberFormat("es-ES", {
        style: "currency",
        currency: "EUR",
      }).format(value);

      return (
        <div className="text-right font-medium">
          {hasSale ? (
            <div>
              <span className="text-xs text-muted-foreground line-through">
                {formatCurrency(regularPriceVal)}
              </span>
              <br />
              <span className="text-primary">{formatCurrency(salePriceVal)}</span>
            </div>
          ) : (
            hasRegular && <span>{formatCurrency(regularPriceVal)}</span>
          )}
        </div>
      );
    },
  },
  {
    accessorKey: "date_created",
    header: ({ column }) => {
      return (
        <div className="text-center">
        <Button
          variant="ghost"
          onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
        >
          Fecha de Creación
          <ArrowUpDown className="ml-2 h-4 w-4" />
        </Button>
        </div>
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
      return <div className="text-center">{formattedDate}</div>;
    },
  },
  {
    id: "actions",
    cell: ({ row }) => {
      const product = row.original

      return (
        <AlertDialog>
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
              <DropdownMenuItem asChild disabled={!product.permalink}>
                <Link href={product.permalink || ''} target="_blank" rel="noopener noreferrer">
                  <ExternalLink className="mr-2 h-4 w-4" />
                  Ver en la tienda
                </Link>
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <AlertDialogTrigger asChild>
                <DropdownMenuItem className="text-destructive focus:bg-destructive/10 focus:text-destructive">
                    <Trash2 className="mr-2 h-4 w-4" />
                    Eliminar permanentemente
                </DropdownMenuItem>
              </AlertDialogTrigger>
            </DropdownMenuContent>
          </DropdownMenu>
          <AlertDialogContent>
              <AlertDialogHeader>
                  <AlertDialogTitle>¿Estás absolutamente seguro?</AlertDialogTitle>
                  <AlertDialogDescription>
                      Esta acción no se puede deshacer. Se eliminará permanentemente el producto 
                      <strong className="mx-1">{product.name}</strong> 
                      y todos sus datos asociados.
                  </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                  <AlertDialogCancel>Cancelar</AlertDialogCancel>
                  <AlertDialogAction 
                      className={buttonVariants({ variant: "destructive" })}
                      onClick={() => handleDelete(product.id)}
                  >
                    Sí, eliminar producto
                  </AlertDialogAction>
              </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      )
    },
  },
]
