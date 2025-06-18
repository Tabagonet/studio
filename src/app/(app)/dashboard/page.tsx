import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { PlusCircle, UploadCloud, Settings2, History, BarChart3, FileArchive } from "lucide-react";
import Link from "next/link";

export default function DashboardPage() {
  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-bold tracking-tight text-foreground font-headline">Panel de Control</h1>
        <p className="text-muted-foreground">Bienvenido a WooAutomate. Gestiona tus productos y automatizaciones.</p>
      </div>

      <section aria-labelledby="quick-actions-title">
        <h2 id="quick-actions-title" className="text-xl font-semibold mb-4 text-foreground font-headline">Acciones Rápidas</h2>
        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          <Card className="shadow-lg hover:shadow-xl transition-shadow duration-300 rounded-lg">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-lg font-medium">Crear Nuevo Producto</CardTitle>
              <PlusCircle className="h-6 w-6 text-primary" />
            </CardHeader>
            <CardContent>
              <CardDescription className="mb-4 text-sm">
                Inicia el asistente para añadir productos simples o variables a tu tienda WooCommerce.
              </CardDescription>
              <Button asChild className="w-full">
                <Link href="/wizard">Iniciar Asistente</Link>
              </Button>
            </CardContent>
          </Card>

          <Card className="shadow-lg hover:shadow-xl transition-shadow duration-300 rounded-lg">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-lg font-medium">Procesamiento en Lotes</CardTitle>
              <UploadCloud className="h-6 w-6 text-primary" />
            </CardHeader>
            <CardContent>
              <CardDescription className="mb-4 text-sm">
                Sube múltiples imágenes para crear varios productos a la vez de forma eficiente.
              </CardDescription>
              <Button variant="outline" className="w-full" disabled>Próximamente</Button>
            </CardContent>
          </Card>

          <Card className="shadow-lg hover:shadow-xl transition-shadow duration-300 rounded-lg">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-lg font-medium">Configuración</CardTitle>
              <Settings2 className="h-6 w-6 text-primary" />
            </CardHeader>
            <CardContent>
              <CardDescription className="mb-4 text-sm">
                Ajusta plantillas, reglas y claves API para personalizar el plugin.
              </CardDescription>
              <Button asChild variant="secondary" className="w-full">
                 <Link href="/settings">Ir a Configuración</Link>
              </Button>
            </CardContent>
          </Card>
        </div>
      </section>

      <section aria-labelledby="statistics-title">
        <h2 id="statistics-title" className="text-xl font-semibold mb-4 text-foreground font-headline">Estadísticas</h2>
        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          <Card className="rounded-lg">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Productos Creados (Mes)</CardTitle>
              <BarChart3 className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">0</div>
              <p className="text-xs text-muted-foreground">0 este mes</p>
            </CardContent>
          </Card>
           <Card className="rounded-lg">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Espacio Ahorrado</CardTitle>
              <FileArchive className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">0 MB</div>
              <p className="text-xs text-muted-foreground">Por optimización de imágenes</p>
            </CardContent>
          </Card>
           <Card className="rounded-lg">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Tareas en Cola</CardTitle>
              <History className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">0</div>
              <p className="text-xs text-muted-foreground">Procesos en segundo plano</p>
            </CardContent>
          </Card>
        </div>
      </section>

      <section aria-labelledby="recent-activity-title">
        <h2 id="recent-activity-title" className="text-xl font-semibold mb-4 text-foreground font-headline">Actividad Reciente</h2>
        <Card className="shadow-lg rounded-lg">
          <CardHeader>
            <CardTitle className="text-lg font-medium">Últimos Productos Procesados</CardTitle>
             <CardDescription className="text-sm">
                Aquí se mostrará una lista de los productos más recientes.
              </CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-muted-foreground">Aún no hay actividad reciente. Los productos creados y procesados aparecerán aquí.</p>
            {/* Placeholder for recent activity table/list */}
          </CardContent>
        </Card>
      </section>
    </div>
  );
}
