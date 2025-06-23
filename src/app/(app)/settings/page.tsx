
"use client";

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { KeyRound, DatabaseZap, Download, Upload, Info, BrainCircuit, Loader2, ExternalLink } from "lucide-react";
import { auth } from '@/lib/firebase';
import { useToast } from '@/hooks/use-toast';


type ServerConfigStatus = {
  googleAiApiKey: boolean;
  wooCommerceConfigured: boolean;
  wordPressConfigured: boolean;
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
      const unsubscribe = auth.onAuthStateChanged(async (user) => {
        unsubscribe(); 
        if (user) {
          try {
            const token = await user.getIdToken();
            const response = await fetch('/api/check-config', {
              headers: { 'Authorization': `Bearer ${token}` }
            });

            if (!response.ok) {
              const errorData = await response.json().catch(() => ({}));
              throw new Error(errorData.error || `Error del servidor: ${response.status}`);
            }
            
            const data: ServerConfigStatus = await response.json();
            setServerConfig(data);
          } catch (error: any) {
            toast({
              title: "Error al verificar configuración",
              description: error.message,
              variant: "destructive"
            });
            setServerConfig(null); 
          } finally {
            setIsLoadingConfig(false);
          }
        } else {
            setIsLoadingConfig(false);
        }
      });
    };

    fetchConfigStatus();
  }, [toast]);

  const isFirebaseClientConfigured = !!process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID &&
                                     !!process.env.NEXT_PUBLIC_FIREBASE_API_KEY;

  const firebaseAdminHint = "Esta clave (FIREBASE_SERVICE_ACCOUNT_JSON) es para toda la aplicación y se configura en el archivo .env del servidor.";
  const googleAiApiKeyHint = "Esta clave (GOOGLE_API_KEY) es para toda la aplicación y se configura en el archivo .env del servidor. Obtén una clave gratis desde Google AI Studio.";

  return (
    <div className="container mx-auto py-8 space-y-8">
      <div>
        <h1 className="text-3xl font-bold tracking-tight text-foreground font-headline">Configuración</h1>
        <p className="text-muted-foreground">Administra las configuraciones generales, conexiones de API y datos de la aplicación.</p>
      </div>

       <Card className="shadow-lg">
        <CardHeader>
            <div className="flex items-center space-x-2">
                <KeyRound className="h-6 w-6 text-primary" />
                <CardTitle>Conexiones API</CardTitle>
            </div>
            <CardDescription>
                Gestiona aquí las credenciales para conectar tu cuenta con servicios externos como WooCommerce y WordPress.
                Estas claves son específicas para tu usuario.
            </CardDescription>
        </CardHeader>
        <CardContent>
            <p className="text-sm text-muted-foreground mb-4">
                Haz clic en el botón para configurar o actualizar tus claves de API de WooCommerce y las contraseñas de aplicación de WordPress.
            </p>
            <Button asChild>
                <Link href="/settings/connections">
                    Gestionar Conexiones
                    <ExternalLink className="ml-2 h-4 w-4" />
                </Link>
            </Button>
        </CardContent>
      </Card>


      <Card className="shadow-lg">
        <CardHeader>
          <div className="flex items-center space-x-2">
            <Info className="h-6 w-6 text-primary" />
            <CardTitle>Estado de Configuración</CardTitle>
          </div>
          <CardDescription>
            Estado de las configuraciones. Las globales se gestionan en el servidor, las de usuario en la sección de Conexiones.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
           {/* GLOBAL SETTINGS */}
           <div title={firebaseAdminHint} className="flex items-center justify-between p-3 border rounded-md bg-muted/30 cursor-help">
            <Label className="flex items-center cursor-help">
              <img src="https://www.gstatic.com/mobilesdk/160503_mobilesdk/logo/2x/firebase_28.png" alt="Firebase" width={16} height={16} className="mr-2" />
              Firebase Admin SDK (Global)
            </Label>
            <StatusBadge status={serverConfig?.firebaseAdminSdk} loading={isLoadingConfig} />
          </div>
          <div title={googleAiApiKeyHint} className="flex items-center justify-between p-3 border rounded-md bg-muted/30 cursor-help">
            <Label className="flex items-center cursor-help">
              <BrainCircuit className="h-4 w-4 mr-2 text-blue-500" />
              Clave API de Google AI (Global)
            </Label>
             <StatusBadge status={serverConfig?.googleAiApiKey} loading={isLoadingConfig} />
          </div>
          
          {/* PER-USER SETTINGS */}
          <div className="flex items-center justify-between p-3 border rounded-md">
            <Label className="flex items-center">
                <img src="https://quefoto.es/wp-content/uploads/2024/07/woocommerce-logo.png" alt="WooCommerce" width={16} height={16} className="mr-2" data-ai-hint="logo woocommerce"/>
                Conexión WooCommerce (Tu Usuario)
            </Label>
            <StatusBadge status={serverConfig?.wooCommerceConfigured} loading={isLoadingConfig} />
          </div>
          <div className="flex items-center justify-between p-3 border rounded-md">
            <Label className="flex items-center">
                <img src="https://s.w.org/style/images/about/WordPress-logotype-wmark.png" alt="WordPress Logo" width={16} height={16} className="mr-2" data-ai-hint="logo wordpress"/>
                Conexión WordPress (Tu Usuario)
            </Label>
            <StatusBadge status={serverConfig?.wordPressConfigured} loading={isLoadingConfig} />
          </div>
          
           <div className="mt-2 p-3 bg-accent/50 rounded-md flex items-start space-x-2">
            <Info className="h-5 w-5 text-primary flex-shrink-0 mt-0.5" />
            <div>
              <p className="text-sm text-muted-foreground">
                Las configuraciones marcadas como <span className="font-semibold">"(Global)"</span> se establecen en el archivo <code className="font-code bg-muted px-1 py-0.5 rounded-sm">.env</code> del servidor y afectan a toda la aplicación.
              </p>
               <p className="text-sm text-muted-foreground mt-2">
                 Las configuraciones marcadas como <span className="font-semibold">"(Tu Usuario)"</span> son personales y se gestionan en la página de <Link href="/settings/connections" className="underline font-medium">Conexiones API</Link>.
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
          <CardDescription>Exporta o importa configuraciones y limpia datos temporales.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
            <div className="flex flex-wrap gap-4">
                <Button variant="outline" disabled><Download className="mr-2 h-4 w-4" /> Exportar Configuración</Button>
                <Button variant="outline" disabled><Upload className="mr-2 h-4 w-4" /> Importar Configuración</Button>
            </div>
            <div>
                <h4 className="font-medium mb-2">Limpieza de Datos</h4>
                <p className="text-sm text-muted-foreground mb-3">Elimina datos temporales. Esta acción es irreversible.</p>
                <Button variant="destructive" disabled>Limpiar Datos Temporales</Button>
                 <p className="text-xs text-muted-foreground mt-1">Esta funcionalidad estará disponible próximamente.</p>
            </div>
        </CardContent>
      </Card>
    </div>
  );
}
