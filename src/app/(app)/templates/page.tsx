import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { FileText, PlusCircle } from "lucide-react";

export default function TemplatesPage() {
  return (
    <div className="container mx-auto py-8">
      <div className="flex justify-between items-center mb-8">
        <div>
            <h1 className="text-3xl font-bold tracking-tight text-foreground font-headline">Gestión de Plantillas</h1>
            <p className="text-muted-foreground">Crea y administra plantillas para nombres SEO, descripciones y metadatos.</p>
        </div>
        <Button>
            <PlusCircle className="mr-2 h-4 w-4" /> Nueva Plantilla
        </Button>
      </div>

      <Card className="shadow-lg">
        <CardHeader>
          <CardTitle>Mis Plantillas</CardTitle>
          <CardDescription>Aquí se listarán tus plantillas personalizadas.</CardDescription>
        </CardHeader>
        <CardContent className="min-h-[200px] flex flex-col items-center justify-center text-center">
            <FileText className="h-16 w-16 text-muted-foreground mb-4" />
          <p className="text-muted-foreground mb-2">Aún no has creado ninguna plantilla.</p>
          <p className="text-sm text-muted-foreground">Usa el botón "Nueva Plantilla" para empezar.</p>
        </CardContent>
      </Card>
    </div>
  );
}
