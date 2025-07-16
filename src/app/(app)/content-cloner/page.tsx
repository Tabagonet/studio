

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Copy } from "lucide-react";
import { ContentClonerTable } from "./content-cloner-table";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";


export default function ContentClonerPage() {
  return (
    <div className="container mx-auto py-8 space-y-6">
      <Card>
        <CardHeader>
            <div className="flex items-center space-x-3">
                <Copy className="h-8 w-8 text-primary" />
                <div>
                    <CardTitle>Clonador y Traductor de Contenido</CardTitle>
                    <CardDescription>Selecciona contenido existente para clonarlo y traducirlo a otros idiomas.</CardDescription>
                </div>
            </div>
        </CardHeader>
      </Card>
      
       <Alert>
        <AlertTitle>¿Cómo funciona?</AlertTitle>
        <AlertDescription>
          Esta herramienta te permite duplicar cualquier página, entrada o producto y, a continuación, traducirlo a los idiomas que elijas. El sistema enlazará automáticamente el contenido original con sus nuevas traducciones. Usa la tabla de abajo para empezar.
        </AlertDescription>
      </Alert>

      <ContentClonerTable />

    </div>
  );
}
