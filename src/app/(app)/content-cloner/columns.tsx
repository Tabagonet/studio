
"use client";

import { ColumnDef } from "@tanstack/react-table";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { ArrowUpDown, Languages } from "lucide-react";
import type { ContentItem } from "@/lib/types";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

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
    cell: ({ row, getValue }) => {
        const hasTranslations = Object.keys(row.original.translations || {}).length > 1;
        return (
             <div className="flex items-center gap-2">
                {hasTranslations && (
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Languages className="h-4 w-4 text-muted-foreground" />
                      </TooltipTrigger>
                      <TooltipContent>
                        <p>Tiene traducciones enlazadas</p>
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                )}
                <span className="font-medium">{getValue<string>()}</span>
             </div>
        )
    },
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
    cell: ({ getValue }) => {
        const status = getValue<ContentItem['status']>();
        let variant: "default" | "secondary" | "destructive" = "secondary";
        if (status === 'publish') variant = "default";
        if (status === 'trash') variant = "destructive";

        return <Badge variant={variant}>{getStatusText(status)}</Badge>;
    }
  },
  {
    accessorKey: 'lang',
    header: 'Idioma',
    cell: ({ getValue }) => <Badge variant="outline" className="uppercase">{getValue<string>() || 'N/A'}</Badge>,
  },
];
