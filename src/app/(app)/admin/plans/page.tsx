
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Shield } from "lucide-react";
import { PlanManager } from "./plan-manager";

export default function AdminPlansPage() {
  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <div className="flex items-center space-x-3">
            <Shield className="h-8 w-8 text-primary" />
            <div>
              <CardTitle>Gestión de Planes de Suscripción</CardTitle>
              <CardDescription>
                Define qué herramientas y funcionalidades están incluidas en cada plan.
              </CardDescription>
            </div>
          </div>
        </CardHeader>
      </Card>
      
      <PlanManager />

    </div>
  );
}
