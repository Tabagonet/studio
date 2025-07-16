

"use client";

import { ColumnDef } from "@tanstack/react-table";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { ArrowUpDown, ChevronRight } from "lucide-react";
import type { HierarchicalContentItem, ContentItem } from "@/lib/types";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

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

export const getColumns = (): ColumnDef<HierarchicalContentItem>[] => [
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
                    <button onClick={row.getToggleExpandedHandler()} className="cursor-pointer p-1 -ml-1">
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
        cell: ({ row }) => {
            const score = row.original.score;
            return (
                <div className="text-right">
                    <ScoreBadge score={score} />
                </div>
            )
        },
    },
];
