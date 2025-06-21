import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Cog } from "lucide-react";

export default function RulesPage() {
  return (
    <div className="container mx-auto py-8">
      <Card>
        <CardHeader>
            <div className="flex items-center space-x-3">
                <Cog className="h-8 w-8 text-primary" />
                <div>
                    <CardTitle>Reglas de Automatización</CardTitle>
                    <CardDescription>Esta funcionalidad será reconstruida.</CardDescription>
                </div>
            </div>
        </CardHeader>
        <CardContent>
            <div className="min-h-[200px] flex items-center justify-center text-center text-muted-foreground">
                <p>La interfaz para gestionar las reglas de automatización se implementará aquí de nuevo.</p>
            </div>
        </CardContent>
      </Card>
    </div>
  );
}
