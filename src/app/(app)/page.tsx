import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { PlusCircle, UploadCloud, Settings2, History } from "lucide-react";
import Link from "next/link";

export default function DashboardPage() {
  return (
    <div className="container mx-auto py-8">
      <div className="mb-8">
        <h1 className="text-3xl font-bold tracking-tight text-foreground font-headline">Panel de Control</h1>
        <p className="text-muted-foreground">Bienvenido a WooAutomate. Gestiona tus productos y automatizaciones.</p>
      </div>

      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
        <Card className="shadow-lg hover:shadow-xl transition-shadow duration-300">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-lg font-medium">Crear Nuevo Producto</CardTitle>
            <PlusCircle className="h-6 w-6 text-primary" />
          </CardHeader>
          <CardContent>
            <CardDescription className="mb-4">
              Inicia el asistente para añadir productos simples o variables a tu tienda WooCommerce.
            </CardDescription>
            <Button asChild className="w-full">
              <Link href="/wizard">Iniciar Asistente</Link>
            </Button>
          </CardContent>
        </Card>

        <Card className="shadow-lg hover:shadow-xl transition-shadow duration-300">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-lg font-medium">Procesamiento en Lotes</CardTitle>
            <UploadCloud className="h-6 w-6 text-primary" />
          </CardHeader>
          <CardContent>
            <CardDescription className="mb-4">
              Sube múltiples imágenes para crear varios productos a la vez de forma eficiente.
            </CardDescription>
            <Button variant="outline" className="w-full" disabled>Próximamente</Button>
          </CardContent>
        </Card>

        <Card className="shadow-lg hover:shadow-xl transition-shadow duration-300">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-lg font-medium">Configuración Rápida</CardTitle>
            <Settings2 className="h-6 w-6 text-primary" />
          </CardHeader>
          <CardContent>
            <CardDescription className="mb-4">
              Ajusta plantillas, reglas de automatización y claves API para personalizar el plugin.
            </CardDescription>
            <Button asChild variant="secondary" className="w-full">
               <Link href="/settings">Ir a Configuración</Link>
            </Button>
          </CardContent>
        </Card>
      </div>

      <Card className="mt-8 shadow-lg">
        <CardHeader>
          <CardTitle className="text-xl font-medium">Actividad Reciente</CardTitle>
          <History className="h-5 w-5 text-muted-foreground inline-block ml-2"/>
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground">Aún no hay actividad reciente. Los productos creados y procesados aparecerán aquí.</p>
          {/* Placeholder for recent activity table/list */}
        </CardContent>
      </Card>
    </div>
  );
}
