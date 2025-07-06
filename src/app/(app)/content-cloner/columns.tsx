
"use client";

import { ColumnDef } from "@tanstack/react-table";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { ArrowUpDown, ChevronRight } from "lucide-react";
import type { ContentItem as RawContentItem } from "@/lib/types";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

type ContentItem = RawContentItem & { subRows: ContentItem[] };

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

export const getColumns = (): ColumnDef<ContentItem>[] => [
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
    header: ({ column }) => {
      return (
        <Button
          variant="ghost"
          onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
        >
          Título
          <ArrowUpDown className="ml-2 h-4 w-4" />
        </Button>
      )
    },
    cell: ({ row, getValue }) => (
      <div
        style={{ paddingLeft: `${row.depth * 1.5}rem` }}
        className="flex items-center gap-1"
      >
        {row.getCanExpand() ? (
          <button
            onClick={row.getToggleExpandedHandler()}
            className="cursor-pointer p-1 -ml-1"
            aria-label={row.getIsExpanded() ? 'Contraer fila' : 'Expandir fila'}
          >
            <ChevronRight className={cn("h-4 w-4 transition-transform", row.getIsExpanded() && 'rotate-90')} />
          </button>
        ) : (
          row.depth > 0 && <span className="w-4 h-4 text-muted-foreground ml-1">↳</span>
        )}
        <span className="font-medium">{getValue<string>()}</span>
      </div>
    ),
  },
  {
    accessorKey: 'type',
    header: 'Tipo',
    cell: ({ getValue }) => {
      const type = getValue<string>();
      let variant: "secondary" | "outline" | "default" = "secondary";
      if (type === 'Page') variant = 'outline';
      if (type === 'Producto') variant = 'default';

      return <Badge variant={variant}>{type}</Badge>
    }
  },
  {
    accessorKey: 'status',
    header: 'Estado',
    cell: ({ getValue }) => <Badge variant={getValue<string>() === 'publish' ? 'default' : 'secondary'}>{getStatusText(getValue<ContentItem['status']>())}</Badge>
  },
  {
    accessorKey: 'lang',
    header: 'Idioma',
    cell: ({ getValue }) => <Badge variant="outline" className="uppercase">{getValue<string>() || 'N/A'}</Badge>,
  },
];
