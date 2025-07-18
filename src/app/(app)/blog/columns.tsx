

"use client"

import { ColumnDef } from "@tanstack/react-table"
import Image from "next/image"
import Link from "next/link"
import { ArrowUpDown, MoreHorizontal, Eye, EyeOff, Pencil, ExternalLink, Trash2, ChevronRight, Tags } from "lucide-react"
import { Checkbox } from "@/components/ui/checkbox"

import { Button, buttonVariants } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  DropdownMenuSub,
  DropdownMenuSubTrigger,
  DropdownMenuPortal,
  DropdownMenuSubContent,
} from "@/components/ui/dropdown-menu"
import { Badge } from "@/components/ui/badge"
import type { HierarchicalBlogPost, WordPressPostCategory } from "@/lib/types"
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog"
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import { cn } from "@/lib/utils"


export const getColumns = (
  handleStatusUpdate: (postId: number, newStatus: 'publish' | 'draft') => void,
  handleEdit: (postId: number) => void,
  handleDelete: (postId: number) => void,
  handleCategoryUpdate: (postIds: number[], categoryId: number) => void,
  categories: WordPressPostCategory[] = [], // Pass categories as a prop
): ColumnDef<HierarchicalBlogPost>[] => [
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
    accessorKey: "title",
    header: ({ column }) => (
        <Button variant="ghost" onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}>
            Título <ArrowUpDown className="ml-2 h-4 w-4" />
        </Button>
    ),
    cell: ({ row }) => {
      const post = row.original
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
            src={post.featured_image_url || "https://placehold.co/64x64.png"}
            alt={post.title}
            width={48}
            height={48}
            className="rounded-md object-cover h-12 w-12"
          />
          <span className="font-medium max-w-xs truncate">{post.title}</span>
        </div>
      )
    }
  },
  {
    accessorKey: "author_name",
    header: "Autor",
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
        future: 'Programado',
        trash: 'En Papelera',
      };
      
      let variant: "default" | "secondary" | "destructive" = 'secondary';
      if (status === 'publish') variant = 'default';
      if (status === 'trash') variant = 'destructive';

      return <Badge variant={variant}>{statusText[status] || status}</Badge>
    }
  },
  {
    accessorKey: "lang",
    header: "Idioma",
    cell: ({ row }) => {
      const lang = row.original.lang;
      const translations = row.original.translations || {};
      const translationCount = Object.keys(translations).length - 1; // -1 for the current post itself

      const badge = <Badge variant="outline" className="uppercase">{lang || 'N/A'}</Badge>;

      if (translationCount > 0) {
        return (
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <div className="flex items-center gap-1.5 cursor-help">
                  {badge}
                  <span className="text-muted-foreground text-xs font-bold">+{translationCount}</span>
                </div>
              </TooltipTrigger>
              <TooltipContent>
                <p>Enlazado con {translationCount} otra(s) traducción(es).</p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        );
      }
      return badge;
    }
  },
  {
    accessorKey: "categories",
    header: "Categorías",
    cell: ({ row }) => {
      const categories = row.original.categories;
      if (!categories || categories.length === 0) return <span className="text-muted-foreground">N/A</span>;
      return (
        <div className="flex flex-wrap gap-1">
          {categories.slice(0, 2).map(cat => <Badge key={cat.id} variant="outline">{cat.name}</Badge>)}
          {categories.length > 2 && <Badge variant="outline">+{categories.length - 2}</Badge>}
        </div>
      );
    },
  },
  {
    accessorKey: "date_created",
    header: ({ column }) => (
        <Button variant="ghost" onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}>
            Fecha <ArrowUpDown className="ml-2 h-4 w-4" />
        </Button>
    ),
    cell: ({ row }) => {
      const date = row.getValue("date_created") as string;
      if (!date) return 'N/A';
      return <div>{new Date(date).toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit', year: 'numeric' })}</div>;
    },
  },
  {
    id: "actions",
    cell: ({ row }) => {
      const post = row.original
      return (
        <AlertDialog>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" className="h-8 w-8 p-0"><span className="sr-only">Abrir menú</span><MoreHorizontal className="h-4 w-4" /></Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuLabel>Acciones Rápidas</DropdownMenuLabel>
              <DropdownMenuItem onClick={() => handleEdit(post.id)}><Pencil className="mr-2 h-4 w-4" /> Editar entrada</DropdownMenuItem>
              {post.status === 'publish' ? (
                <DropdownMenuItem onClick={() => handleStatusUpdate(post.id, 'draft')}><EyeOff className="mr-2 h-4 w-4" /> Ocultar (Borrador)</DropdownMenuItem>
              ) : (
                <DropdownMenuItem onClick={() => handleStatusUpdate(post.id, 'publish')}><Eye className="mr-2 h-4 w-4" /> Publicar</DropdownMenuItem>
              )}
              <DropdownMenuItem asChild disabled={!post.link}><Link href={post.link || ''} target="_blank" rel="noopener noreferrer"><ExternalLink className="mr-2 h-4 w-4" /> Ver en la web</Link></DropdownMenuItem>
              
              <DropdownMenuSub>
                <DropdownMenuSubTrigger>
                    <Tags className="mr-2 h-4 w-4" />
                    Cambiar Categoría
                </DropdownMenuSubTrigger>
                <DropdownMenuPortal>
                    <DropdownMenuSubContent>
                         {categories.map((cat) => (
                            <DropdownMenuItem key={cat.id} onSelect={() => handleCategoryUpdate([post.id], cat.id)}>
                                {cat.name}
                            </DropdownMenuItem>
                         ))}
                         {categories.length === 0 && <DropdownMenuItem disabled>No hay categorías</DropdownMenuItem>}
                    </DropdownMenuSubContent>
                </DropdownMenuPortal>
              </DropdownMenuSub>

              <DropdownMenuSeparator />
              <AlertDialogTrigger asChild>
                <DropdownMenuItem className="text-destructive focus:bg-destructive/10 focus:text-destructive"><Trash2 className="mr-2 h-4 w-4" /> Mover a la papelera</DropdownMenuItem>
              </AlertDialogTrigger>
            </DropdownMenuContent>
          </DropdownMenu>
          <AlertDialogContent>
              <AlertDialogHeader>
                  <AlertDialogTitle>¿Mover a la papelera?</AlertDialogTitle>
                  <AlertDialogDescription>La entrada <strong className="mx-1">{post.title}</strong> se moverá a la papelera de WordPress. Podrás restaurarla o eliminarla permanentemente desde allí.</AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                  <AlertDialogCancel>Cancelar</AlertDialogCancel>
                  <AlertDialogAction className={buttonVariants({ variant: "destructive" })} onClick={() => handleDelete(post.id)}>Sí, mover a la papelera</AlertDialogAction>
              </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      )
    },
  },
]
