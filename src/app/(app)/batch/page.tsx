// src/app/(app)/batch/page.tsx
"use client";

import React, { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { UploadCloud, ListTree, AlertTriangle } from "lucide-react";
import { ImageUploader } from "@/components/features/wizard/image-uploader"; // Assuming ImageUploader path
import type { ProductPhoto } from '@/lib/types'; // Assuming ProductPhoto type path
import { ScrollArea } from '@/components/ui/scroll-area';

export default function BatchProcessingPage() {
  const [photos, setPhotos] = useState<ProductPhoto[]>([]);

  const handleStartProcessing = () => {
    // Placeholder for starting batch processing logic
    console.log("Starting batch processing with photos:", photos);
    // This will eventually trigger uploads to Firebase and then Vercel functions
  };

  // Placeholder: Extract product groups from photo names
  const getDetectedProducts = () => {
    if (photos.length === 0) return [];
    
    const productGroups: Record<string, string[]> = {};
    photos.forEach(photo => {
      // Simplified base name extraction for now. E.g. "Camiseta-Cool-1.jpg" -> "Camiseta-Cool"
      const baseNameMatch = photo.name.match(/^(.+)-\d+\.(jpe?g)$/i);
      const baseName = baseNameMatch ? baseNameMatch[1] : photo.name.replace(/-\d+\.(jpe?g)$/i, '');
      
      if (!productGroups[baseName]) {
        productGroups[baseName] = [];
      }
      productGroups[baseName].push(photo.name);
    });
    return Object.entries(productGroups);
  };

  const detectedProducts = getDetectedProducts();

  return (
    <div className="container mx-auto py-8 space-y-8">
      <div>
        <h1 className="text-3xl font-bold tracking-tight text-foreground font-headline">Procesamiento de Productos en Lote</h1>
        <p className="text-muted-foreground">
          Sube múltiples imágenes JPG para crear varios productos a la vez.
          Las imágenes deben seguir el patrón <code className="bg-muted px-1 py-0.5 rounded-sm font-code">NombreProducto-IDENTIFICADORES-NUMERO.jpg</code> (ej: <code className="bg-muted px-1 py-0.5 rounded-sm font-code">Camiseta-Azul-TallaS-1.jpg</code>).
        </p>
      </div>

      <Card className="shadow-xl rounded-lg">
        <CardHeader className="bg-muted/30 p-6 rounded-t-lg">
          <div className="flex items-center space-x-3">
            <UploadCloud className="h-8 w-8 text-primary" />
            <div>
              <CardTitle className="text-xl">Cargar Imágenes para Lote</CardTitle>
              <CardDescription>
                Arrastra y suelta tus imágenes JPG o haz clic para seleccionarlas. Máximo 50 archivos, 2MB por archivo.
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-6 md:p-8">
          <ImageUploader photos={photos} onPhotosChange={setPhotos} maxFiles={50} maxSizeMB={2} />
        </CardContent>
      </Card>

      {photos.length > 0 && (
        <Card className="shadow-lg rounded-lg">
          <CardHeader>
            <div className="flex items-center space-x-3">
              <ListTree className="h-8 w-8 text-primary" />
              <div>
                <CardTitle>Productos Detectados (Agrupados por Nombre Base)</CardTitle>
                <CardDescription>
                  Revisa los productos agrupados a partir de los nombres de archivo. Podrás editarlos antes de procesar.
                </CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            {detectedProducts.length > 0 ? (
              <ScrollArea className="h-72">
                <ul className="space-y-3">
                  {detectedProducts.map(([baseName, imageList]) => (
                    <li key={baseName} className="p-3 border rounded-md bg-background">
                      <p className="font-semibold text-foreground">{baseName.replace(/-/g, ' ')}</p>
                      <ul className="list-disc list-inside pl-4 text-sm text-muted-foreground">
                        {imageList.map(imgName => <li key={imgName}>{imgName}</li>)}
                      </ul>
                    </li>
                  ))}
                </ul>
              </ScrollArea>
            ) : (
              <div className="min-h-[100px] flex flex-col items-center justify-center text-center">
                 <AlertTriangle className="h-10 w-10 text-muted-foreground mb-2" />
                <p className="text-muted-foreground">No se pudieron agrupar productos. Asegúrate que los nombres siguen el patrón.</p>
              </div>
            )}
          </CardContent>
          <CardFooter className="border-t pt-6">
            <Button 
              onClick={handleStartProcessing} 
              disabled={photos.length === 0} // Initially disabled, will enable when ready for processing logic
              className="w-full md:w-auto"
            >
              Iniciar Procesamiento por Lotes ({photos.length} {photos.length === 1 ? 'imagen' : 'imágenes'})
            </Button>
          </CardFooter>
        </Card>
      )}
    </div>
  );
}
