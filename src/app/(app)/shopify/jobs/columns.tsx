
"use client";

import { ColumnDef } from "@tanstack/react-table";
import { ShopifyCreationJob } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { ArrowUpDown, ExternalLink, Loader2, CheckCircle, AlertCircle, Circle, LockOpen, Key } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { formatDistanceToNow } from 'date-fns';
import { es } from 'date-fns/locale';
import Link from 'next/link';
import { cn } from "@/lib/utils";

const StatusBadge = ({ status }: { status: ShopifyCreationJob['status'] }) => {
    let variant: 'default' | 'secondary' | 'destructive' | 'outline' = 'outline';
    let Icon = Circle;
    let label = "Pendiente";

    switch(status) {
        case 'processing':
            variant = 'secondary'; Icon = Loader2; label = "Procesando"; break;
        case 'awaiting_auth':
            variant = 'secondary'; Icon = LockOpen; label = "Esperando Autorización"; break;
        case 'authorized':
             variant = 'secondary'; Icon = CheckCircle; label = "Autorizado"; break;
        case 'completed':
            variant = 'default'; Icon = CheckCircle; label = "Completado"; break;
        case 'error':
            variant = 'destructive'; Icon = AlertCircle; label = "Error"; break;
    }
    
    return (
        <Badge variant={variant} className="capitalize">
            <Icon className={cn("mr-1 h-3 w-3", ['processing'].includes(status) && "animate-spin")} />
            {label}
        </Badge>
    );
};


export const getColumns = (): ColumnDef<ShopifyCreationJob>[] => [
  {
    accessorKey: "storeName",
    header: "Nombre de la Tienda",
    cell: ({ row }) => (
      <div className="font-medium">
        <div>{row.original.storeName}</div>
        <div className="text-xs text-muted-foreground">{row.original.businessEmail}</div>
      </div>
    ),
  },
  {
    accessorKey: "status",
    header: "Estado",
    cell: ({ row }) => <StatusBadge status={row.original.status} />,
  },
  {
    accessorKey: "createdAt",
    header: ({ column }) => {
        return (
          <Button variant="ghost" onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}>
            Fecha de Creación
            <ArrowUpDown className="ml-2 h-4 w-4" />
          </Button>
        )
    },
    cell: ({ row }) => {
        return <div>{formatDistanceToNow(new Date(row.original.createdAt), { addSuffix: true, locale: es })}</div>;
    },
  },
  {
    accessorKey: "updatedAt",
    header: "Última Actualización",
     cell: ({ row }) => {
        return <div>{formatDistanceToNow(new Date(row.original.updatedAt), { addSuffix: true, locale: es })}</div>;
    },
  },
  {
    id: "actions",
    cell: ({ row }) => {
      const job = row.original;
      const canAuthorize = job.status === 'awaiting_auth' && job.installUrl;
      const canOpenAdmin = job.status === 'completed' && job.createdStoreAdminUrl;

      return (
        <div className="text-right">
            {canAuthorize && (
                 <Button variant="default" size="sm" asChild>
                    <Link href={job.installUrl!} target="_blank" rel="noopener noreferrer">
                        <Key className="h-4 w-4 mr-2" />
                        Autorizar Instalación
                    </Link>
                </Button>
            )}
            {canOpenAdmin && (
                 <Button variant="outline" size="sm" asChild>
                    <Link href={job.createdStoreAdminUrl!} target="_blank" rel="noopener noreferrer">
                        <ExternalLink className="h-4 w-4 mr-2" />
                        Abrir Admin
                    </Link>
                </Button>
            )}
            {!canAuthorize && !canOpenAdmin && (
                <Button variant="outline" size="sm" disabled>
                    <ExternalLink className="h-4 w-4 mr-2" />
                    Abrir Admin
                </Button>
            )}
        </div>
      );
    },
  },
];
