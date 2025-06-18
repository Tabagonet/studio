import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Cog, PlusCircle } from "lucide-react";

export default function RulesPage() {
  return (
    <div className="container mx-auto py-8">
      <div className="flex justify-between items-center mb-8">
        <div>
            <h1 className="text-3xl font-bold tracking-tight text-foreground font-headline">Reglas de Automatización</h1>
            <p className="text-muted-foreground">Configura reglas para la asignación automática de categorías y etiquetas.</p>
        </div>
        <Button>
            <PlusCircle className="mr-2 h-4 w-4" /> Nueva Regla
        </Button>
      </div>


      <Card className="shadow-lg">
        <CardHeader>
          <CardTitle>Mis Reglas</CardTitle>
          <CardDescription>Aquí se listarán tus reglas de automatización.</CardDescription>
        </CardHeader>
        <CardContent className="min-h-[200px] flex flex-col items-center justify-center text-center">
            <Cog className="h-16 w-16 text-muted-foreground mb-4" />
          <p className="text-muted-foreground mb-2">Aún no has creado ninguna regla.</p>
          <p className="text-sm text-muted-foreground">Usa el botón "Nueva Regla" para empezar.</p>
        </CardContent>
      </Card>
    </div>
  );
}
