import { ProductWizard } from "@/components/features/wizard/product-wizard";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export default function WizardPage() {
  return (
    <div className="container mx-auto py-8">
      <Card className="max-w-4xl mx-auto shadow-2xl rounded-xl">
        <CardHeader className="bg-muted/30 p-6 rounded-t-xl">
          <CardTitle className="text-2xl font-bold tracking-tight text-foreground font-headline">Asistente de Creación de Productos</CardTitle>
          <CardDescription className="text-md">
            Sigue los pasos para crear nuevos productos en tu tienda WooCommerce de forma automatizada.
          </CardDescription>
        </CardHeader>
        <CardContent className="p-6 md:p-8">
          <ProductWizard />
        </CardContent>
      </Card>
    </div>
  );
}
