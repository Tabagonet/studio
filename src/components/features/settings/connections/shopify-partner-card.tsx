
"use client";

import React from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { AlertCircle, Loader2, Save, Trash2, CheckCircle, Link as LinkIcon, Eye, EyeOff } from "lucide-react";
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
  configStatus: any;
}

export function ShopifyPartnerCard({
  editingTarget,
  partnerFormData,
  onPartnerFormDataChange,
  onSave,
  isSavingPartner,
  onDelete,
  isDeleting,
  configStatus,
}: ShopifyPartnerCardProps) {
  
  const [isTokenVisible, setIsTokenVisible] = React.useState(false);
  const [isSecretVisible, setIsSecretVisible] = React.useState(false);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    onPartnerFormDataChange({ ...partnerFormData, [name]: value });
  };
  
  const handleConnectClick = () => {
    const { clientId } = partnerFormData;
    const { id: entityId, type: entityType } = editingTarget;
    
    if (!clientId) {
        alert("Por favor, guarda primero tu Client ID.");
        return;
    }

    const state = `${entityType}:${entityId}`;
    const redirectUri = `${process.env.NEXT_PUBLIC_BASE_URL}/api/shopify/auth/callback`;
    const scopes = 'write_development_stores,read_development_stores';
    
    const authUrl = `https://partners.shopify.com/oauth/authorize?client_id=${clientId}&scope=${scopes}&redirect_uri=${redirectUri}&state=${state}`;
    window.location.href = authUrl;
  };
  
  const isConnected = !!configStatus?.shopifyPartnerConfigured;

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
             <div className="flex items-center gap-2">
                 {isConnected ? (
                     <span className="flex items-center gap-2 text-sm text-green-600 font-medium"><CheckCircle className="h-4 w-4"/> Conectado</span>
                 ) : (
                      <span className="flex items-center gap-2 text-sm text-amber-600 font-medium"><AlertCircle className="h-4 w-4"/> No Conectado</span>
                 )}
            </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-6">
        <Alert>
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>¿Cómo obtener las credenciales?</AlertTitle>
          <AlertDescription>
            Sigue nuestra <Link href="/docs/SHOPIFY_PARTNER_APP_SETUP.md" target="_blank" className="font-semibold underline">guía paso a paso</Link> para crear una App en tu panel de Shopify Partner y obtener las credenciales.
          </AlertDescription>
        </Alert>
        
        <div className="grid md:grid-cols-2 gap-4">
           <div>
            <Label htmlFor="clientId">Client ID</Label>
             <Input 
                id="clientId" 
                name="clientId" 
                value={partnerFormData?.clientId || ''} 
                onChange={handleInputChange} 
                placeholder="Ej: 547a82a4abfb630a..." 
                disabled={isSavingPartner}
             />
          </div>
           <div>
            <Label htmlFor="clientSecret">Client Secret</Label>
            <div className="flex items-center gap-2">
                 <Input 
                    id="clientSecret" 
                    name="clientSecret" 
                    type={isSecretVisible ? 'text' : 'password'} 
                    value={partnerFormData?.clientSecret || ''} 
                    onChange={handleInputChange} 
                    placeholder="shpss_..." 
                    disabled={isSavingPartner}
                    className="font-mono"
                 />
                 <Button variant="outline" size="icon" onClick={() => setIsSecretVisible(!isSecretVisible)}>
                    {isSecretVisible ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                 </Button>
            </div>
          </div>
           <div className="md:col-span-2">
             <Label htmlFor="partnerShopDomain">Tu Dominio de Partner (.myshopify.com)</Label>
                 <Input 
                    id="partnerShopDomain" 
                    name="partnerShopDomain" 
                    value={partnerFormData?.partnerShopDomain || ''} 
                    onChange={handleInputChange} 
                    placeholder="ejemplo-partner.myshopify.com" 
                    disabled={isSavingPartner}
                 />
                 <p className="text-xs text-muted-foreground mt-1">
                    Es el dominio de tu tienda principal dentro del panel de Partner, NO una tienda de desarrollo.
                 </p>
          </div>
        </div>
        
         <div className="space-y-2 pt-4 border-t">
          <h4 className="font-medium text-sm">Token de Acceso</h4>
           {partnerFormData?.partnerApiToken ? (
            <div className="flex items-center gap-2">
              <Input 
                readOnly
                type={isTokenVisible ? 'text' : 'password'} 
                value={partnerFormData.partnerApiToken} 
                className="font-mono bg-muted"
              />
              <Button variant="outline" size="icon" onClick={() => setIsTokenVisible(!isTokenVisible)}>
                {isTokenVisible ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </Button>
            </div>
           ) : (
            <p className="text-sm text-muted-foreground italic">Guarda las credenciales y haz clic en "Conectar con Shopify" para obtener el token.</p>
           )}
        </div>


        <div className="flex flex-col sm:flex-row items-center justify-between gap-4 pt-4 border-t">
          <div className="flex items-center gap-2 flex-wrap">
            <Button onClick={onSave} disabled={isSavingPartner}>
              {isSavingPartner ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="h-4 w-4 mr-2"/>}
              Guardar Credenciales
            </Button>
            <Button onClick={handleConnectClick} disabled={isSavingPartner || !partnerFormData.clientId || !partnerFormData.partnerShopDomain}>
              <LinkIcon className="h-4 w-4 mr-2"/>
              {isConnected ? 'Reconectar con Shopify' : 'Conectar con Shopify'}
            </Button>
          </div>
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
      </CardContent>
    </Card>
  );
}
