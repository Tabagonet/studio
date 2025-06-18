import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { KeyRound, DatabaseZap, Save, Download, Upload } from "lucide-react";

export default function SettingsPage() {
  // In a real app, these would come from state/context/API
  const apiKeys = {
    wooCommerceKey: "",
    wooCommerceSecret: "",
    firebaseConfig: "",
    vercelEndpoint: ""
  };

  return (
    <div className="container mx-auto py-8 space-y-8">
      <div>
        <h1 className="text-3xl font-bold tracking-tight text-foreground font-headline">Configuración</h1>
        <p className="text-muted-foreground">Administra las claves API, configuraciones generales y datos de la aplicación.</p>
      </div>

      <Card className="shadow-lg">
        <CardHeader>
          <div className="flex items-center space-x-2">
            <KeyRound className="h-6 w-6 text-primary" />
            <CardTitle>Claves API y Endpoints</CardTitle>
          </div>
          <CardDescription>Ingresa tus claves API para WooCommerce, Firebase y el endpoint de Vercel.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <Label htmlFor="wooCommerceKey">Clave API WooCommerce</Label>
              <Input id="wooCommerceKey" type="password" defaultValue={apiKeys.wooCommerceKey} placeholder="ck_xxxxxxxxxxxx" />
            </div>
            <div>
              <Label htmlFor="wooCommerceSecret">Secreto API WooCommerce</Label>
              <Input id="wooCommerceSecret" type="password" defaultValue={apiKeys.wooCommerceSecret} placeholder="cs_xxxxxxxxxxxx" />
            </div>
          </div>
          <div>
            <Label htmlFor="firebaseConfig">Configuración Firebase (JSON)</Label>
            <Input id="firebaseConfig" type="text" defaultValue={apiKeys.firebaseConfig} placeholder='{"apiKey": "...", "authDomain": "..."}' />
            <p className="text-xs text-muted-foreground mt-1">Pega el objeto de configuración de Firebase aquí.</p>
          </div>
          <div>
            <Label htmlFor="vercelEndpoint">Endpoint Vercel Functions</Label>
            <Input id="vercelEndpoint" type="url" defaultValue={apiKeys.vercelEndpoint} placeholder="https://tu-app.vercel.app/api" />
          </div>
          <div className="flex justify-end">
            <Button><Save className="mr-2 h-4 w-4" /> Guardar Claves</Button>
          </div>
        </CardContent>
      </Card>

      <Card className="shadow-lg">
        <CardHeader>
          <div className="flex items-center space-x-2">
            <DatabaseZap className="h-6 w-6 text-primary" />
            <CardTitle>Gestión de Datos</CardTitle>
          </div>
          <CardDescription>Exporta o importa configuraciones y limpia datos temporales.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
            <div className="flex flex-wrap gap-4">
                <Button variant="outline"><Download className="mr-2 h-4 w-4" /> Exportar Configuración</Button>
                <Button variant="outline"><Upload className="mr-2 h-4 w-4" /> Importar Configuración</Button>
            </div>
            <div>
                <h4 className="font-medium mb-2">Limpieza de Datos</h4>
                <p className="text-sm text-muted-foreground mb-3">Elimina datos temporales almacenados en Firebase Storage (imágenes no procesadas, etc.).</p>
                <Button variant="destructive" disabled>Limpiar Datos Temporales</Button>
            </div>
        </CardContent>
      </Card>
    </div>
  );
}
