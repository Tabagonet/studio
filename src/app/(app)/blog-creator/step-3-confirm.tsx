
// src/app/(app)/blog-creator/step-3-confirm.tsx
import React from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import type { BlogPostData, StepConfirmProps } from "@/lib/types"; 
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { ListChecks, Rocket } from "lucide-react";


export function Step3Confirm({ data, onValidationComplete }: StepConfirmProps) {
  const postData = data as BlogPostData;
  const photosToUploadCount = postData.featuredImage?.file ? 1 : 0;
  const categoryName = postData.category?.name || postData.categoryPath || 'No especificada';

   // Perform validation here and call the callback
  React.useEffect(() => {
    const isValid = !!postData.title && !!postData.content; 
    onValidationComplete(isValid);
  }, [postData.title, postData.content, onValidationComplete]);


  return (
    <div className="space-y-8">
       <Card>
        <CardHeader>
          <CardTitle>Paso 3: Confirmación y Creación</CardTitle>
          <CardDescription>Estás a punto de iniciar el proceso de creación de la(s) entrada(s) del blog.</CardDescription>
        </CardHeader>
      </Card>

      <Alert>
        <Rocket className="h-4 w-4" />
        <AlertTitle>Proceso de Creación</AlertTitle>
        <AlertDescription>
          Al hacer clic en "Crear Entrada(s)", se realizarán las siguientes acciones en orden:
          <ul className="list-decimal list-inside mt-2 space-y-1">
            {photosToUploadCount > 0 && (
                 <li>
                    <span className="font-semibold">Subida de Imagen:</span> Se subirá la imagen destacada a tu servidor.
                </li>
            )}
            <li>
              <span className="font-semibold">Creación de Entrada Principal:</span> Se creará la entrada en {postData.sourceLanguage}.
            </li>
            {postData.targetLanguages.length > 0 && (
                 <li>
                    <span className="font-semibold">Creación de Traducciones:</span> Se traducirá y creará una entrada para cada idioma seleccionado ({postData.targetLanguages.join(', ')}).
                </li>
            )}
             {postData.targetLanguages.length > 0 && (
                 <li>
                    <span className="font-semibold">Enlazado Automático:</span> Todas las traducciones se enlazarán entre sí.
                </li>
            )}
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
            <p><span className="font-semibold">Título:</span> {postData.title || "N/A"}</p>
            <p><span className="font-semibold">Autor:</span> {postData.author?.name || "N/A"}</p>
            <p><span className="font-semibold">Categoría:</span> {categoryName}</p>
            <p><span className="font-semibold">Imágenes a subir:</span> {photosToUploadCount}</p>
            <p><span className="font-semibold">Etiquetas:</span> {postData.tags.join(', ') || "Ninguna"}</p>
            <p><span className="font-semibold">Traducciones:</span> {postData.targetLanguages.length > 0 ? postData.targetLanguages.join(', ') : "Ninguna"}</p>
        </CardContent>
      </Card>
    </div>
  );
}

    