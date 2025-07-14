
"use client";

import React from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { AlertCircle, Loader2, Save, Trash2, CheckCircle } from "lucide-react";
import type { PartnerAppConnectionData } from '@/lib/api-helpers';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog';
import { Alert, AlertTitle, AlertDescription } from '@/components/ui/alert';
import Link from 'next/link';

interface ShopifyPartnerCardProps {
  editingTarget: { type: 'user' | 'company'; id: string | null; name: string };
  partnerFormData: PartnerAppConnectionData;
  onPartnerFormDataChange: (data: PartnerAppConnectionData) => void;
  onSave: () => void;
  isSavingPartner: boolean;
  onDelete: () => void;
  isDeleting: boolean;
  isConnectionVerified: boolean | undefined;
  isVerifying: boolean;
}

const ConnectionStatus = ({ isVerified, isVerifying }: { isVerified: boolean | undefined, isVerifying: boolean }) => {
    if (isVerifying) {
        return <div className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin"/> Verificando...</div>
    }
    if (isVerified === undefined) return null;
    
    if (isVerified) {
        return <div className="flex items-center gap-2 text-sm text-green-600 font-medium"><CheckCircle className="h-4 w-4"/> Conectado</div>
    }

    return <div className="flex items-center gap-2 text-sm text-destructive font-medium"><AlertCircle className="h-4 w-4"/> Error en la conexión</div>
}

export function ShopifyPartnerCard({
  editingTarget,
  partnerFormData,
  onPartnerFormDataChange,
  onSave,
  isSavingPartner,
  onDelete,
  isDeleting,
  isConnectionVerified,
  isVerifying,
}: ShopifyPartnerCardProps) {
  
  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    onPartnerFormDataChange({ ...partnerFormData, [name]: value });
  };
  
  return (
    <Card className="mt-8 border-primary/50">
      <CardHeader>
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
            <div>
                <CardTitle>Conexión Global de Shopify Partners</CardTitle>
                <CardDescription>
                Credenciales para crear tiendas para <strong>{editingTarget.name}</strong>.
                </CardDescription>
            </div>
             <ConnectionStatus isVerified={isConnectionVerified} isVerifying={isVerifying} />
        </div>
      </CardHeader>
      <CardContent className="space-y-6">
        <Alert>
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>¿Cómo obtener las credenciales?</AlertTitle>
          <AlertDescription>
            Sigue nuestra <Link href="/docs/SHOPIFY_PARTNER_APP_SETUP.md" target="_blank" className="font-semibold underline">guía paso a paso</Link> para generar un Token de Acceso para tu organización de Partner.
          </AlertDescription>
        </Alert>
        
        <div className="grid grid-cols-1 gap-4">
          <div>
            <Label htmlFor="partnerShopDomain">Dominio de tu Tienda de Partner (.myshopify.com)</Label>
            <Input id="partnerShopDomain" name="partnerShopDomain" value={partnerFormData?.partnerShopDomain || ''} onChange={handleInputChange} placeholder="ej: tu-agencia.myshopify.com" disabled={isSavingPartner} />
          </div>
          <div>
            <Label htmlFor="partnerApiToken">Token de Acceso de la API de Admin (shpat_...)</Label>
            <Input id="partnerApiToken" name="partnerApiToken" type="password" value={partnerFormData?.partnerApiToken || ''} onChange={handleInputChange} placeholder="••••••••••••••••••••••••••••••••••••" disabled={isSavingPartner} />
          </div>
        </div>
        <div className="flex flex-col sm:flex-row items-center justify-between gap-4 pt-4 border-t">
          <div className="flex items-center gap-2 flex-wrap">
            <Button onClick={onSave} disabled={isSavingPartner}>
              {isSavingPartner ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="h-4 w-4 mr-2"/>}
              Guardar Credenciales de Partner
            </Button>
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button variant="destructive" disabled={isSavingPartner || isDeleting}>
                  <Trash2 className="mr-2 h-4 w-4" /> Borrar
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>¿Confirmar eliminación?</AlertDialogTitle>
                  <AlertDialogDescription>
                    Esta acción eliminará permanentemente las credenciales de Shopify Partner.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancelar</AlertDialogCancel>
                  <AlertDialogAction onClick={onDelete} className="bg-destructive hover:bg-destructive/90">
                    Sí, eliminar
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
