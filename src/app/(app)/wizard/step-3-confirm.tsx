// src/app/(app)/wizard/step-3-confirm.tsx
import React, { useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import type { StepConfirmProps } from "@/lib/types"; 
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { ListChecks, Rocket } from "lucide-react";


export function Step3Confirm({ productData, onValidationComplete }: StepConfirmProps) {
  const data = productData!;
  const photosToUploadCount = data.photos.filter(p => p.file).length;
  const validAttributesCount = data.attributes.filter(a => a.name && a.name.trim() !== '').length;
  const categoryName = data.category?.name || data.categoryPath || 'No especificada';

   // Perform validation here and call the callback
  useEffect(() => {
    const isValid = !!data.name; 
    onValidationComplete(isValid);
  }, [data.name, onValidationComplete]);


  return (
    <div className="space-y-8">
       <Card>
        <CardHeader>
          <CardTitle>Paso 3: Confirmación y Creación</CardTitle>
          <CardDescription>Estás a punto de iniciar el proceso de creación del producto.</CardDescription>
        </CardHeader>
      </Card>

      <Alert>
        <Rocket className="h-4 w-4" />
        <AlertTitle>Proceso de Creación</AlertTitle>
        <AlertDescription>
          Al hacer clic en "Crear Producto", se realizarán las siguientes acciones en orden:
          <ul className="list-decimal list-inside mt-2 space-y-1">
            <li>
              <span className="font-semibold">Subida de Imágenes:</span> Se subirán {photosToUploadCount} imágen(es) a tu servidor. Verás el progreso en la sección de imágenes.
            </li>
            <li>
              <span className="font-semibold">Creación en WooCommerce:</span> Una vez que todas las imágenes estén subidas, se creará el producto en tu tienda con toda la información proporcionada.
            </li>
          </ul>
        </AlertDescription>
      </Alert>
      
      <Card>
        <CardHeader>
          <div className="flex items-center space-x-2">
            <ListChecks className="h-5 w-5 text-primary" />
            <CardTitle>Resumen Final</CardTitle>
          </div>
        </CardHeader>
        <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-4">
            <p><span className="font-semibold">Nombre:</span> {data.name || "N/A"}</p>
            <p><span className="font-semibold">SKU:</span> {data.sku || "N/A"}</p>
            <p><span className="font-semibold">Precio Regular:</span> {data.regularPrice ? `${data.regularPrice}€` : "N/A"}</p>
            <p><span className="font-semibold">Categoría:</span> {categoryName}</p>
            <p><span className="font-semibold">Atributos:</span> {validAttributesCount}</p>
            <p><span className="font-semibold">Imágenes:</span> {data.photos.length}</p>
            <p><span className="font-semibold">Etiquetas:</span> {data.tags.join(', ') || "Ninguna"}</p>
        </CardContent>
      </Card>
      
    </div>
  );
}
