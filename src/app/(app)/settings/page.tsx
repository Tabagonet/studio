
"use client";

import React, { useState, useEffect } from 'react';
import Image from 'next/image';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { KeyRound, DatabaseZap, Download, Upload, Info, Globe, BrainCircuit, Loader2 } from "lucide-react";
import { auth } from '@/lib/firebase';
import { useToast } from '@/hooks/use-toast';


type ServerConfigStatus = {
  googleAiApiKey: boolean;
  wooCommerceStoreUrl: boolean;
  wooCommerceApiKey: boolean;
  wooCommerceApiSecret: boolean;
  firebaseAdminSdk: boolean;
};

const StatusBadge = ({ status, loading, configuredText = "Configurada", missingText = "Falta" }: { status?: boolean, loading: boolean, configuredText?: string, missingText?: string }) => {
  if (loading) {
    return (
      <span className="flex items-center px-2 py-1 text-xs rounded-full bg-gray-100 text-gray-700">
        <Loader2 className="h-3 w-3 mr-1 animate-spin" /> Verificando...
      </span>
    );
  }
  
  if (status === undefined) { 
      return (
           <span className="px-2 py-1 text-xs rounded-full bg-yellow-100 text-yellow-700">
            Error al verificar
          </span>
      )
  }

  return (
    <span className={`px-2 py-1 text-xs rounded-full ${status ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
      {status ? configuredText : missingText}
    </span>
  );
};


export default function SettingsPage() {
  const [serverConfig, setServerConfig] = useState<ServerConfigStatus | null>(null);
  const [isLoadingConfig, setIsLoadingConfig] = useState(true);
  const { toast } = useToast();

  useEffect(() => {
    const fetchConfigStatus = async () => {
      // Wait for auth to be initialized
      const unsubscribe = auth.onAuthStateChanged(async (user) => {
        unsubscribe(); // Unsubscribe after the first auth state check to prevent multiple calls
        if (user) {
          try {
            const token = await user.getIdToken();
            const response = await fetch('/api/check-config', {
              headers: { 'Authorization': `Bearer ${token}` }
            });

            if (!response.ok) {
              let errorMsg = `Error del servidor: ${response.status}`;
              try {
                  const errorData = await response.json();
                  errorMsg = errorData.error || errorMsg;
              } catch (e) {
                  // Ignore if response is not json
              }
              throw new Error(errorMsg);
            }
            
            const data: ServerConfigStatus = await response.json();
            setServerConfig(data);
          } catch (error: any) {
            toast({
              title: "Error al verificar configuración del servidor",
              description: error.message,
              variant: "destructive"
            });
            setServerConfig(null); 
          } finally {
            setIsLoadingConfig(false);
          }
        } else {
            // No user logged in, can't check server config
            setIsLoadingConfig(false);
        }
      });
    };

    fetchConfigStatus();
  }, [toast]);

  // Client-side accessible Firebase config check
  const isFirebaseClientConfigured = !!process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID &&
                                     !!process.env.NEXT_PUBLIC_FIREBASE_API_KEY &&
                                     !!process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET;

  const firebaseAdminHint = "Se configura en .env (FIREBASE_SERVICE_ACCOUNT_JSON). Ver Firebase Console > Configuración del proyecto > Cuentas de servicio > Generar nueva clave privada. Pegar el contenido COMPLETO del archivo JSON como una ÚNICA LÍNEA.";
  const wooCommerceStoreUrlHint = "Configurada en .env (WOOCOMMERCE_STORE_URL)";
  const wooCommerceApiKeysHint = "Configuradas en .env (WOOCOMMERCE_API_KEY y WOOCOMMERCE_API_SECRET)";
  const googleAiApiKeyHint = "Configurada en .env (GOOGLE_API_KEY). Obtén una clave gratis desde Google AI Studio.";


  return (
    <div className="container mx-auto py-8 space-y-8">
      <div>
        <h1 className="text-3xl font-bold tracking-tight text-foreground font-headline">Configuración</h1>
        <p className="text-muted-foreground">Administra las configuraciones generales y datos de la aplicación. Las claves sensibles se gestionan mediante variables de entorno.</p>
      </div>

      <Card className="shadow-lg">
        <CardHeader>
          <div className="flex items-center space-x-2">
            <KeyRound className="h-6 w-6 text-primary" />
            <CardTitle>Estado de Configuración de API y Servicios</CardTitle>
          </div>
          <CardDescription>
            Estado de las claves API y servicios. Las configuraciones del servidor se verifican en tiempo real.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* CLIENT-SIDE CHECK */}
          <div className="flex items-center justify-between p-3 border rounded-md">
            <Label htmlFor="firebaseClientStatus" className="flex items-center">
              <Image src="https://www.gstatic.com/mobilesdk/160503_mobilesdk/logo/2x/firebase_28.png" alt="Firebase" width={16} height={16} className="mr-2" />
              Configuración Firebase (Cliente)
            </Label>
             <span id="firebaseClientStatus" className={`px-2 py-1 text-xs rounded-full ${isFirebaseClientConfigured ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
              {isFirebaseClientConfigured ? "Detectada" : "Falta"}
            </span>
          </div>

          {/* SERVER-SIDE CHECKS */}
          <div title={firebaseAdminHint} className="flex items-center justify-between p-3 border rounded-md bg-muted/30 cursor-help">
            <Label htmlFor="firebaseAdminStatus" className="flex items-center cursor-help">
              <Image src="https://www.gstatic.com/mobilesdk/160503_mobilesdk/logo/2x/firebase_28.png" alt="Firebase" width={16} height={16} className="mr-2" />
              Configuración Firebase (Admin SDK)
            </Label>
            <StatusBadge status={serverConfig?.firebaseAdminSdk} loading={isLoadingConfig} />
          </div>
          
          <div title={wooCommerceStoreUrlHint} className="flex items-center justify-between p-3 border rounded-md bg-muted/30 cursor-help">
            <Label htmlFor="wooCommerceStoreUrlStatus" className="flex items-center cursor-help"><Globe className="h-4 w-4 mr-2 text-purple-600" />URL Tienda WooCommerce</Label>
             <StatusBadge status={serverConfig?.wooCommerceStoreUrl} loading={isLoadingConfig} />
          </div>
          
          <div title={wooCommerceApiKeysHint} className="flex items-center justify-between p-3 border rounded-md bg-muted/30 cursor-help">
            <Label htmlFor="wooCommerceApiStatus" className="flex items-center cursor-help"><KeyRound className="h-4 w-4 mr-2 text-purple-600" />Claves API WooCommerce</Label>
            <StatusBadge status={serverConfig ? serverConfig.wooCommerceApiKey && serverConfig.wooCommerceApiSecret : undefined} loading={isLoadingConfig} missingText="Faltan Claves" />
          </div>
          
          <div title={googleAiApiKeyHint} className="flex items-center justify-between p-3 border rounded-md bg-muted/30 cursor-help">
            <Label htmlFor="googleAiStatus" className="flex items-center cursor-help">
              <BrainCircuit className="h-4 w-4 mr-2 text-blue-500" />
              Clave API de Google AI
            </Label>
             <StatusBadge status={serverConfig?.googleAiApiKey} loading={isLoadingConfig} />
          </div>
          
           <div className="mt-2 p-3 bg-accent/50 rounded-md flex items-start space-x-2">
            <Info className="h-5 w-5 text-primary flex-shrink-0 mt-0.5" />
            <div>
              <p className="text-sm text-muted-foreground">
                Para configurar estas claves y URLs, edita el archivo <code className="font-code bg-muted px-1 py-0.5 rounded-sm">.env</code> en la raíz de tu proyecto y reinicia la aplicación si se ejecuta localmente.
                Si está desplegada en Vercel, configura estas variables en los ajustes de entorno de tu proyecto en Vercel.
              </p>
              <p className="text-xs text-muted-foreground mt-1">
                - <code className="font-code text-xs">NEXT_PUBLIC_...</code>: Variables accesibles en el navegador (cliente).
                <br />
                - <code className="font-code text-xs">FIREBASE_SERVICE_ACCOUNT_JSON</code>: Contenido del JSON de la cuenta de servicio de Firebase (solo para el servidor). Pega el contenido del archivo JSON como una **sola línea**.
                <br />
                - <code className="font-code text-xs">WOOCOMMERCE_...</code>: Variables para la API de WooCommerce (solo para el servidor).
                <br />
                - <code className="font-code text-xs">GOOGLE_API_KEY</code>: Clave para la API de Google AI (Gemini). Se configura en el servidor y la puedes obtener gratis en Google AI Studio.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card className="shadow-lg">
        <CardHeader>
          <div className="flex items-center space-x-2">
            <DatabaseZap className="h-6 w-6 text-primary" />
            <CardTitle>Gestión de Datos y Plantillas</CardTitle>
          </div>
          <CardDescription>Exporta o importa configuraciones (plantillas, reglas) y limpia datos temporales.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
            <div className="flex flex-wrap gap-4">
                <Button variant="outline" disabled><Download className="mr-2 h-4 w-4" /> Exportar Configuración</Button>
                <Button variant="outline" disabled><Upload className="mr-2 h-4 w-4" /> Importar Configuración</Button>
            </div>
            <div>
                <h4 className="font-medium mb-2">Limpieza de Datos</h4>
                <p className="text-sm text-muted-foreground mb-3">Elimina datos temporales almacenados en Firebase (imágenes no procesadas, colas de procesamiento, etc.). Esta acción es irreversible.</p>
                <Button variant="destructive" disabled>Limpiar Datos Temporales</Button>
                 <p className="text-xs text-muted-foreground mt-1">Esta funcionalidad estará disponible próximamente.</p>
            </div>
        </CardContent>
      </Card>
    </div>
  );
}
