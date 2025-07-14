
"use client";

import React, { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { KeyRound, DatabaseZap, Download, Upload, Info, BrainCircuit, Loader2, ExternalLink, Server, Store, Globe, Trash2, Eye, EyeOff, ShieldCheck, Save, Cookie } from "lucide-react";
import { auth, onAuthStateChanged } from '@/lib/firebase';
import { useToast } from '@/hooks/use-toast';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import { RichTextEditor } from '@/components/features/editor/rich-text-editor';
import { ShopifyIcon } from '@/components/core/icons';


type ServerConfigStatus = {
  googleAiApiKey: boolean;
  wooCommerceConfigured: boolean;
  wordPressConfigured: boolean;
  shopifyConfigured: boolean;
  shopifyPartnerConfigured?: boolean;
  firebaseAdminSdk: boolean;
  recaptchaConfigured: boolean;
  apiKey: string | null;
  assignedPlatform: 'woocommerce' | 'shopify' | null;
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
  const [userRole, setUserRole] = useState<string | null>(null);
  const [isLoadingConfig, setIsLoadingConfig] = useState(true);
  const [isExporting, setIsExporting] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [isCleaning, setIsCleaning] = useState(false);
  const [isCleaningOrphans, setIsCleaningOrphans] = useState(false);
  const [isApiKeyVisible, setIsApiKeyVisible] = useState(false);
  
  const [legalTexts, setLegalTexts] = useState({ privacyPolicy: '', termsOfService: '', cookiePolicy: '' });
  const [isLoadingLegal, setIsLoadingLegal] = useState(true);
  const [isSavingLegal, setIsSavingLegal] = useState(false);
  
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const fetchConfigAndUserData = async () => {
      const unsubscribe = auth.onAuthStateChanged(async (user) => {
        unsubscribe(); 
        if (user) {
          setIsLoadingConfig(true);
          setIsLoadingLegal(true);
          try {
            const token = await user.getIdToken();
            
            const configResponsePromise = fetch('/api/check-config', { headers: { 'Authorization': `Bearer ${token}` } });
            const roleResponsePromise = fetch('/api/user/verify', { headers: { 'Authorization': `Bearer ${token}` } });

            const [configResponse, roleResponse] = await Promise.all([configResponsePromise, roleResponsePromise]);

            if (!configResponse.ok) throw new Error(`Error del servidor (config): ${configResponse.status}`);
            if (!roleResponse.ok) throw new Error(`Error del servidor (verify): ${roleResponse.status}`);
            
            const configData: any = await configResponse.json();
            const userData: any = await roleResponse.json();
            
            setUserRole(userData.role);
            setServerConfig({ ...configData, apiKey: userData.apiKey });
            setIsLoadingConfig(false);

            if (userData.role === 'super_admin') {
                const legalResponse = await fetch('/api/settings/legal', { headers: { 'Authorization': `Bearer ${token}` } });
                if (legalResponse.ok) {
                    setLegalTexts(await legalResponse.json());
                }
                 setIsLoadingLegal(false);
            } else {
                 setIsLoadingLegal(false);
            }

          } catch (error: any) {
            toast({ title: "Error al verificar configuración", description: error.message, variant: "destructive" });
            setServerConfig(null); 
            setUserRole(null);
            setIsLoadingConfig(false);
            setIsLoadingLegal(false);
          }
        } else {
            setIsLoadingConfig(false);
            setIsLoadingLegal(false);
        }
      });
    };

    fetchConfigAndUserData();
  }, [toast]);
  
  const handleExportSettings = async () => {
    setIsExporting(true);
    const user = auth.currentUser;
    if (!user) {
        toast({ title: 'Error de autenticación', variant: 'destructive' });
        setIsExporting(false);
        return;
    }

    try {
        const token = await user.getIdToken();
        const response = await fetch('/api/user-settings/export', {
            headers: { 'Authorization': `Bearer ${token}` }
        });

        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.error || 'No se pudo exportar la configuración.');
        }

        const blob = await response.blob();
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        const formattedDate = new Date().toISOString().split('T')[0];
        a.download = `autopress_ai_settings_${formattedDate}.json`;
        document.body.appendChild(a);
        a.click();
        a.remove();
        window.URL.revokeObjectURL(url);

        toast({ title: 'Exportación Exitosa', description: 'Tu archivo de configuración de seguridad se ha descargado.' });
    } catch (error: any) {
        toast({ title: 'Error al Exportar', description: error.message, variant: 'destructive' });
    } finally {
        setIsExporting(false);
    }
  };

  const handleImportClick = () => {
    fileInputRef.current?.click();
  };

  const handleFileSelected = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    if (file.type !== 'application/json') {
      toast({ title: 'Archivo inválido', description: 'Por favor, selecciona un archivo .json válido.', variant: 'destructive' });
      return;
    }

    setIsImporting(true);
    const user = auth.currentUser;
    if (!user) {
      toast({ title: 'Error de autenticación', variant: 'destructive' });
      setIsImporting(false);
      return;
    }

    try {
      const fileContent = await file.text();
      const jsonData = JSON.parse(fileContent);

      const token = await user.getIdToken();
      const response = await fetch('/api/user-settings/import', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify(jsonData)
      });

      const result = await response.json();
      if (!response.ok) {
        throw new Error(result.error || result.message || 'Error al importar la configuración.');
      }

      toast({ title: 'Importación Exitosa', description: 'Tu configuración ha sido importada. La página se recargará.' });

      window.dispatchEvent(new Event('connections-updated'));
      setTimeout(() => window.location.reload(), 1500);

    } catch (error: any) {
      toast({
        title: 'Error al Importar',
        description: error.message.includes('JSON') ? 'El archivo JSON está mal formado.' : error.message,
        variant: 'destructive'
      });
    } finally {
      setIsImporting(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  const handleCleanup = async () => {
    setIsCleaning(true);
    const user = auth.currentUser;
    if (!user) {
        toast({ title: 'Error de autenticación', variant: 'destructive' });
        setIsCleaning(false);
        return;
    }

    try {
        const token = await user.getIdToken();
        const response = await fetch('/api/user-settings/cleanup', {
            method: 'DELETE',
            headers: { 'Authorization': `Bearer ${token}` },
        });

        const result = await response.json();
        if (!response.ok) {
            throw new Error(result.error || 'No se pudieron limpiar los datos.');
        }
        
        toast({ title: 'Limpieza Completada', description: 'Tu historial de actividad y notificaciones ha sido eliminado.' });

    } catch (error: any) {
        toast({ title: 'Error en la Limpieza', description: error.message, variant: 'destructive' });
    } finally {
        setIsCleaning(false);
    }
  };
  
  const handleOrphanCleanup = async () => {
    setIsCleaningOrphans(true);
    const user = auth.currentUser;
    if (!user) {
        toast({ title: 'Error de autenticación', variant: 'destructive' });
        setIsCleaningOrphans(false);
        return;
    }

    try {
        const token = await user.getIdToken();
        const response = await fetch('/api/admin/cleanup-orphan-logs', {
            method: 'DELETE',
            headers: { 'Authorization': `Bearer ${token}` },
        });

        const result = await response.json();
        if (!response.ok) {
            throw new Error(result.error || 'No se pudieron limpiar los registros huérfanos.');
        }
        
        toast({ title: 'Limpieza Completada', description: result.message });

    } catch (error: any) {
        toast({ title: 'Error en la Limpieza', description: error.message, variant: 'destructive' });
    } finally {
        setIsCleaningOrphans(false);
    }
  };

  const handleSaveLegal = async () => {
    setIsSavingLegal(true);
    const user = auth.currentUser;
    if (!user) {
        toast({ title: 'Error de autenticación', variant: 'destructive' });
        setIsSavingLegal(false);
        return;
    }
    
    try {
        const token = await user.getIdToken();
        const response = await fetch('/api/settings/legal', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
            body: JSON.stringify(legalTexts),
        });
        if (!response.ok) throw new Error((await response.json()).error || 'Fallo al guardar los textos.');
        toast({ title: 'Textos Legales Guardados', description: 'El contenido de las políticas ha sido actualizado.' });
    } catch(e: any) {
         toast({ title: 'Error al Guardar', description: e.message, variant: 'destructive' });
    } finally {
        setIsSavingLegal(false);
    }
  };
  
  const handleLegalContentChange = (field: 'privacyPolicy' | 'termsOfService' | 'cookiePolicy', content: string) => {
    setLegalTexts(prev => ({ ...prev, [field]: content }));
  };

  const handleDummyInsertImage = () => {
    toast({
      title: 'Función no disponible',
      description: 'No se pueden insertar imágenes en los textos legales.',
      variant: 'destructive',
    });
  };


  const firebaseAdminHint = "Esta clave (FIREBASE_SERVICE_ACCOUNT_JSON) es para toda la aplicación y se configura en el archivo .env del servidor.";
  const googleAiApiKeyHint = "Esta clave (GOOGLE_API_KEY) es para toda la aplicación y se configura en el archivo .env del servidor. Obtén una clave gratis desde Google AI Studio.";
  const recaptchaHint = "Las claves de reCAPTCHA (RECAPTCHA_SECRET_KEY y NEXT_PUBLIC_RECAPTCHA_SITE_KEY) son globales y se configuran en el .env del servidor.";
  
  const isSuperAdmin = userRole === 'super_admin';
  const effectivePlatform = serverConfig?.assignedPlatform;

  return (
    <div className="container mx-auto py-8 space-y-8">
      <input type="file" ref={fileInputRef} onChange={handleFileSelected} className="hidden" accept=".json" />
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
            <KeyRound className="h-6 w-6 text-primary" />
            <CardTitle>Clave de API del Plugin</CardTitle>
          </div>
          <CardDescription>
            Usa esta clave en los ajustes del plugin de WordPress para activar la conexión segura con la plataforma.
          </CardDescription>
        </CardHeader>
        <CardContent>
            {isLoadingConfig ? (
                 <Skeleton className="h-10 w-full" />
            ) : serverConfig?.apiKey ? (
                <div className="flex items-center gap-2">
                    <Input
                        readOnly
                        value={isApiKeyVisible ? serverConfig.apiKey : '•'.repeat(36)}
                        className={cn("font-code", !isApiKeyVisible && "tracking-widest")}
                    />
                     <Button variant="outline" size="icon" onClick={() => setIsApiKeyVisible(!isApiKeyVisible)}>
                        {isApiKeyVisible ? <EyeOff /> : <Eye />}
                    </Button>
                    <Button onClick={() => {
                        navigator.clipboard.writeText(serverConfig.apiKey!);
                        toast({ title: "Copiado", description: "La clave de API ha sido copiada." });
                    }}>Copiar</Button>
                </div>
            ) : (
                <p className="text-sm text-destructive">No se pudo generar tu clave de API. Por favor, recarga la página.</p>
            )}
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
              <Server className="h-4 w-4 mr-2 text-orange-500" />
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
          <div title={recaptchaHint} className="flex items-center justify-between p-3 border rounded-md bg-muted/30 cursor-help">
            <Label className="flex items-center cursor-help">
              <ShieldCheck className="h-4 w-4 mr-2 text-green-600" />
              Configuración reCAPTCHA (Global)
            </Label>
            <StatusBadge status={serverConfig?.recaptchaConfigured} loading={isLoadingConfig} />
          </div>
          
          {/* PER-USER/COMPANY SETTINGS */}
          {(isSuperAdmin || effectivePlatform === 'woocommerce') && (
            <>
              <div className="flex items-center justify-between p-3 border rounded-md">
                <Label className="flex items-center">
                    <Store className="h-4 w-4 mr-2 text-purple-500" />
                    Conexión WooCommerce
                </Label>
                <StatusBadge status={serverConfig?.wooCommerceConfigured} loading={isLoadingConfig} />
              </div>
              <div className="flex items-center justify-between p-3 border rounded-md">
                <Label className="flex items-center">
                    <Globe className="h-4 w-4 mr-2 text-blue-600" />
                    Conexión WordPress
                </Label>
                <StatusBadge status={serverConfig?.wordPressConfigured} loading={isLoadingConfig} />
              </div>
            </>
          )}

          {(isSuperAdmin || effectivePlatform === 'shopify') && (
            <>
                <div className="flex items-center justify-between p-3 border rounded-md">
                    <Label className="flex items-center">
                        <ShopifyIcon className="h-4 w-4 mr-2 text-green-600" />
                        Conexión a Tienda Shopify
                    </Label>
                    <StatusBadge status={serverConfig?.shopifyConfigured} loading={isLoadingConfig} />
                </div>
                <div className="flex items-center justify-between p-3 border rounded-md">
                    <Label className="flex items-center">
                        <ShopifyIcon className="h-4 w-4 mr-2 text-[#7ab55c]" />
                        Conexión Shopify Partner
                    </Label>
                    <StatusBadge status={serverConfig?.shopifyPartnerConfigured} loading={isLoadingConfig} />
                </div>
            </>
          )}
          
           <div className="mt-2 p-3 bg-accent/50 rounded-md flex items-start space-x-2">
            <Info className="h-5 w-5 text-primary flex-shrink-0 mt-0.5" />
            <div>
              <p className="text-sm text-muted-foreground">
                Las configuraciones marcadas como <span className="font-semibold">"(Global)"</span> se establecen en el archivo <code className="font-code bg-muted px-1 py-0.5 rounded-sm">.env</code> del servidor y afectan a toda la aplicación.
              </p>
               <p className="text-sm text-muted-foreground mt-2">
                 Las configuraciones de conexión son personales (o de empresa) y se gestionan en la página de <Link href="/settings/connections" className="underline font-medium">Conexiones API</Link>. Su visibilidad en este panel depende de la plataforma asignada a tu usuario o empresa.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>
      
      {userRole === 'super_admin' && (
        <Card className="shadow-lg">
            <CardHeader>
                 <div className="flex items-center space-x-2">
                    <Cookie className="h-6 w-6 text-primary" />
                    <CardTitle>Textos Legales</CardTitle>
                </div>
                <CardDescription>Edita el contenido de las páginas de política de privacidad, términos de servicio y política de cookies. Puedes usar HTML.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
                {isLoadingLegal ? (
                    <div className="space-y-4">
                        <Skeleton className="h-8 w-1/4" />
                        <Skeleton className="h-32 w-full" />
                        <Skeleton className="h-8 w-1/4" />
                        <Skeleton className="h-32 w-full" />
                         <Skeleton className="h-8 w-1/4" />
                        <Skeleton className="h-32 w-full" />
                    </div>
                ) : (
                    <>
                        <div>
                            <Label>Política de Privacidad</Label>
                            <RichTextEditor
                                content={legalTexts.privacyPolicy}
                                onChange={(newContent) => handleLegalContentChange('privacyPolicy', newContent)}
                                onInsertImage={handleDummyInsertImage}
                                placeholder="Introduce el texto de la política de privacidad aquí."
                            />
                        </div>
                        <div>
                            <Label>Términos de Servicio</Label>
                             <RichTextEditor
                                content={legalTexts.termsOfService}
                                onChange={(newContent) => handleLegalContentChange('termsOfService', newContent)}
                                onInsertImage={handleDummyInsertImage}
                                placeholder="Introduce los términos y condiciones del servicio aquí."
                            />
                        </div>
                         <div>
                            <Label>Política de Cookies</Label>
                             <RichTextEditor
                                content={legalTexts.cookiePolicy}
                                onChange={(newContent) => handleLegalContentChange('cookiePolicy', newContent)}
                                onInsertImage={handleDummyInsertImage}
                                placeholder="Introduce el texto de la política de cookies aquí."
                            />
                        </div>
                        <div className="flex justify-end pt-4 border-t mt-4">
                            <Button onClick={handleSaveLegal} disabled={isSavingLegal}>
                                {isSavingLegal ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
                                Guardar Textos Legales
                            </Button>
                        </div>
                    </>
                )}
            </CardContent>
        </Card>
      )}


      <Card className="shadow-lg">
        <CardHeader>
          <div className="flex items-center space-x-2">
            <DatabaseZap className="h-6 w-6 text-primary" />
            <CardTitle>Gestión de Datos y Plantillas</CardTitle>
          </div>
          <CardDescription>Exporta tus conexiones de API y plantillas de prompts a un archivo JSON de seguridad. También puedes limpiar tu historial de actividad.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
            <div className="space-y-2">
                <h4 className="font-medium">Copia de Seguridad</h4>
                <p className="text-sm text-muted-foreground mb-3">Exporta tus conexiones de API y plantillas de IA personalizadas a un archivo JSON.</p>
                <div className="flex flex-wrap gap-4">
                    <Button variant="outline" onClick={handleExportSettings} disabled={isExporting || isImporting}>
                        {isExporting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Download className="mr-2 h-4 w-4" />}
                        {isExporting ? 'Exportando...' : 'Exportar Configuración'}
                    </Button>
                    <Button variant="outline" onClick={handleImportClick} disabled={isImporting || isExporting}>
                        {isImporting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Upload className="mr-2 h-4 w-4" />}
                        {isImporting ? 'Importando...' : 'Importar Configuración'}
                    </Button>
                </div>
            </div>

            <div className="space-y-2 pt-4 border-t">
                <h4 className="font-medium">Limpieza de Datos</h4>
                <p className="text-sm text-muted-foreground mb-3">Elimina datos de la aplicación que ya no son necesarios o pertenecen a usuarios eliminados.</p>
                <div className="flex flex-wrap gap-4">
                    <AlertDialog>
                        <AlertDialogTrigger asChild>
                            <Button variant="destructive" disabled={isCleaning}>
                                {isCleaning ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Trash2 className="mr-2 h-4 w-4" />}
                                Limpiar Mi Historial
                            </Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                            <AlertDialogHeader>
                                <AlertDialogTitle>¿Estás absolutamente seguro?</AlertDialogTitle>
                                <AlertDialogDescription>
                                    Esta acción eliminará permanentemente todos TUS registros de actividad y notificaciones. No afectará a otros usuarios y no se puede deshacer.
                                </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                                <AlertDialogCancel>Cancelar</AlertDialogCancel>
                                <AlertDialogAction onClick={handleCleanup} className="bg-destructive hover:bg-destructive/90">
                                    Sí, eliminar mi historial
                                </AlertDialogAction>
                            </AlertDialogFooter>
                        </AlertDialogContent>
                    </AlertDialog>
                    
                    {userRole === 'super_admin' && (
                        <AlertDialog>
                            <AlertDialogTrigger asChild>
                                <Button variant="destructive" disabled={isCleaningOrphans}>
                                    {isCleaningOrphans ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Trash2 className="mr-2 h-4 w-4" />}
                                    Limpiar Registros Huérfanos
                                </Button>
                            </AlertDialogTrigger>
                            <AlertDialogContent>
                                <AlertDialogHeader>
                                    <AlertDialogTitle>¿Confirmar limpieza?</AlertDialogTitle>
                                    <AlertDialogDescription>
                                        Esta acción buscará y eliminará permanentemente todos los registros de actividad que pertenezcan a usuarios ya eliminados. No se puede deshacer.
                                    </AlertDialogDescription>
                                </AlertDialogHeader>
                                <AlertDialogFooter>
                                    <AlertDialogCancel>Cancelar</AlertDialogCancel>
                                    <AlertDialogAction onClick={handleOrphanCleanup} className="bg-destructive hover:bg-destructive/90">
                                        Sí, limpiar registros
                                    </AlertDialogAction>
                                </AlertDialogFooter>
                            </AlertDialogContent>
                        </AlertDialog>
                    )}
                </div>
            </div>
        </CardContent>
      </Card>
    </div>
  );
}
