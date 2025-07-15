
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ListChecks } from "lucide-react";
import { JobsDataTable } from './data-table';
import { Alert, AlertTitle, AlertDescription } from "@/components/ui/alert";

export default function ShopifyJobsPage() {
  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <div className="flex items-center space-x-3">
            <ListChecks className="h-8 w-8 text-primary" />
            <div>
              <CardTitle>Trabajos de Creación de Tiendas Shopify</CardTitle>
              <CardDescription>
                Monitoriza el estado de las tiendas que se están creando automáticamente.
              </CardDescription>
            </div>
          </div>
        </CardHeader>
      </Card>
      
       <Alert>
        <AlertTitle>Nuevo Flujo de Trabajo</AlertTitle>
        <AlertDescription>
          <ol className="list-decimal list-inside space-y-1 mt-2">
            <li>Elige un trabajo con estado "Pendiente" y haz clic en "Asignar Tienda" desde el menú de acciones.</li>
            <li>Introduce el dominio ".myshopify.com" y el ID de la tienda de desarrollo que has creado previamente en tu panel de Partner.</li>
            <li>Una vez asignada, el estado cambiará a "Esperando Autorización". Haz clic en "Autorizar Instalación".</li>
            <li>Serás redirigido a Shopify para aprobar la instalación de la app.</li>
             <li>Una vez autorizada, vuelve a esta pantalla y haz clic en "Poblar Contenido" para que la IA genere y añada el contenido a la tienda.</li>
          </ol>
        </AlertDescription>
      </Alert>

      <JobsDataTable />

    </div>
  );
}
