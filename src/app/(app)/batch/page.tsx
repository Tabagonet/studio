
"use client";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Layers, Info, Image as ImageIcon } from "lucide-react";
import { ProductDataTable } from "./product-data-table";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";


export default function BatchProcessingPage() {
  return (
    <div className="container mx-auto py-8 space-y-6">
      <Card>
        <CardHeader>
            <div className="flex items-center space-x-3">
                <Layers className="h-8 w-8 text-primary" />
                <div>
                    <CardTitle>Gestión de Productos</CardTitle>
                    <CardDescription>Visualiza, selecciona y aplica acciones masivas a los productos de tu tienda.</CardDescription>
                </div>
            </div>
        </CardHeader>
      </Card>
      
      <Alert>
        <Info className="h-4 w-4" />
        <AlertTitle>Cómo Funciona</AlertTitle>
        <AlertDescription>
          Usa la tabla de abajo para gestionar tus productos. Puedes buscar por nombre y seleccionar múltiples productos usando las casillas de verificación. Una vez seleccionados, aparecerán las acciones disponibles, como aplicar IA, editar imágenes en lote o cambiar precios.
        </AlertDescription>
      </Alert>

      <ProductDataTable />

    </div>
  );
}
