
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { KeyRound, DatabaseZap, Save, Download, Upload, Info } from "lucide-react";

export default function SettingsPage() {
  // In a real app, non-sensitive settings might be fetched/stored.
  // Sensitive keys are managed via .env variables.

  const isWooCommerceConfigured = !!process.env.WOOCOMMERCE_API_KEY && !!process.env.WOOCOMMERCE_API_SECRET;
  const isFirebaseConfigured = !!process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID;
  const isVercelEndpointSet = !!process.env.VERCEL_PROCESSING_ENDPOINT;


  return (
    <div className="container mx-auto py-8 space-y-8">
      <div>
        <h1 className="text-3xl font-bold tracking-tight text-foreground font-headline">Configuración</h1>
        <p className="text-muted-foreground">Administra las configuraciones generales y datos de la aplicación.</p>
      </div>

      <Card className="shadow-lg">
        <CardHeader>
          <div className="flex items-center space-x-2">
            <KeyRound className="h-6 w-6 text-primary" />
            <CardTitle>Estado de Configuración de API</CardTitle>
          </div>
          <CardDescription>
            Las claves API y endpoints críticos se configuran mediante variables de entorno por seguridad.
            Aquí puedes verificar su estado.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between p-3 border rounded-md">
            <Label htmlFor="wooCommerceStatus">Claves API WooCommerce</Label>
            <span id="wooCommerceStatus" className={`px-2 py-1 text-xs rounded-full ${isWooCommerceConfigured ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
              {isWooCommerceConfigured ? "Configuradas" : "No Configuradas"}
            </span>
          </div>
          <div className="flex items-center justify-between p-3 border rounded-md">
            <Label htmlFor="firebaseStatus">Configuración Firebase</Label>
             <span id="firebaseStatus" className={`px-2 py-1 text-xs rounded-full ${isFirebaseConfigured ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
              {isFirebaseConfigured ? "Configurada" : "No Configurada"}
            </span>
          </div>
          <div className="flex items-center justify-between p-3 border rounded-md">
            <Label htmlFor="vercelStatus">Endpoint Vercel Functions</Label>
            <span id="vercelStatus" className={`px-2 py-1 text-xs rounded-full ${isVercelEndpointSet ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
              {isVercelEndpointSet ? "Configurado" : "No Configurado"}
            </span>
          </div>
           <div className="mt-2 p-3 bg-accent/50 rounded-md flex items-start space-x-2">
            <Info className="h-5 w-5 text-primary flex-shrink-0 mt-0.5" />
            <p className="text-sm text-muted-foreground">
              Para configurar estas claves, edita el archivo <code className="font-code bg-muted px-1 py-0.5 rounded-sm">.env</code> en la raíz de tu proyecto y reinicia la aplicación.
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
                <p className="text-sm text-muted-foreground mb-3">Elimina datos temporales almacenados en Firebase Storage (imágenes no procesadas, etc.). Esta acción es irreversible.</p>
                <Button variant="destructive" disabled>Limpiar Datos Temporales</Button>
                 <p className="text-xs text-muted-foreground mt-1">Esta funcionalidad estará disponible próximamente.</p>
            </div>
        </CardContent>
      </Card>
    </div>
  );
}
