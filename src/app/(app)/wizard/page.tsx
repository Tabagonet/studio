import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Wand2 } from "lucide-react";

export default function WizardPage() {
  return (
    <div className="container mx-auto py-8">
      <Card>
        <CardHeader>
            <div className="flex items-center space-x-3">
                <Wand2 className="h-8 w-8 text-primary" />
                <div>
                    <CardTitle>Asistente de Creación de Productos</CardTitle>
                    <CardDescription>Esta funcionalidad será reconstruida.</CardDescription>
                </div>
            </div>
        </CardHeader>
        <CardContent>
            <div className="min-h-[200px] flex items-center justify-center text-center text-muted-foreground">
                <p>El asistente paso a paso para crear productos se implementará aquí de nuevo.</p>
            </div>
        </CardContent>
      </Card>
    </div>
  );
}
