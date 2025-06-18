
// src/app/(app)/batch/page.tsx
"use client";

import React, { useState, useCallback, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { UploadCloud, ListTree, AlertTriangle, CheckCircle, Loader2, XCircle, Layers } from "lucide-react";
import { ImageUploader } from "@/components/features/wizard/image-uploader";
import type { ProductPhoto } from '@/lib/types';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useToast } from '@/hooks/use-toast';
import { storage, db } from '@/lib/firebase'; // Firebase client SDK instances
import { ref as fbStorageRef, uploadBytesResumable, getDownloadURL } from 'firebase/storage';
import { doc, setDoc, serverTimestamp, collection, writeBatch } from 'firebase/firestore';

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
      description: `Enviando lote ${batchId} para procesamiento...`,
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
      
      setCurrentBatchId(batchId); // Keep batchId for display
      toast({
        title: "Procesamiento Backend Iniciado",
        description: result.message || `El lote ${batchId} se está procesando.`,
      });
      // Consider clearing photos or disabling upload button further
      // setPhotos([]); 
    } catch (error) {
      console.error("Error triggering backend processing:", error);
      const errorMessage = error instanceof Error ? error.message : "Error desconocido";
      toast({
        title: "Error al Iniciar Procesamiento Backend",
        description: errorMessage,
        variant: "destructive",
      });
      setIsBackendProcessing(false); // Ensure this is reset on error
    } 
    // Note: isBackendProcessing might stay true if successful, indicating the backend is working.
    // We need a separate mechanism (like polling /api/process-status) to know when it's truly done.
  };

  const handleStartUploads = async () => {
    if (photos.length === 0) {
      toast({ title: "No hay imágenes", description: "Por favor, sube algunas imágenes.", variant: "destructive" });
      return;
    }
    setIsUploading(true);
    setIsBackendProcessing(false); // Reset backend processing state
    setUploadProgress({});
    const newBatchId = `batch_${Date.now()}`;
    setCurrentBatchId(newBatchId); 

    const BATCH_SIZE = 5; 
    const firestoreBatch = writeBatch(db); 
    let firestoreWriteCount = 0;
    const userId = 'temp_user_id'; // TODO: Replace with actual authenticated user ID

    for (let i = 0; i < photos.length; i += BATCH_SIZE) {
      const photoChunk = photos.slice(i, i + BATCH_SIZE);
      
      toast({
          title: "Procesando Lote de Subida",
          description: `Subiendo imágenes ${i + 1} a ${Math.min(i + BATCH_SIZE, photos.length)} de ${photos.length}...`,
      });

      const uploadPromises = photoChunk.map(photo => {
        const storagePath = `user_uploads/${userId}/${newBatchId}/${photo.file.name}`;
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
                
                const photoDocRef = doc(collection(db, 'processing_status')); 
                firestoreBatch.set(photoDocRef, {
                  userId: userId,
                  batchId: newBatchId,
                  imageName: photo.file.name,
                  originalStoragePath: storagePath,
                  originalDownloadUrl: downloadURL,
                  status: "uploaded", // Initial status
                  uploadedAt: serverTimestamp(),
                  progress: 0, 
                  // Fields to be populated by backend:
                  // seoName: null, 
                  // processedImageStoragePath: null,
                  // processedImageDownloadUrl: null,
                  // resolutions: {}, // e.g., { "800x800": "url", "300x300": "url" }
                  // seoMetadata: {}, // e.g., { alt: "...", title: "..." }
                  // errorMessage: null,
                  // updatedAt: null,
                });
                firestoreWriteCount++;

                console.log(`Archivo ${photo.file.name} subido: ${downloadURL}`);
                setUploadProgress(prev => ({ ...prev, [photo.id]: 100 }));
                resolve();
              } catch (error) {
                console.error(`Error al obtener URL o guardar en Firestore para ${photo.file.name}:`, error);
                setUploadProgress(prev => ({ ...prev, [photo.id]: -1 }));
                toast({
                  title: `Error post-subida para ${photo.file.name}`,
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
    
    if (firestoreWriteCount > 0) {
      try {
        await firestoreBatch.commit();
        console.log(`${firestoreWriteCount} registros escritos en Firestore para el lote ${newBatchId}`);
      } catch (error) {
        console.error("Error al escribir en Firestore:", error);
        toast({
          title: "Error de Base de Datos",
          description: "No se pudieron guardar los detalles de las imágenes subidas.",
          variant: "destructive",
        });
        setIsUploading(false);
        return;
      }
    }

    const successfulUploadsCount = Object.values(uploadProgress).filter(p => p === 100).length;
    const totalAttempted = photos.length;
    setIsUploading(false); // Finished uploading phase

    if (totalAttempted > 0) {
        if (successfulUploadsCount === totalAttempted) {
            toast({
                title: "Subida Completa",
                description: `Se subieron ${successfulUploadsCount} imágenes. Iniciando procesamiento backend...`,
            });
            await triggerBackendProcessing(newBatchId);
        } else if (successfulUploadsCount > 0) {
            toast({
                title: "Subida Parcial",
                description: `Se subieron ${successfulUploadsCount} de ${totalAttempted} imágenes. Algunas subidas fallaron. ¿Deseas procesar las imágenes subidas correctamente?`,
                action: (
                  <Button onClick={() => triggerBackendProcessing(newBatchId)} size="sm">
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
    
    const productGroups: Record<string, { displayName: string; imageNames: string[]; photoObjects: ProductPhoto[] }> = {};
    photos.forEach(photo => {
      // More robust regex to capture base name before numerical suffix, allowing hyphens in name
      // e.g. Camiseta-Nike-Azul-S-1.jpg -> Camiseta-Nike-Azul-S
      const baseNamePartMatch = photo.name.match(/^(.*)-\d+\.(jpe?g)$/i);
      const productKey = baseNamePartMatch ? baseNamePartMatch[1] : photo.name.replace(/\.(jpe?g)$/i, '');
      
      if (!productGroups[productKey]) {
        const displayName = productKey.replace(/-/g, ' '); // Replace hyphens with spaces for display
        productGroups[productKey] = {
          displayName: displayName,
          imageNames: [],
          photoObjects: []
        };
      }
      productGroups[productKey].imageNames.push(photo.name);
      productGroups[productKey].photoObjects.push(photo);
    });
    return Object.entries(productGroups).map(([key, data]) => ({key, ...data}));
  };

  const detectedProducts = getDetectedProducts();
  const disableActions = isUploading || isBackendProcessing;

  return (
    <div className="container mx-auto py-8 space-y-8">
      <div>
        <h1 className="text-3xl font-bold tracking-tight text-foreground font-headline">Procesamiento de Productos en Lote</h1>
        <p className="text-muted-foreground">
          Sube múltiples imágenes JPG para crear varios productos.
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
                    <CardDescription>Por favor, espera mientras se suben tus imágenes y se registran.</CardDescription>
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
                       {uploadProgress[p.id] === undefined && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
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
              disabled={disableActions || photos.length === 0}
              className="w-full md:w-auto"
            >
              {(isUploading || isBackendProcessing) && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {!isUploading && !isBackendProcessing && <Layers className="mr-2 h-4 w-4" />}
              {isUploading && "Subiendo y Registrando..."}
              {isBackendProcessing && "Procesando en Backend..."}
              {!isUploading && !isBackendProcessing && `Iniciar Subida y Procesamiento (${photos.length} ${photos.length === 1 ? 'imagen' : 'imágenes'})`}
            </Button>
          </CardFooter>
        </Card>
      )}

      {isBackendProcessing && currentBatchId && !isUploading && ( 
        <Card>
            <CardHeader>
                <CardTitle>Procesamiento en Segundo Plano Activo</CardTitle>
                <CardDescription>
                    El lote <code className="font-code bg-muted px-1 py-0.5 rounded-sm">{currentBatchId}</code> se está procesando en el servidor. 
                    Puedes seguir usando la aplicación o cerrar esta ventana. El estado detallado se mostrará aquí cuando esté implementado.
                </CardDescription>
            </CardHeader>
            <CardContent className="text-center">
                <Loader2 className="h-12 w-12 text-primary animate-spin mx-auto" />
                <p className="mt-2 text-muted-foreground">Esperando la finalización del procesamiento...</p>
                <p className="text-xs text-muted-foreground mt-1">(La actualización de estado en tiempo real está pendiente)</p>
            </CardContent>
        </Card>
      )}
    </div>
  );
}
