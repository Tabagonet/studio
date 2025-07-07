
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Briefcase } from "lucide-react";
import { ProspectsTable } from './prospects-table';

export default function ProspectsPage() {
  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <div className="flex items-center space-x-3">
            <Briefcase className="h-8 w-8 text-primary" />
            <div>
              <CardTitle>Gestión de Prospectos</CardTitle>
              <CardDescription>
                Gestiona los leads capturados a través del chatbot público y otras fuentes.
              </CardDescription>
            </div>
          </div>
        </CardHeader>
      </Card>
      
      <ProspectsTable />
    </div>
  );
}
