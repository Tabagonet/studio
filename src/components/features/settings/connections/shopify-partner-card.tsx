
"use client";

import React from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Loader2, Save, Trash2, Eye, EyeOff, ShieldCheck, CheckCircle, AlertCircle, RefreshCw, KeyRound } from "lucide-react";
import type { PartnerAppConnectionData } from '@/lib/api-helpers';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog';
import { Alert, AlertTitle, AlertDescription } from '@/components/ui/alert';
import Link from 'next/link';
import { ShopifyIcon } from '@/components/core/icons';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';


interface ShopifyPartnerCardProps {
  editingTarget: { type: 'user' | 'company'; id: string | null; name: string };
  partnerFormData: PartnerAppConnectionData;
  onPartnerFormDataChange: (data: PartnerAppConnectionData) => void;
  onSave: () => void;
  isSavingPartner: boolean;
  onDelete: () => void;
  isDeleting: boolean;
  configStatus: any;
  onRefreshStatus: () => void;
  isCheckingStatus: boolean;
}

const ConnectionStatusBadge = ({ status, isLoading, text, helpText }: { status?: boolean, isLoading: boolean, text: string, helpText: string }) => {
    return (
        <TooltipProvider><Tooltip delayDuration={100}>
            <TooltipTrigger>
                <div className="flex items-center gap-2 text-sm p-2 border rounded-md w-full justify-center">
                    {isLoading ? (
                        <>
                            <Loader2 className="h-4 w-4 animate-spin" />
                            <span>Verificando...</span>
                        </>
                    ) : status ? (
                        <>
                            <CheckCircle className="h-4 w-4 text-green-500" />
                            <span className="text-green-600 font-semibold">{text} Configurada</span>
                        </>
                    ) : (
                        <>
                            <AlertCircle className="h-4 w-4 text-destructive" />
                            <span className="text-destructive font-semibold">{text} No Configurada</span>
                        </>
                    )}
                </div>
            </TooltipTrigger>
            <TooltipContent><p>{helpText}</p></TooltipContent>
        </Tooltip></TooltipProvider>
    );
};


