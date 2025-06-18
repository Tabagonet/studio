
// src/app/(app)/batch/page.tsx
"use client";

import React, { useState, useCallback } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { UploadCloud, ListTree, AlertTriangle, CheckCircle, Loader2, XCircle, Layers } from "lucide-react";
import { ImageUploader } from "@/components/features/wizard/image-uploader";
import type { ProductPhoto } from '@/lib/types';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useToast } from '@/hooks/use-toast';
import { storage } from '@/lib/firebase'; // Firebase storage instance
import { ref as fbStorageRef, uploadBytesResumable, getDownloadURL } from 'firebase/storage';

export default function BatchProcessingPage() {
  const [photos, setPhotos] = useState<ProductPhoto[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const [isBackendProcessing, setIsBackendProcessing] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<Record<string, number>>({}); // photo.id -> percentage, -1 for error
  const { toast } = useToast();
  const [currentBatchId, setCurrentBatchId] = useState<string | null>(null);

  const handlePhotosChange = (newPhotos: ProductPhoto[]) => {
    setPhotos(newPhotos);
    setUploadProgress({}); 
  };

  const triggerBackendProcessing = async (batchId: string) => {
    setIsBackendProcessing(true);
    toast({
      title: "Iniciando Procesamiento Backend",
      description: `Enviando lote ${batchId} para procesamiento avanzado...`,
      duration: 5000,
    });

    try {
      const response = await fetch('/api/process-photos', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ batchId }),
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || `Error del servidor: ${response.status}`);
      }
      
      setCurrentBatchId(batchId); // Store batchId for potential status polling later
      toast({
        title: "Procesamiento Backend Iniciado",
        description: result.message || `El lote ${batchId} se está procesando.`,
      });
      // Here you might want to start polling for status or clear photos if desired
      // setPhotos([]); // Example: Clear photos after successfully initiating backend processing

    } catch (error) {
      console.error("Error triggering backend processing:", error);
      const errorMessage = error instanceof Error ? error.message : "Error desconocido";
      toast({
        title: "Error al Iniciar Procesamiento Backend",
        description: errorMessage,
        variant: "destructive",
      });
    } finally {
      setIsBackendProcessing(false);
    }
  };


  const handleStartUploads = async () => {
    if (photos.length === 0) {
      toast({ title: "No hay imágenes", description: "Por favor, sube algunas imágenes.", variant: "destructive" });
      return;
    }
    setIsUploading(true);
    setUploadProgress({});

    const batchId = Date.now().toString();
    const uploadedFileUrls: Record<string, string> = {}; 

    const BATCH_SIZE = 5;
    for (let i = 0; i < photos.length; i += BATCH_SIZE) {
      const photoBatch = photos.slice(i, i + BATCH_SIZE);
      
      toast({
          title: "Procesando Lote de Subida",
          description: `Subiendo imágenes ${i + 1} a ${Math.min(i + BATCH_SIZE, photos.length)} de ${photos.length}...`,
          duration: 3000,
      });

      const uploadPromises = photoBatch.map(photo => {
        // TODO: Replace 'temp_user_id' with actual authenticated user ID
        const storagePath = `user_uploads/temp_user_id/${batchId}/${photo.file.name}`;
        const storageRefInstance = fbStorageRef(storage, storagePath);

        return new Promise<void>((resolve, reject) => {
          const uploadTask = uploadBytesResumable(storageRefInstance, photo.file);

          uploadTask.on('state_changed',
            (snapshot) => {
              const progress = (snapshot.bytesTransferred / snapshot.totalBytes) * 100;
              setUploadProgress(prev => ({ ...prev, [photo.id]: Math.round(progress) }));
            },
            (error) => {
              console.error(`Error al subir ${photo.file.name}:`, error);
              setUploadProgress(prev => ({ ...prev, [photo.id]: -1 })); 
              toast({
                title: `Error al subir ${photo.file.name}`,
                description: error.message,
                variant: "destructive",
              });
              reject(error);
            },
            async () => {
              try {
                const downloadURL = await getDownloadURL(uploadTask.snapshot.ref);
                uploadedFileUrls[photo.id] = downloadURL;
                console.log(`Archivo ${photo.file.name} subido: ${downloadURL}`);
                // TODO: Update Firestore processing_status for this image (user_id, batch_id, image_name, status: "uploaded", url, timestamp)
                setUploadProgress(prev => ({ ...prev, [photo.id]: 100 }));
                resolve();
              } catch (error) {
                console.error(`Error al obtener URL de descarga para ${photo.file.name}:`, error);
                setUploadProgress(prev => ({ ...prev, [photo.id]: -1 }));
                toast({
                  title: `Error URL para ${photo.file.name}`,
                  description: (error as Error).message,
                  variant: "destructive",
                });
                reject(error);
              }
            }
          );
        });
      });

      try {
        await Promise.all(uploadPromises);
      } catch (error) {
        console.error("Al menos una subida falló en el lote:", error);
      }
    }
    
    const successfulUploadsCount = Object.values(uploadProgress).filter(p => p === 100).length;
    const totalAttempted = photos.length;
    setIsUploading(false);

    if (totalAttempted > 0) {
        if (successfulUploadsCount === totalAttempted) {
            toast({
                title: "Subida Completa",
                description: `Se subieron ${successfulUploadsCount} imágenes. Iniciando procesamiento backend...`,
            });
            await triggerBackendProcessing(batchId);
        } else if (successfulUploadsCount > 0) {
            toast({
                title: "Subida Parcial",
                description: `Se subieron ${successfulUploadsCount} de ${totalAttempted} imágenes. Algunas subidas fallaron. ¿Deseas procesar las imágenes subidas correctamente?`,
                variant: "default", // Could be 'warning' if available
                action: (
                  <Button onClick={() => triggerBackendProcessing(batchId)} size="sm">
                    Procesar Igualmente
                  </Button>
                ),
                duration: 10000,
            });
        } else {
             toast({
                title: "Subida Fallida",
                description: "No se pudo subir ninguna imagen. Por favor, revisa los errores e inténtalo de nuevo.",
                variant: "destructive",
            });
        }
    }
  };


  const getDetectedProducts = () => {
    if (photos.length === 0) return [];
    
    const productGroups: Record<string, { displayName: string; imageNames: string[] }> = {};
    photos.forEach(photo => {
      // Updated pattern: Camiseta-Nike-Azul-S-1.jpg -> baseNamePart = "Camiseta-Nike-Azul-S"
      const baseNamePartMatch = photo.name.match(/^(.+)-\d+\.(jpe?g)$/i);
      // If no match (e.g. "ProductoSimple-1.jpg"), use the part before "-NUMBER.ext"
      const productKey = baseNamePartMatch ? baseNamePartMatch[1] : photo.name.replace(/-\d+\.(jpe?g)$/i, '');
      
      if (!productGroups[productKey]) {
        // Simple display name: replace hyphens with spaces
        // Camiseta-Nike-Azul-S -> Camiseta Nike Azul S
        const displayName = productKey.replace(/-/g, ' ');
        productGroups[productKey] = {
          displayName: displayName,
          imageNames: []
        };
      }
      productGroups[productKey].imageNames.push(photo.name);
    });
    return Object.entries(productGroups).map(([key, data]) => ({key, ...data}));
  };

  const detectedProducts = getDetectedProducts();
  const isProcessing = isUploading || isBackendProcessing;

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
                Patrón de nombre: <code className="font-code">NombreProducto-IDENTIFICADORES-NUMERO.jpg</code>
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-6 md:p-8">
          <ImageUploader photos={photos} onPhotosChange={handlePhotosChange} maxFiles={50} maxSizeMB={2} />
        </CardContent>
      </Card>

      {isUploading && photos.length > 0 && (
        <Card className="shadow-lg rounded-lg">
          <CardHeader>
             <div className="flex items-center space-x-3">
                <Loader2 className="h-8 w-8 text-primary animate-spin" />
                <div>
                    <CardTitle>Subiendo Imágenes...</CardTitle>
                    <CardDescription>Por favor, espera mientras se suben tus imágenes.</CardDescription>
                </div>
            </div>
          </CardHeader>
          <CardContent>
            <ScrollArea className="h-48">
              <ul className="space-y-3">
                {photos.map(p => (
                  <li key={p.id} className="flex justify-between items-center p-2 border-b last:border-b-0">
                    <span className="text-sm truncate max-w-[60%]">{p.name}</span>
                    <div className="flex items-center space-x-2 w-[30%]">
                      {uploadProgress[p.id] === -1 && <XCircle className="h-5 w-5 text-destructive" />}
                      {uploadProgress[p.id] >= 0 && uploadProgress[p.id] < 100 && (
                        <Progress value={uploadProgress[p.id]} className="w-full h-2" />
                      )}
                      {uploadProgress[p.id] === 100 && <CheckCircle className="h-5 w-5 text-green-500" />}
                      {uploadProgress[p.id] !== undefined && uploadProgress[p.id] >= 0 && (
                         <span className="text-xs text-muted-foreground w-10 text-right">{`${uploadProgress[p.id]}%`}</span>
                      )}
                       {uploadProgress[p.id] === undefined && <Loader2 className="h-4 w-4 animate-spin" />}
                    </div>
                  </li>
                ))}
              </ul>
            </ScrollArea>
          </CardContent>
        </Card>
      )}


      {photos.length > 0 && !isUploading && (
        <Card className="shadow-lg rounded-lg">
          <CardHeader>
            <div className="flex items-center space-x-3">
              <ListTree className="h-8 w-8 text-primary" />
              <div>
                <CardTitle>Productos Detectados ({detectedProducts.length})</CardTitle>
                <CardDescription>
                  Revisa los productos agrupados. Estos grupos se usarán para crear productos o variantes.
                </CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            {detectedProducts.length > 0 ? (
              <ScrollArea className="h-72">
                <ul className="space-y-3">
                  {detectedProducts.map((productGroup) => (
                    <li key={productGroup.key} className="p-3 border rounded-md bg-background">
                      <p className="font-semibold text-foreground">{productGroup.displayName}</p>
                      <ul className="list-disc list-inside pl-4 text-sm text-muted-foreground">
                        {productGroup.imageNames.map(imgName => <li key={imgName}>{imgName}</li>)}
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
          <CardFooter className="border-t pt-6 flex justify-end">
            <Button 
              onClick={handleStartUploads} 
              disabled={isProcessing || photos.length === 0}
              className="w-full md:w-auto"
            >
              {isProcessing ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Layers className="mr-2 h-4 w-4" />}
              {isUploading && "Subiendo..."}
              {isBackendProcessing && "Procesando en Backend..."}
              {!isProcessing && `Iniciar Subida y Procesamiento (${photos.length} ${photos.length === 1 ? 'imagen' : 'imágenes'})`}
            </Button>
          </CardFooter>
        </Card>
      )}

      {isBackendProcessing && currentBatchId && (
        <Card>
            <CardHeader>
                <CardTitle>Procesamiento en Segundo Plano</CardTitle>
                <CardDescription>
                    El lote <code className="font-code bg-muted px-1 py-0.5 rounded-sm">{currentBatchId}</code> se está procesando en el servidor. 
                    Puedes seguir usando la aplicación o cerrar esta ventana. Te notificaremos cuando esté listo (funcionalidad de notificación pendiente).
                </CardDescription>
            </CardHeader>
            <CardContent className="text-center">
                <Loader2 className="h-12 w-12 text-primary animate-spin mx-auto" />
                <p className="mt-2 text-muted-foreground">Esperando la finalización del procesamiento...</p>
            </CardContent>
        </Card>
      )}

    </div>
  );
}
