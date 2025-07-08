
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ListChecks } from "lucide-react";
import { JobsDataTable } from './data-table';

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
      
      <JobsDataTable />

    </div>
  );
}
