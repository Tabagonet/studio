
"use client";

import React from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { AlertCircle, Copy, ExternalLink, Loader2, Link as LinkIcon, Save, Trash2 } from "lucide-react";
import type { PartnerAppConnectionData } from '@/lib/api-helpers';
import { useToast } from '@/hooks/use-toast';
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
}

export function ShopifyPartnerCard({
  editingTarget,
  partnerFormData,
  onPartnerFormDataChange,
  onSave,
  isSavingPartner,
  onDelete,
  isDeleting,
}: ShopifyPartnerCardProps) {
  const { toast } = useToast();
  const BASE_URL = process.env.NEXT_PUBLIC_BASE_URL || (typeof window !== 'undefined' ? window.location.origin : '');

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    onPartnerFormDataChange({ ...partnerFormData, [name]: value });
  };

  const handleConnect = () => {
    if (!BASE_URL) {
      toast({ title: 'Configuración Requerida', description: 'La variable NEXT_PUBLIC_BASE_URL no está configurada.', variant: 'destructive' });
      return;
    }

    if (!partnerFormData.clientId || !partnerFormData.partnerOrgId) {
      toast({ title: 'Datos Incompletos', description: 'El Client ID y el ID de Organización de Partner son necesarios para conectar.', variant: 'destructive' });
      return;
    }

    const redirectUri = `${BASE_URL}/api/shopify/auth/callback`;
    const scopes = 'write_development_stores';
    const state = `${editingTarget.type}:${editingTarget.id}`;
    
    // Correct URL for Partner App authorization
    const authUrl = `https://partners.shopify.com/${partnerFormData.partnerOrgId}/oauth/authorize?client_id=${partnerFormData.clientId}&scope=${scopes}&redirect_uri=${redirectUri}&state=${state}`;
    
    window.location.href = authUrl;
  };

  const REDIRECT_URI = BASE_URL ? `${BASE_URL}/api/shopify/auth/callback` : '';

  const handleCopy = (text: string | undefined) => {
    if (!text) return;
    navigator.clipboard.writeText(text);
    toast({ title: 'Copiado al portapapeles' });
  };
  
  return (
    <Card className="mt-8 border-primary/50">
      <CardHeader>
        <CardTitle>Conexión Global de Shopify Partners</CardTitle>
        <CardDescription>
          Introduce tus credenciales de aplicación de Partner para la creación automatizada de tiendas para <strong>{editingTarget.name}</strong>.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <Alert>
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>¿Cómo obtener las credenciales?</AlertTitle>
          <AlertDescription>
            Sigue nuestra <Link href="/docs/SHOPIFY_PARTNER_APP_SETUP.md" target="_blank" className="font-semibold underline">guía paso a paso</Link> para crear una aplicación personalizada en tu panel de Shopify Partner y obtener las credenciales.
          </AlertDescription>
        </Alert>
        
        {!BASE_URL && (
            <Alert variant="destructive">
                <AlertCircle className="h-4 w-4" />
                <AlertTitle>Configuración Requerida</AlertTitle>
                <AlertDescription>
                    La variable <strong>NEXT_PUBLIC_BASE_URL</strong> no está definida en tu entorno. Por favor, añádela a tu archivo <code className="font-mono text-xs">.env</code> para continuar.
                </AlertDescription>
            </Alert>
        )}

        <Alert variant="default" className="bg-muted">
          <AlertTitle>URLs Requeridas para la Configuración</AlertTitle>
          <AlertDescription className="space-y-3 mt-2">
            <p>Cuando configures tu aplicación en el panel de Shopify Partner, se te pedirán estas URLs:</p>
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">URL de la aplicación</Label>
              <div className="flex items-center gap-2">
                <Input readOnly value={BASE_URL || 'Configura NEXT_PUBLIC_BASE_URL'} className="text-xs h-8 bg-background" />
                <Button variant="outline" size="icon-sm" onClick={() => handleCopy(BASE_URL)} disabled={!BASE_URL}><Copy className="h-3 w-3" /></Button>
              </div>
            </div>
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">URL de Redirección Autorizada</Label>
              <div className="flex items-center gap-2">
                <Input readOnly value={REDIRECT_URI || 'Configura NEXT_PUBLIC_BASE_URL'} className="text-xs h-8 bg-background" />
                <Button variant="outline" size="icon-sm" onClick={() => handleCopy(REDIRECT_URI)} disabled={!REDIRECT_URI}><Copy className="h-3 w-3" /></Button>
              </div>
            </div>
          </AlertDescription>
        </Alert>

        <div className="grid grid-cols-1 gap-4">
          <div>
            <Label htmlFor="partnerOrgId">ID de tu Organización de Partner</Label>
            <Input id="partnerOrgId" name="partnerOrgId" value={partnerFormData?.partnerOrgId || ''} onChange={handleInputChange} placeholder="Ej: 1234567" disabled={isSavingPartner} />
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <Label htmlFor="clientId">Client ID</Label>
              <Input id="clientId" name="clientId" value={partnerFormData?.clientId || ''} onChange={handleInputChange} placeholder="Tu Client ID de la app de Partner" disabled={isSavingPartner} />
            </div>
            <div>
              <Label htmlFor="clientSecret">Client Secret</Label>
              <Input id="clientSecret" name="clientSecret" type="password" value={partnerFormData?.clientSecret || ''} onChange={handleInputChange} placeholder="••••••••••••••••••••••••••••••••••••" disabled={isSavingPartner} />
            </div>
          </div>
        </div>
        <div className="flex flex-col sm:flex-row items-center justify-between gap-4 pt-4 border-t">
          <div className="flex items-center gap-2 flex-wrap">
            <Button onClick={onSave} disabled={isSavingPartner}>
              {isSavingPartner ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="h-4 w-4 mr-2"/>}
              Guardar Credenciales
            </Button>
             <Button onClick={handleConnect} disabled={!partnerFormData.clientId || !partnerFormData.partnerOrgId}>
              <LinkIcon className="h-4 w-4 mr-2" />
              Conectar con Shopify
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
