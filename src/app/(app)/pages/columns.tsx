

"use client";

import { ColumnDef } from "@tanstack/react-table";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { ArrowUpDown, ChevronRight, ExternalLink, MoreHorizontal, Edit, Trash2, FileText, ImageIcon, Home } from "lucide-react";
import type { HierarchicalContentItem, ContentItem } from "@/lib/types";
import { cn } from "@/lib/utils";
import { Button, buttonVariants } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import Link from "next/link";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";


const getStatusText = (status: ContentItem['status']) => {
    const statusMap: { [key: string]: string } = {
        publish: 'Publicado',
        draft: 'Borrador',
        pending: 'Pendiente',
        private: 'Privado',
        future: 'Programado',
        trash: 'En Papelera',
    };
    return statusMap[status] || status;
};

const ScoreBadge = ({ score }: { score: number | undefined }) => {
    if (score === undefined || score === null) {
      return <span className="text-muted-foreground">-</span>;
    }
    const scoreColor = score >= 80 ? 'bg-green-500' : score >= 50 ? 'bg-amber-500' : 'bg-destructive';
    return <Badge className={cn("text-white", scoreColor)}>{score}</Badge>;
};

export const getColumns = (
    onEdit: (item: ContentItem) => void,
    onDelete: (item: ContentItem) => void,
    onEditImages: (item: ContentItem) => void,
    scores: Record<number, number>
): ColumnDef<HierarchicalContentItem>[] => [
    {
        id: "select",
        header: ({ table }) => (
          <Checkbox
            checked={table.getIsAllPageRowsSelected() || (table.getIsSomePageRowsSelected() && "indeterminate")}
            onCheckedChange={(value) => table.toggleAllPageRowsSelected(!!value)}
            aria-label="Seleccionar todo"
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
        cell: ({ row, getValue }) => (
            <div style={{ paddingLeft: `${row.depth * 1.5}rem` }} className="flex items-center gap-1">
                {row.getCanExpand() && (
                    <button onClick={row.getToggleExpandedHandler()} className="cursor-pointer p-1 -ml-1" aria-label={row.getIsExpanded() ? 'Contraer fila' : 'Expandir fila'}>
                        <ChevronRight className={cn("h-4 w-4 transition-transform", row.getIsExpanded() && 'rotate-90')} />
                    </button>
                )}
                 {row.original.is_front_page && (
                    <TooltipProvider>
                      <Tooltip>
                        <TooltipTrigger asChild>
                           <Home className="h-4 w-4 text-primary flex-shrink-0" />
                        </TooltipTrigger>
                        <TooltipContent>
                          <p>Esta es la página de inicio de tu web.</p>
                        </TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                )}
                <span className="font-medium">{getValue<string>()}</span>
            </div>
        ),
    },
    {
        accessorKey: "status",
        header: "Estado",
        cell: ({ row }) => <Badge variant={row.original.status === 'publish' ? 'default' : 'secondary'}>{getStatusText(row.original.status)}</Badge>
    },
    {
        accessorKey: 'type',
        header: 'Tipo',
        cell: ({ getValue }) => {
          const type = getValue<string>();
          let variant: "secondary" | "outline" | "default" = "secondary";
          if (type.includes('Page') || type.includes('Página')) variant = 'outline';
          if (type.includes('Product') || type.includes('Producto')) variant = 'default';

          return <Badge variant={variant}>{type}</Badge>
        }
    },
    {
        accessorKey: "lang",
        header: "Idioma",
        cell: ({ row }) => {
            const lang = row.original.lang;
            const translationCount = Object.keys(row.original.translations || {}).length - 1;
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
        accessorKey: "modified",
        header: "Última Modificación",
        cell: ({ row }) => {
            if (!row.original.modified) return <span className="text-muted-foreground">-</span>;
            return new Date(row.original.modified).toLocaleDateString('es-ES', { day: '2-digit', month: 'short', year: 'numeric' })
        },
    },
    {
        id: 'score',
        accessorKey: "score",
        header: () => <div className="text-right">Score SEO</div>,
        cell: ({ row }) => (
            <div className="text-right">
                <ScoreBadge score={scores[row.original.id]} />
            </div>
        )
    },
    {
        id: "actions",
        cell: ({ row }) => {
            const item = row.original;
            return (
                 <div className="text-right">
                    <AlertDialog>
                        <DropdownMenu>
                            <DropdownMenuTrigger asChild><Button variant="ghost" className="h-8 w-8 p-0"><span className="sr-only">Abrir menú</span><MoreHorizontal className="h-4 w-4" /></Button></DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                                <DropdownMenuLabel>Acciones</DropdownMenuLabel>
                                <DropdownMenuItem onSelect={() => onEdit(item)}><Edit className="mr-2 h-4 w-4" /> Editar Contenido</DropdownMenuItem>
                                <DropdownMenuItem onClick={() => onEditImages(item)}><ImageIcon className="mr-2 h-4 w-4" /> Editar Imágenes</DropdownMenuItem>
                                <DropdownMenuSeparator />
                                <DropdownMenuItem asChild><Link href={item.link} target="_blank" rel="noopener noreferrer"><ExternalLink className="mr-2 h-4 w-4" /> Ver en la web</Link></DropdownMenuItem>
                                <DropdownMenuSeparator />
                                <AlertDialogTrigger asChild>
                                    <DropdownMenuItem className="text-destructive focus:text-destructive"><Trash2 className="mr-2 h-4 w-4" /> Mover a la papelera</DropdownMenuItem>
                                </AlertDialogTrigger>
                            </DropdownMenuContent>
                        </DropdownMenu>
                         <AlertDialogContent>
                            <AlertDialogHeader><AlertDialogTitle>¿Mover a la papelera?</AlertDialogTitle><AlertDialogDescription>El contenido "{item.title}" se moverá a la papelera de WordPress.</AlertDialogDescription></AlertDialogHeader>
                            <AlertDialogFooter><AlertDialogCancel>Cancelar</AlertDialogCancel><AlertDialogAction className={buttonVariants({ variant: "destructive" })} onClick={() => onDelete(item)}>Sí, mover</AlertDialogAction></AlertDialogFooter>
                        </AlertDialogContent>
                    </AlertDialog>
                 </div>
            )
        },
    },
];
