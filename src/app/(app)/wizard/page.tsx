
import { ProductWizard } from "@/components/features/wizard/product-wizard";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Wand2 } from "lucide-react";

export default function WizardPage() {
  return (
    <div className="container mx-auto py-8">
       <Card className="mb-8">
        <CardHeader>
            <div className="flex items-center space-x-3">
                <Wand2 className="h-8 w-8 text-primary" />
                <div>
                    <CardTitle>Asistente de Creación de Productos</CardTitle>
                    <CardDescription>Sigue los pasos para añadir un nuevo producto a tu tienda.</CardDescription>
                </div>
            </div>
        </CardHeader>
      </Card>
      <ProductWizard />
    </div>
  );
}
