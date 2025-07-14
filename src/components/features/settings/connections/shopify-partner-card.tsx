
"use client";

import React from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { AlertCircle, Loader2, Save, Trash2, CheckCircle, Link as LinkIcon } from "lucide-react";
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
  
  const handleConnect = () => {
    const { clientId } = partnerFormData;
    if (!clientId) {
      alert("Por favor, guarda primero tu Client ID.");
      return;
    }

    const scopes = "write_development_stores,read_development_stores";
    const redirectUri = `${process.env.NEXT_PUBLIC_BASE_URL}/api/shopify/auth/callback`;
    const state = `${editingTarget.type}:${editingTarget.id}`;

    const authUrl = `https://partners.shopify.com/oauth/authorize?client_id=${clientId}&scope=${scopes}&redirect_uri=${redirectUri}&state=${state}`;
    
    window.location.href = authUrl;
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
            Sigue nuestra <Link href="/docs/SHOPIFY_PARTNER_APP_SETUP.md" target="_blank" className="font-semibold underline">guía paso a paso</Link> para crear una App en tu Panel de Partner.
          </AlertDescription>
        </Alert>
        
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <Label htmlFor="clientId">Client ID</Label>
            <Input id="clientId" name="clientId" value={partnerFormData?.clientId || ''} onChange={handleInputChange} placeholder="Ej: 547a82a4abfb..." disabled={isSavingPartner} />
          </div>
          <div>
            <Label htmlFor="clientSecret">Client Secret</Label>
            <Input id="clientSecret" name="clientSecret" type="password" value={partnerFormData?.clientSecret || ''} onChange={handleInputChange} placeholder="••••••••••••••••••••••••••••••••" disabled={isSavingPartner} />
          </div>
        </div>

        <div className="flex flex-col sm:flex-row items-center justify-between gap-4 pt-4 border-t">
          <div className="flex items-center gap-2 flex-wrap">
            <Button onClick={onSave} disabled={isSavingPartner}>
              {isSavingPartner ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="h-4 w-4 mr-2"/>}
              Guardar Credenciales
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
          <Button onClick={handleConnect} disabled={isSavingPartner || !partnerFormData.clientId}>
            <LinkIcon className="mr-2 h-4 w-4" />
            Conectar con Shopify
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
