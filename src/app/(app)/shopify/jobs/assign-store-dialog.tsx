
"use client";

import React, { useState } from 'react';
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  DialogClose,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { auth } from '@/lib/firebase';
import { ShopifyCreationJob } from '@/lib/types';
import { Loader2 } from 'lucide-react';

interface AssignStoreDialogProps {
  job: ShopifyCreationJob | null;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
  onError: (error: { code: string; message: string }) => void;
}

export function AssignStoreDialog({ job, onOpenChange, onSuccess, onError }: AssignStoreDialogProps) {
  const [storeDomain, setStoreDomain] = useState('');
  const [shopId, setShopId] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const { toast } = useToast();

  const handleAssign = async () => {
    if (!job || !storeDomain || !shopId) {
      toast({ title: "Datos incompletos", description: "Debes proporcionar el dominio y el ID de la tienda.", variant: "destructive" });
      return;
    }
    
    if (!storeDomain.includes('.myshopify.com')) {
         toast({ title: "Dominio inválido", description: "El dominio debe ser una URL de .myshopify.com", variant: "destructive" });
        return;
    }

    setIsSubmitting(true);
    const user = auth.currentUser;
    if (!user) {
        toast({ title: 'No autenticado', variant: 'destructive'});
        setIsSubmitting(false);
        return;
    }

    try {
        const token = await user.getIdToken();
        const response = await fetch(`/api/shopify/jobs/${job.id}/assign`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
            body: JSON.stringify({ storeDomain, shopId }),
        });

        const result = await response.json();
        if (!response.ok) {
            if (response.status === 409 && result.error?.code === 'CONFIGURATION_ERROR') {
                 onError(result.error);
            } else {
                throw new Error(result.error || 'Fallo al asignar la tienda.');
            }
        } else {
            toast({ title: '¡Tienda Asignada!', description: `La tienda ${storeDomain} ha sido asignada al trabajo.` });
            onSuccess();
        }
    } catch (error: any) {
        onError({ code: 'GENERIC_ERROR', message: error.message });
    } finally {
        setIsSubmitting(false);
    }
  };
  
  if (!job) return null;

  return (
    <Dialog open={!!job} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Asignar Tienda de Desarrollo</DialogTitle>
          <DialogDescription>
            Asigna una tienda de desarrollo vacía (plantilla) al trabajo para "{job.storeName}".
            Esta acción no se puede deshacer.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 py-4">
          <div className="space-y-2">
            <Label htmlFor="shopId">ID de la Tienda</Label>
            <Input
              id="shopId"
              value={shopId}
              onChange={(e) => setShopId(e.target.value)}
              placeholder="Ej: 85246282570"
            />
             <p className="text-xs text-muted-foreground">Puedes encontrar el ID en la URL del panel de Shopify, después de <code className="bg-muted px-1 rounded">/store/</code>.</p>
          </div>
          <div className="space-y-2">
            <Label htmlFor="storeDomain">Dominio de la Tienda</Label>
            <Input
              id="storeDomain"
              value={storeDomain}
              onChange={(e) => setStoreDomain(e.target.value)}
              placeholder="tu-tienda-plantilla.myshopify.com"
            />
             <p className="text-xs text-muted-foreground">El dominio completo .myshopify.com de la tienda.</p>
          </div>
        </div>
        <DialogFooter>
          <DialogClose asChild><Button type="button" variant="secondary">Cancelar</Button></DialogClose>
          <Button type="button" onClick={handleAssign} disabled={isSubmitting}>
            {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Asignar y Continuar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
