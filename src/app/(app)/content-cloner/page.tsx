

"use client";

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
                    <CardTitle>Gestor de Contenido y Clonador</CardTitle>
                    <CardDescription>Visualiza todo tu contenido y selecciona elementos para clonarlos y traducirlos a otros idiomas.</CardDescription>
                </div>
            </div>
        </CardHeader>
      </Card>
      
       <Alert>
        <AlertTitle>¿Cómo funciona?</AlertTitle>
        <AlertDescription>
          Esta herramienta te permite ver todas tus páginas, entradas y productos en un solo lugar. Selecciona el contenido que desees duplicar y elige un idioma de destino para que la IA lo traduzca automáticamente. El sistema enlazará la nueva traducción con la original.
        </AlertDescription>
      </Alert>

      <ContentClonerTable />

    </div>
  );
}
