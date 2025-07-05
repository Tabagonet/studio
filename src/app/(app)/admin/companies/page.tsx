import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Building } from "lucide-react";
import { CompanyManagement } from './company-management';

export default function AdminCompaniesPage() {
  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <div className="flex items-center space-x-3">
            <Building className="h-8 w-8 text-primary" />
            <div>
              <CardTitle>Gestión de Empresas</CardTitle>
              <CardDescription>
                Crea y gestiona las cuentas de empresa de la plataforma.
              </CardDescription>
            </div>
          </div>
        </CardHeader>
      </Card>
      
      <CompanyManagement />

    </div>
  );
}
