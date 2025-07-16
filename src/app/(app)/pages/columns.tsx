
"use client";

import { ColumnDef } from "@tanstack/react-table";
import { Button } from "@/components/ui/button";
import { ArrowUpDown, ExternalLink, SearchCheck, Edit, Loader2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import type { ContentItem } from "@/lib/types";
import Link from 'next/link';

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

export const getColumns = (
    onAnalyze: (item: ContentItem) => void,
    onEdit: (item: ContentItem) => void,
    isAnalyzingId: number | null
): ColumnDef<ContentItem>[] => [
    {
        accessorKey: "title",
        header: ({ column }) => (
            <Button variant="ghost" onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}>
                Título <ArrowUpDown className="ml-2 h-4 w-4" />
            </Button>
        ),
        cell: ({ row }) => {
            const item = row.original;
            return (
                <div style={{ paddingLeft: `${row.depth * 2}rem` }}>
                    <span className="font-medium">{item.title}</span>
                </div>
            );
        },
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
            return (
                <div className="text-right space-x-2">
                    <Button asChild size="sm" variant="outline">
                        <Link href={item.link} target="_blank" rel="noopener noreferrer">
                            <ExternalLink className="mr-2 h-4 w-4" /> Ver
                        </Link>
                    </Button>
                     <Button onClick={() => onEdit(item)} size="sm" variant="secondary">
                        <Edit className="mr-2 h-4 w-4" /> Editar
                    </Button>
                    <Button onClick={() => onAnalyze(item)} size="sm" disabled={isAnalyzingId === item.id}>
                        {isAnalyzingId === item.id ? (
                            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        ) : (
                            <SearchCheck className="mr-2 h-4 w-4" />
                        )}
                        Analizar SEO
                    </Button>
                </div>
            );
        },
    },
];