export function ShopifyPartnerCard({
  editingTarget,
  partnerFormData,
  onPartnerFormDataChange,
  onSave,
  onDelete,
  isSavingPartner,
  isDeleting,
  configStatus,
  onRefreshStatus,
  isCheckingStatus,
}: ShopifyPartnerCardProps) {
  
  const [isApiKeyVisible, setIsApiKeyVisible] = React.useState(false);
  const [isClientSecretVisible, setIsClientSecretVisible] = React.useState(false);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    onPartnerFormDataChange({ ...partnerFormData, [name]: value });
  };
  
  return (
    <Card className="mt-8 border-primary/50">
      <CardHeader>
        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
            <div>
                <CardTitle>Conexión Global de Shopify</CardTitle>
                <CardDescription>
                  Credenciales para el flujo de autorización (OAuth) y para proteger los webhooks.
                  Estas credenciales son globales para todos los usuarios.
                </CardDescription>
            </div>
             <div className="flex items-center gap-2">
                 <TooltipProvider><Tooltip><TooltipTrigger asChild>
                    <Button variant="ghost" size="icon-sm" onClick={onRefreshStatus} disabled={isCheckingStatus}>
                      <RefreshCw className={cn("h-4 w-4 text-muted-foreground", isCheckingStatus && "animate-spin")} />
                    </Button>
                 </TooltipTrigger><TooltipContent><p>Refrescar Estados de Conexión</p></TooltipContent></Tooltip></TooltipProvider>
             </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="grid grid-cols-1">
            <ConnectionStatusBadge
                status={configStatus?.shopifyCustomAppConfigured}
                isLoading={isCheckingStatus}
                text="App Personalizada (OAuth)"
                helpText="Verifica si el Client ID y Secret para la autorización están guardados."
            />
        </div>

        <Alert>
          <AlertTitle>¿Cómo obtener las credenciales?</AlertTitle>
          <AlertDescription>
            Sigue nuestra <Link href="/docs/shopify-partner-setup" target="_blank" className="font-semibold underline">guía paso a paso</Link> para crear un cliente de API en tu panel de Shopify Partner y obtener las credenciales.
          </AlertDescription>
        </Alert>

        <div className="pt-4 border-t">
            <h3 className="text-lg font-semibold text-foreground flex items-center gap-2">
                <ShieldCheck className="h-5 w-5 text-blue-500" />
                1. Credenciales de la App Personalizada (OAuth)
            </h3>
            <p className="text-sm text-muted-foreground mb-4">
              Necesarias para que, una vez creada la tienda, el cliente pueda autorizar que nuestra app la configure.
            </p>
             <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="clientId">Client ID</Label>
                   <Input 
                      id="clientId" 
                      name="clientId" 
                      type="text"
                      value={partnerFormData?.clientId || ''} 
                      onChange={handleInputChange} 
                      placeholder="Ej: ab12c34d..." 
                      disabled={isSavingPartner}
                   />
                </div>
                <div>
                   <Label htmlFor="clientSecret">Client Secret</Label>
                    <div className="flex items-center gap-2">
                       <Input 
                          id="clientSecret" 
                          name="clientSecret" 
                          type={isClientSecretVisible ? 'text' : 'password'}
                          value={partnerFormData?.clientSecret || ''} 
                          onChange={handleInputChange} 
                          placeholder="shpss_..." 
                          disabled={isSavingPartner}
                          className="font-mono"
                       />
                        <Button variant="outline" size="icon" onClick={() => setIsClientSecretVisible(!isClientSecretVisible)}>
                          {isClientSecretVisible ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                        </Button>
                    </div>
                </div>
            </div>
            <p className="text-xs text-muted-foreground mt-2">
                Recuerda que la "URL de redirección permitida" en tu App de Shopify debe ser: 
                <code className="ml-1 bg-muted text-foreground p-1 rounded-md text-[11px]">
                  {process.env.NEXT_PUBLIC_BASE_URL}/api/shopify/auth/callback
                </code>
            </p>
        </div>

         <div className="pt-4 border-t">
            <h3 className="text-lg font-semibold text-foreground flex items-center gap-2">
                <KeyRound className="h-5 w-5 text-amber-500" />
                2. Clave API de Sistema (Webhook)
            </h3>
            <p className="text-sm text-muted-foreground mb-4">
                Una clave secreta que inventes para proteger el endpoint público de creación de tiendas.
            </p>
            <div className="flex items-center gap-2">
                <Input 
                    id="automationApiKey" 
                    name="automationApiKey" 
                    type={isApiKeyVisible ? 'text' : 'password'} 
                    value={partnerFormData?.automationApiKey || ''} 
                    onChange={handleInputChange} 
                    placeholder="Introduce una clave larga y segura..." 
                    disabled={isSavingPartner}
                    className="font-mono"
                />
                <Button variant="outline" size="icon" onClick={() => setIsApiKeyVisible(!isApiKeyVisible)}>
                    {isApiKeyVisible ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </Button>
            </div>
        </div>
        
        <div className="flex flex-col sm:flex-row items-center justify-between gap-4 pt-4 border-t">
            <Button onClick={onSave} disabled={isSavingPartner || isDeleting}>
              {isSavingPartner ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="h-4 w-4 mr-2"/>}
              Guardar Credenciales Globales
            </Button>
          <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button variant="destructive" disabled={isSavingPartner || isDeleting}>
                  <Trash2 className="mr-2 h-4 w-4" /> Borrar Todo
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>¿Confirmar eliminación?</AlertDialogTitle>
                  <AlertDialogDescription>
                    Esta acción eliminará permanentemente las credenciales de la App Personalizada y la Clave de Sistema. Deberás volver a configurarlas.
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
