
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
// import { Input } from "@/components/ui/input"; // Not used for .env vars
import { Label } from "@/components/ui/label";
import { KeyRound, DatabaseZap, Save, Download, Upload, Info, Globe } from "lucide-react";

export default function SettingsPage() {
  // Values are read from process.env (server-side) or process.env.NEXT_PUBLIC_ (client-side)
  // These are illustrative checks; actual usage of these env vars happens in backend/client logic.

  // Client-side accessible Firebase config check
  const isFirebaseClientConfigured = !!process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID &&
                                     !!process.env.NEXT_PUBLIC_FIREBASE_API_KEY;

  // Server-side Firebase Admin config (not directly checkable from client, but we can hint)
  // We can't *actually* check process.env.FIREBASE_SERVICE_ACCOUNT_JSON from client.
  // This display is more of a guide for the developer.
  const firebaseAdminHint = "Configurada en variables de entorno del servidor (FIREBASE_SERVICE_ACCOUNT_JSON)";
  
  // Server-side WooCommerce config
  const isWooCommerceStoreUrlSet = !!process.env.WOOCOMMERCE_STORE_URL; // This will be undefined on client
  const isWooCommerceKeysSet = !!process.env.WOOCOMMERCE_API_KEY && !!process.env.WOOCOMMERCE_API_SECRET; // Undefined on client

  // Note: process.env for server-side vars will be undefined when this component renders on the client.
  // For a true status check of server-side vars, an API call would be needed, or this page should be server-rendered.
  // Given it's a settings *display* page, we'll show hints for server vars.

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
            Las claves API, URLs de tienda y configuraciones de servicios críticos se gestionan mediante variables de entorno por seguridad.
            Aquí puedes verificar si las variables públicas están accesibles y obtener guías para las variables de servidor.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between p-3 border rounded-md">
            <Label htmlFor="firebaseClientStatus" className="flex items-center"><img src="https://www.gstatic.com/mobilesdk/160503_mobilesdk/logo/2x/firebase_28.png" alt="Firebase" className="h-4 w-4 mr-2" />Configuración Firebase (Cliente)</Label>
             <span id="firebaseClientStatus" className={`px-2 py-1 text-xs rounded-full ${isFirebaseClientConfigured ? 'bg-green-100 text-green-700' : 'bg-yellow-100 text-yellow-700'}`}>
              {isFirebaseClientConfigured ? "Detectada" : "No Detectada"}
            </span>
          </div>
          <div className="flex items-center justify-between p-3 border rounded-md bg-muted/30">
            <Label htmlFor="firebaseAdminStatus" className="flex items-center"><img src="https://www.gstatic.com/mobilesdk/160503_mobilesdk/logo/2x/firebase_28.png" alt="Firebase" className="h-4 w-4 mr-2" />Configuración Firebase (Admin)</Label>
            <span id="firebaseAdminStatus" className="px-2 py-1 text-xs rounded-full bg-blue-100 text-blue-700">
              {firebaseAdminHint}
            </span>
          </div>
          <div className="flex items-center justify-between p-3 border rounded-md bg-muted/30">
            <Label htmlFor="wooCommerceStoreUrlStatus" className="flex items-center"><Globe className="h-4 w-4 mr-2 text-purple-600" />URL Tienda WooCommerce</Label>
            <span id="wooCommerceStoreUrlStatus" className="px-2 py-1 text-xs rounded-full bg-blue-100 text-blue-700">
              Configurada en .env (WOOCOMMERCE_STORE_URL)
            </span>
          </div>
          <div className="flex items-center justify-between p-3 border rounded-md bg-muted/30">
            <Label htmlFor="wooCommerceApiStatus" className="flex items-center"><KeyRound className="h-4 w-4 mr-2 text-purple-600" />Claves API WooCommerce</Label>
            <span id="wooCommerceApiStatus" className="px-2 py-1 text-xs rounded-full bg-blue-100 text-blue-700">
              Configuradas en .env (WOOCOMMERCE_API_KEY/SECRET)
            </span>
          </div>
          
           <div className="mt-2 p-3 bg-accent/50 rounded-md flex items-start space-x-2">
            <Info className="h-5 w-5 text-primary flex-shrink-0 mt-0.5" />
            <p className="text-sm text-muted-foreground">
              Para configurar estas claves y URLs, edita el archivo <code className="font-code bg-muted px-1 py-0.5 rounded-sm">.env</code> en la raíz de tu proyecto y reinicia la aplicación.
              Las variables <code className="font-code bg-muted px-1 py-0.5 rounded-sm">NEXT_PUBLIC_...</code> son para el cliente (navegador), las demás son para el servidor.
            </p>
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
