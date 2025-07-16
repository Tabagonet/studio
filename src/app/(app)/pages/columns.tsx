

"use client";

import { ColumnDef } from "@tanstack/react-table";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { ArrowUpDown, ChevronRight, ExternalLink, MoreHorizontal, Pencil, Trash2 } from "lucide-react";
import type { HierarchicalContentItem, ContentItem } from "@/lib/types";
import { cn } from "@/lib/utils";
import { Button, buttonVariants } from "@/components/ui/button";
import { AlertDialog, AlertDialogTrigger, DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import Link from "next/link";


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
        accessorKey: "lang",
        header: "Idioma",
        cell: ({ row }) => <Badge variant="outline" className="uppercase">{row.original.lang || 'N/A'}</Badge>
    },
    {
        accessorKey: "modified",
        header: "Última Modificación",
        cell: ({ row }) => new Date(row.original.modified).toLocaleDateString('es-ES', { day: '2-digit', month: 'short', year: 'numeric' }),
    },
    {
        id: 'score',
        accessorKey: "score",
        header: () => <div className="text-right">Score SEO</div>,
        cell: ({ row }) => (
            <div className="text-right">
                <ScoreBadge score={row.original.score} />
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
                                <DropdownMenuItem onClick={() => onEdit(item)}><Pencil className="mr-2 h-4 w-4" /> Editar / Optimizar</DropdownMenuItem>
                                <DropdownMenuItem asChild><Link href={item.link} target="_blank" rel="noopener noreferrer"><ExternalLink className="mr-2 h-4 w-4" /> Ver en la web</Link></DropdownMenuItem>
                                <DropdownMenuSeparator />
                                <AlertDialogTrigger asChild>
                                    <DropdownMenuItem className="text-destructive focus:text-destructive"><Trash2 className="mr-2 h-4 w-4" /> Mover a la papelera</DropdownMenuItem>
                                </AlertDialogTrigger>
                            </DropdownMenuContent>
                        </DropdownMenu>
                         <AlertDialogContent>
                            <AlertDialogHeader><AlertDialogTitle>¿Mover a la papelera?</AlertDialogTitle><AlertDialogDescription>La página "{item.title}" se moverá a la papelera.</AlertDialogDescription></AlertDialogHeader>
                            <AlertDialogFooter><AlertDialogCancel>Cancelar</AlertDialogCancel><AlertDialogAction className={buttonVariants({ variant: "destructive" })} onClick={() => onDelete(item)}>Sí, mover</AlertDialogAction></AlertDialogFooter>
                        </AlertDialogContent>
                    </AlertDialog>
                 </div>
            )
        },
    },
];
