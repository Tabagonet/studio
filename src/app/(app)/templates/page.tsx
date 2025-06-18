
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { FileText, PlusCircle, Edit3, Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";

interface ExampleTemplate {
  id: string;
  name: string;
  type: 'Nombre SEO' | 'Descripción Corta' | 'Descripción Larga' | 'Metadatos';
  scope: 'Global' | 'Categoría Específica';
  lastModified: string;
}

const exampleTemplates: ExampleTemplate[] = [
  {
    id: "1",
    name: "Plantilla SEO Estándar para Ropa",
    type: "Nombre SEO",
    scope: "Categoría Específica",
    lastModified: "2023-10-26",
  },
  {
    id: "2",
    name: "Descripción Corta General Productos",
    type: "Descripción Corta",
    scope: "Global",
    lastModified: "2023-11-15",
  },
  {
    id: "3",
    name: "Metadatos Detallados Electrónica",
    type: "Metadatos",
    scope: "Categoría Específica",
    lastModified: "2024-01-05",
  },
    {
    id: "4",
    name: "Plantilla Descripción Larga para Muebles",
    type: "Descripción Larga",
    scope: "Categoría Específica",
    lastModified: "2024-02-10",
  },
];

export default function TemplatesPage() {
  return (
    <div className="container mx-auto py-8">
      <div className="flex flex-col md:flex-row justify-between md:items-center gap-4 mb-8">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-foreground font-headline">Gestión de Plantillas</h1>
          <p className="text-muted-foreground">Crea y administra plantillas para nombres SEO, descripciones y metadatos.</p>
        </div>
        <Button disabled>
          <PlusCircle className="mr-2 h-4 w-4" /> Nueva Plantilla
        </Button>
      </div>

      <Card className="shadow-lg rounded-lg">
        <CardHeader className="border-b">
          <CardTitle>Mis Plantillas</CardTitle>
          <CardDescription>Aquí se listarán tus plantillas personalizadas. Actualmente se muestran ejemplos.</CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          {exampleTemplates.length > 0 ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[40%]">Nombre de Plantilla</TableHead>
                  <TableHead>Tipo</TableHead>
                  <TableHead>Ámbito</TableHead>
                  <TableHead>Última Modificación</TableHead>
                  <TableHead className="text-right">Acciones</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {exampleTemplates.map((template) => (
                  <TableRow key={template.id}>
                    <TableCell className="font-medium">{template.name}</TableCell>
                    <TableCell>
                        <Badge variant={
                            template.type === 'Nombre SEO' ? 'default' :
                            template.type === 'Descripción Corta' ? 'secondary' :
                            template.type === 'Descripción Larga' ? 'outline' :
                            'destructive' // For 'Metadatos' or other types
                        }>{template.type}</Badge>
                    </TableCell>
                    <TableCell>{template.scope}</TableCell>
                    <TableCell>{template.lastModified}</TableCell>
                    <TableCell className="text-right">
                      <Button variant="ghost" size="icon" className="mr-2 h-8 w-8" title="Editar (Funcionalidad Futura)" disabled>
                        <Edit3 className="h-4 w-4" />
                      </Button>
                      <Button variant="ghost" size="icon" className="h-8 w-8" title="Eliminar (Funcionalidad Futura)" disabled>
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : (
            <div className="min-h-[200px] flex flex-col items-center justify-center text-center p-6">
              <FileText className="h-16 w-16 text-muted-foreground mb-4" />
              <p className="text-muted-foreground mb-2">Aún no has creado ninguna plantilla.</p>
              <p className="text-sm text-muted-foreground">Usa el botón "Nueva Plantilla" para empezar.</p>
            </div>
          )}
        </CardContent>
         {exampleTemplates.length > 0 && (
            <CardFooter className="border-t pt-4 flex justify-end">
                 <p className="text-xs text-muted-foreground">Mostrando {exampleTemplates.length} plantillas de ejemplo.</p>
            </CardFooter>
        )}
      </Card>
    </div>
  );
}
