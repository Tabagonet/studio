import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Brain } from "lucide-react";

export default function PromptsPage() {
  return (
    <div className="container mx-auto py-8">
      <Card>
        <CardHeader>
            <div className="flex items-center space-x-3">
                <Brain className="h-8 w-8 text-primary" />
                <div>
                    <CardTitle>Gestión de Prompts de IA</CardTitle>
                    <CardDescription>Esta funcionalidad será reconstruida.</CardDescription>
                </div>
            </div>
        </CardHeader>
        <CardContent>
            <div className="min-h-[200px] flex items-center justify-center text-center text-muted-foreground">
                <p>La interfaz para gestionar los prompts de IA se implementará aquí de nuevo.</p>
            </div>
        </CardContent>
      </Card>
    </div>
  );
}
