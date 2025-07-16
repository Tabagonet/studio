
"use client";

import { ColumnDef } from "@tanstack/react-table";
import { Button } from "@/components/ui/button";
import { ArrowUpDown, SearchCheck, Edit, Loader2, FileText, ChevronRight } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import type { ContentItem, HierarchicalContentItem } from '@/lib/types';
import { useRouter } from 'next/navigation';
import { Checkbox } from "@/components/ui/checkbox";
import { cn } from "@/lib/utils";

const getStatusText = (status: ContentItem['status']) => {
    const statusMap: { [key: string]: string } = {
        publish: 'Publicado',
        draft: 'Borrador',
        pending: 'Pendiente',
        private: 'Privado',
        future: 'Programado',
    };
    return statusMap[status] || status;
};

const ScoreBadge = ({ score }: { score: number | undefined }) => {
    if (score === undefined) return null;
    const scoreColor = score >= 80 ? 'bg-green-500' : score >= 50 ? 'bg-amber-500' : 'bg-destructive';
    return <Badge className={cn("text-white", scoreColor)}>{score}</Badge>;
};

export const getColumns = (
    onAnalyze: (item: ContentItem) => void,
    onEdit: (item: ContentItem) => void,
    isAnalyzingId: number | null
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
        id: 'actions',
        header: () => <div className="text-right">Acciones</div>,
        cell: ({ row }) => {
            const item = row.original;
            const router = useRouter();
            const hasScore = row.original.score !== undefined && row.original.score !== null;

            const handleViewReport = () => {
                router.push(`/seo-optimizer?id=${item.id}&type=${item.type}`);
            };

            return (
                <div className="text-right space-x-2">
                    <Button onClick={() => onEdit(item)} size="sm" variant="outline">
                        <Edit className="mr-2 h-4 w-4" /> Editar
                    </Button>
                    {hasScore ? (
                        <Button onClick={handleViewReport} size="sm" variant="secondary" className="group">
                             <FileText className="mr-2 h-4 w-4" />
                             Ver Informe
                             <Badge className="ml-2 text-white bg-blue-500">{item.score}</Badge>
                        </Button>
                    ) : (
                        <Button onClick={() => onAnalyze(item)} size="sm" disabled={isAnalyzingId === item.id}>
                            {isAnalyzingId === item.id ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <SearchCheck className="mr-2 h-4 w-4" />}
                            Analizar SEO
                        </Button>
                    )}
                </div>
            );
        },
    },
];
