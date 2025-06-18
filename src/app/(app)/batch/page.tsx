
// src/app/(app)/batch/page.tsx
"use client";

import React, { useState, useCallback, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { UploadCloud, ListTree, AlertTriangle, CheckCircle, Loader2, XCircle, Layers, Eye, FileText, Info } from "lucide-react";
import { ImageUploader } from "@/components/features/wizard/image-uploader";
import type { ProductPhoto, ProcessingStatusEntry, WizardProductContext, ProductType } from '@/lib/types';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useToast } from '@/hooks/use-toast';
import { db, auth } from '@/lib/firebase'; 
import { getIdToken } from 'firebase/auth';
import { doc, serverTimestamp, collection, writeBatch, query, where, onSnapshot, Unsubscribe, Timestamp } from 'firebase/firestore';
import { Badge } from '@/components/ui/badge';
import { useRouter } from 'next/navigation';

// Helper function to create a sanitized version of product name for SKU generation (if needed)
// This could be moved to a utils file if used elsewhere.
function cleanTextForSku(text: string): string {
  if (!text) return `prod-${Date.now().toString().slice(-5)}`;
  return text
    .toLowerCase()
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "") // Remove accents
    .replace(/\s+/g, '-') // Replace spaces with hyphens
    .replace(/[^\w-]+/g, '') // Remove non-alphanumeric characters (except hyphens and underscores)
    .replace(/-+/g, '-') // Replace multiple hyphens with a single one
    .replace(/^-+|-+$/g, '') // Trim hyphens from start/end
    .substring(0, 30); // Max length
}


export default function BatchProcessingPage() {
  const [photos, setPhotos] = useState<ProductPhoto[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const [isBackendProcessing, setIsBackendProcessing] = useState(true); 
  const [uploadProgress, setUploadProgress] = useState<Record<string, number>>({});
  const { toast } = useToast();
  const [currentBatchId, setCurrentBatchId] = useState<string | null>(null);
  const [batchPhotosStatus, setBatchPhotosStatus] = useState<ProcessingStatusEntry[]>([]);
  const router = useRouter();
  const [initialLoadComplete, setInitialLoadComplete] = useState(false);


  useEffect(() => {
    const searchParams = new URLSearchParams(window.location.search);
    const batchIdFromUrl = searchParams.get('batchId');
    if (batchIdFromUrl) {
      setCurrentBatchId(batchIdFromUrl);
      setIsBackendProcessing(true); 
      setInitialLoadComplete(false); 
    } else {
      setIsBackendProcessing(false); 
      setInitialLoadComplete(true);
    }
  }, []);

  useEffect(() => {
    if (!currentBatchId) {
      setBatchPhotosStatus([]);
      setIsBackendProcessing(false);
      setInitialLoadComplete(true);
      return;
    }

    setIsBackendProcessing(true);
    setInitialLoadComplete(false); 

    const q = query(collection(db, 'processing_status'), where('batchId', '==', currentBatchId));

    let firstSnapshot = true;
    const unsubscribe = onSnapshot(q, (querySnapshot) => {
      const statuses: ProcessingStatusEntry[] = [];
      querySnapshot.forEach((doc) => {
        statuses.push({ id: doc.id, ...doc.data() } as ProcessingStatusEntry);
      });

      const prevStatuses = batchPhotosStatus;
      setBatchPhotosStatus(statuses.sort((a, b) => (a.imageName || "").localeCompare(b.imageName || "")));

      const hasStatuses = statuses.length > 0;
      const allTerminated = hasStatuses && statuses.every(
        s => s.status === 'completed_image_pending_woocommerce' ||
             s.status === 'error_processing_image' ||
             s.status === 'completed_woocommerce_integration' ||
             s.status === 'error_woocommerce_integration'
      );

      if (allTerminated) {
        setIsBackendProcessing(false);
        if (!firstSnapshot &&
            prevStatuses.some(ps => !statuses.find(s => s.id === ps.id) || (statuses.find(s => s.id === ps.id)?.status !== ps.status)) &&
            statuses.some(s => s.status === 'completed_woocommerce_integration' || s.status === 'completed_image_pending_woocommerce')
           ) {
          const errors = statuses.filter(s => s.status === 'error_processing_image' || s.status === 'error_woocommerce_integration').length;
          const successes = statuses.length - errors;
          toast({
            title: `Procesamiento del Lote ${currentBatchId} Finalizado`,
            description: `${successes} imágenes procesadas exitosamente, ${errors} con errores. Revise los productos en WooCommerce.`,
            duration: 7000,
          });
        }
      } else if (hasStatuses) { 
        setIsBackendProcessing(true);
      } else { 
        // No statuses yet, but batch ID exists, so assume processing or about to process
        setIsBackendProcessing(true); 
      }

      if (firstSnapshot) {
        firstSnapshot = false;
        setInitialLoadComplete(true);
      }

    }, (error) => {
      console.error("Error escuchando cambios en el lote:", error);
      toast({
        title: "Error de Sincronización",
        description: "No se pudo obtener el estado del procesamiento en tiempo real.",
        variant: "destructive",
      });
      setIsBackendProcessing(false);
      setInitialLoadComplete(true);
    });

    return () => unsubscribe();

  }, [currentBatchId, toast]); // Removed batchPhotosStatus from dependencies as it caused loops


  const handlePhotosChange = (newPhotos: ProductPhoto[]) => {
    setPhotos(newPhotos);
    setUploadProgress({});
  };

  const getAuthToken = async (): Promise<string | null> => {
    const currentAuth = auth;
    if (currentAuth.currentUser) {
      try {
        return await getIdToken(currentAuth.currentUser);
      } catch (error) {
        console.error("Error getting auth token:", error);
        toast({
          title: "Error de Autenticación",
          description: "No se pudo obtener el token de autenticación. Por favor, intenta recargar la página.",
          variant: "destructive",
        });
        return null;
      }
    }
    toast({
        title: "Usuario No Autenticado",
        description: "Por favor, inicia sesión para continuar.",
        variant: "destructive",
    });
    return null;
  };

  const triggerBackendProcessing = async (batchId: string) => {
    setCurrentBatchId(batchId);
    setInitialLoadComplete(false);
    setIsBackendProcessing(true);

    const currentAuth = auth;
    if (!currentAuth.currentUser) {
      toast({ title: "Usuario No Autenticado", description: "Debes iniciar sesión para procesar imágenes.", variant: "destructive" });
      router.push('/login');
      return;
    }
    const userId = currentAuth.currentUser.uid;

    try {
      console.log(`[Batch Page] Triggering backend processing for batchId: ${batchId}, userId: ${userId}`);
      const response = await fetch('/api/process-photos', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ batchId, userId: userId }),
      });
      if (!response.ok) {
        let errorMessage = `Error del servidor al iniciar procesamiento: ${response.status} ${response.statusText}`;
        const responseText = await response.text(); // Get text first for better error reporting
        console.error("[Batch Page] Error response from /api/process-photos. Status:", response.status, "Body:", responseText.substring(0, 500));
        try {
            const errorData = JSON.parse(responseText);
            errorMessage = errorData.error || errorData.message || JSON.stringify(errorData);
        } catch (parseError) {
            // errorMessage is already good if responseText is not JSON
            errorMessage = `Server returned non-JSON error for process-photos. Status: ${response.status}. Body: ${responseText.substring(0,100)}...`;
        }
        toast({
          title: "Error Crítico al Iniciar Procesamiento",
          description: `No se pudo contactar al servidor para iniciar el procesamiento del lote ${batchId}. Detalles: ${errorMessage}`,
          variant: "destructive",
          duration: 10000,
        });
        throw new Error(errorMessage); 
      }
      const responseData = await response.json().catch(() => ({ message: "Respuesta no JSON del servidor al iniciar procesamiento."}));
      console.log(`[Batch Page] Backend processing successfully triggered for batchId: ${batchId}. Response status: ${response.status}. Data:`, responseData);
    } catch (error) {
      console.error("Error al notificar al backend para iniciar el procesamiento:", error);
      if (!(error instanceof Error && error.message.startsWith("Error del servidor al iniciar procesamiento"))) {
        toast({
            title: "Error de Red al Iniciar Procesamiento",
            description: `No se pudo contactar al servidor para el lote ${batchId}. Revisa tu conexión. Detalles: ${(error as Error).message}`,
            variant: "destructive",
            duration: 10000,
        });
      }
    }
  };

  const handleStartUploads = async () => {
    const productsToProcess = getDetectedProducts();
    if (productsToProcess.length === 0) {
      toast({ title: "No hay imágenes o productos detectados", description: "Por favor, sube algunas imágenes con el patrón de nombre correcto.", variant: "destructive" });
      return;
    }

    const currentAuth = auth;
    if (!currentAuth.currentUser) {
      toast({ title: "Usuario No Autenticado", description: "Debes iniciar sesión para subir imágenes.", variant: "destructive" });
      router.push('/login');
      return;
    }
    const userId = currentAuth.currentUser.uid;

    setIsUploading(true);
    setBatchPhotosStatus([]);
    setUploadProgress({}); // Reset progress for new batch
    const newBatchId = `batch_${Date.now()}`;

    const authToken = await getAuthToken();
    if (!authToken) {
        setIsUploading(false);
        return;
    }

    const firestoreBatch = writeBatch(db);
    let firestoreWriteCount = 0;
    let totalPhotosAttempted = 0;

    for (const productGroup of productsToProcess) {
      const productName = productGroup.displayName;
      const baseProductContext: WizardProductContext = {
        name: productName,
        sku: '', 
        productType: 'simple' as ProductType, 
        regularPrice: '', 
        salePrice: '',
        category: '', 
        keywords: productName.toLowerCase().replace(/-/g, ' '), 
        attributes: [], 
        shortDescription: '', 
        longDescription: '', 
        isPrimary: false,
      };

      for (let i = 0; i < productGroup.photoObjects.length; i++) {
        const photo = productGroup.photoObjects[i];
        totalPhotosAttempted++;
        setUploadProgress(prev => ({ ...prev, [photo.id]: 0 })); // Initialize progress for this photo

        const formData = new FormData();
        formData.append('imagen', photo.file);

        try {
          console.log(`[Batch Page] Attempting to upload ${photo.file.name} to /api/upload-image for batch ${newBatchId}`);
          const response = await fetch('/api/upload-image', {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${authToken}` },
            body: formData,
          });
          console.log(`[Batch Page] Response status from /api/upload-image for ${photo.file.name}: ${response.status}`);

          const responseText = await response.text(); // Get response as text first
          let result;

          if (!response.ok) {
            console.error(`[Batch Page] /api/upload-image for ${photo.file.name} returned status ${response.status}. Response text:`, responseText.substring(0, 500));
            let errorMessage = `Error al subir ${photo.file.name}: ${response.status} ${response.statusText}`;
            try {
              const errorData = JSON.parse(responseText); // Try to parse as JSON for more details
              errorMessage = errorData.error || errorData.message || JSON.stringify(errorData);
            } catch (parseError) {
              // Keep the original text if not JSON
              errorMessage = `Server returned non-JSON error for /api/upload-image. Status: ${response.status}. Body: ${responseText.substring(0,100)}...`;
            }
            throw new Error(errorMessage);
          }
          
          try {
            result = JSON.parse(responseText);
            console.log(`[Batch Page] Parsed JSON result from /api/upload-image for ${photo.file.name}:`, result);
          } catch (parseError) {
            console.error(`[Batch Page] Failed to parse JSON from /api/upload-image for ${photo.file.name}. Response text:`, responseText.substring(0, 500));
            throw new Error(`Respuesta no JSON de /api/upload-image para ${photo.file.name}.`);
          }
          
          if (result.success !== true || !result.url) {
              console.error(`[Batch Page] /api/upload-image for ${photo.file.name} did not return success:true or no URL. Result:`, result);
              throw new Error(result.error || `La subida de ${photo.file.name} al servidor externo no devolvió una URL o éxito.`);
          }
          const externalUrl = result.url;
          console.log(`[Batch Page] Successfully uploaded ${photo.file.name} to external server via /api/upload-image. External URL: ${externalUrl}`);

          const photoDocRef = doc(collection(db, 'processing_status'));
          const productContextForEntry: WizardProductContext = {
            ...baseProductContext,
            isPrimary: i === 0, 
          };
          
          console.log(`[Batch Page] Preparing to write to Firestore for ${photo.file.name}, batch ${newBatchId}, context:`, productContextForEntry);
          firestoreBatch.set(photoDocRef, {
            userId: userId,
            batchId: newBatchId,
            imageName: photo.file.name,
            originalStoragePath: externalUrl,
            originalDownloadUrl: externalUrl,
            status: "uploaded",
            uploadedAt: serverTimestamp() as Timestamp,
            progress: 0,
            productContext: productContextForEntry,
          } as Omit<ProcessingStatusEntry, 'id' | 'updatedAt'>);
          firestoreWriteCount++;

          setUploadProgress(prev => ({ ...prev, [photo.id]: 100 }));
          setPhotos(prevPhotos => prevPhotos.map(p => p.id === photo.id ? {...p, externalUrl: externalUrl} : p));

        } catch (error) {
          console.error(`[Batch Page] Error during upload or Firestore prep for ${photo.file.name}:`, error);
          setUploadProgress(prev => ({ ...prev, [photo.id]: -1 }));
          toast({
            title: `Error al subir ${photo.file.name}`,
            description: (error as Error).message,
            variant: "destructive",
            duration: 7000,
          });
        }
      }
    }


    if (firestoreWriteCount > 0) {
      try {
        console.log(`[Batch Page] Attempting to commit ${firestoreWriteCount} Firestore writes for batch ${newBatchId}.`);
        await firestoreBatch.commit();
        console.log(`[Batch Page] ${firestoreWriteCount} registros escritos en Firestore para el lote ${newBatchId} con productContext.`);
      } catch (error) {
        console.error("[Batch Page] Error al escribir lote en Firestore:", error);
        toast({
          title: "Error de Base de Datos",
          description: "No se pudieron guardar los detalles de las imágenes subidas en Firestore. El procesamiento del lote no continuará.",
          variant: "destructive",
          duration: 10000,
        });
        setIsUploading(false);
        return; // Stop if Firestore batch commit fails
      }
    }

    const successfulUploadsCount = Object.values(uploadProgress).filter(p => p === 100).length;
    console.log(`[Batch Page] Uploads complete. Total attempted: ${totalPhotosAttempted}, Successful external uploads (marked 100%): ${successfulUploadsCount}`);
    setIsUploading(false);

    if (totalPhotosAttempted > 0) {
        if (successfulUploadsCount === totalPhotosAttempted) {
            toast({
                title: "Subida a Servidor Externo Completa",
                description: `Se subieron ${successfulUploadsCount} imágenes. Iniciando procesamiento backend...`,
            });
            await triggerBackendProcessing(newBatchId);
        } else if (successfulUploadsCount > 0) {
            toast({
                title: "Subida Parcial",
                description: `Se subieron ${successfulUploadsCount} de ${totalPhotosAttempted} imágenes. Algunas subidas fallaron. ¿Deseas procesar las imágenes subidas correctamente?`,
                action: (
                  <Button onClick={() => triggerBackendProcessing(newBatchId)} size="sm">
                    Procesar Igualmente
                  </Button>
                ),
                duration: 10000,
            });
            // Allow user to decide, but also set up for viewing status
            setCurrentBatchId(newBatchId);
            setInitialLoadComplete(false);
            setIsBackendProcessing(true); // To show status card even if not auto-triggered
        } else { // successfulUploadsCount === 0
             toast({
                title: "Subida Fallida",
                description: "No se pudo subir ninguna imagen al servidor externo. Por favor, revisa los errores e inténtalo de nuevo.",
                variant: "destructive",
            });
        }
    } else {
        // No photos were attempted, e.g., user cleared photos after selection but before upload
        // Or getDetectedProducts() returned empty
        console.log("[Batch Page] No photos were attempted for upload.");
    }
  };

  const getDetectedProducts = () => {
    if (photos.length === 0) return [];

    const productGroups: Record<string, { displayName: string; imageNames: string[]; photoObjects: ProductPhoto[] }> = {};
    photos.forEach(photo => {
      const baseNamePartMatch = photo.name.match(/^(.*?)(?:-\d+)?\.(jpe?g|png|webp|gif)$/i);
      let productKey = photo.name.replace(/\.(jpe?g|png|webp|gif)$/i, ''); 
      
      if (baseNamePartMatch && baseNamePartMatch[1]) {
          productKey = baseNamePartMatch[1].replace(/-(\d+)$/, '');
      }


      if (!productGroups[productKey]) {
        const displayName = productKey.replace(/-/g, ' '); 
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

  const isBatchGenerallyProcessing = isBackendProcessing && (!initialLoadComplete || (batchPhotosStatus.length > 0 && !batchPhotosStatus.every(s => s.status.startsWith('completed') || s.status.startsWith('error'))));


  const getStatusBadgeVariant = (status: ProcessingStatusEntry['status']): "default" | "secondary" | "destructive" | "outline" => {
    if (status.startsWith('error')) return 'destructive';
    if (status.startsWith('completed')) return 'default'; // "default" is typically primary color
    if (status === 'uploaded' || status.startsWith('processing_image_')) return 'secondary';
    return 'outline';
  };

  const getStatusText = (status: ProcessingStatusEntry['status']): string => {
    const map: Record<ProcessingStatusEntry['status'], string> = {
        uploaded: "Subido, Pend. Proceso",
        processing_image_started: "Iniciando Proc. Imagen",
        processing_image_downloaded: "Descargando Imagen",
        processing_image_validated: "Validando Imagen",
        processing_image_optimized: "Optimizando Imagen",
        processing_image_seo_named: "Generando Nombre SEO",
        processing_image_metadata_generated: "Generando Metadatos",
        processing_image_rules_applied: "Aplicando Reglas",
        processing_image_reuploaded: "Subiendo Imagen Proc.",
        completed_image_pending_woocommerce: "Imagen Lista, Pend. Woo",
        error_processing_image: "Error Procesando Imagen",
        completed_woocommerce_integration: "Integrado con WooCommerce",
        error_woocommerce_integration: "Error Integración Woo"
    };
    return map[status] || status.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
  };

  const totalPhotosInBatch = batchPhotosStatus.length;
  const completedPhotosCount = batchPhotosStatus.filter(p => p.status === 'completed_image_pending_woocommerce' || p.status === 'completed_woocommerce_integration').length;
  const errorPhotosCount = batchPhotosStatus.filter(p => p.status.startsWith('error')).length;
  const overallProgress = totalPhotosInBatch > 0 ? ((completedPhotosCount + errorPhotosCount) / totalPhotosInBatch) * 100 : 0;

  return (
    <div className="container mx-auto py-8 space-y-8">
      <div>
        <h1 className="text-3xl font-bold tracking-tight text-foreground font-headline">Procesamiento de Productos en Lote (Servidor Externo)</h1>
        <p className="text-muted-foreground">
          Sube múltiples imágenes JPG para crear varios productos. Las imágenes se subirán a tu servidor externo (quefoto.es).
          El nombre del producto se inferirá del nombre del archivo antes del último guion y número (ej: <code className="bg-muted px-1 py-0.5 rounded-sm font-code">NombreProducto-ID-1.jpg</code> crea "NombreProducto").
        </p>
      </div>

      <Card className="shadow-xl rounded-lg">
        <CardHeader className="bg-muted/30 p-6 rounded-t-lg">
          <div className="flex items-center space-x-3">
            <UploadCloud className="h-8 w-8 text-primary" />
            <div>
              <CardTitle className="text-xl">Cargar Imágenes para Lote (Servidor Externo)</CardTitle>
              <CardDescription>
                Arrastra y suelta tus imágenes JPG o haz clic para seleccionarlas. Máximo 50 archivos, 2MB por archivo.
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
                    <CardTitle>Subiendo Imágenes a Servidor Externo...</CardTitle>
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


      {photos.length > 0 && !isUploading && !currentBatchId && (
        <Card className="shadow-lg rounded-lg">
          <CardHeader>
            <div className="flex items-center space-x-3">
              <ListTree className="h-8 w-8 text-primary" />
              <div>
                <CardTitle>Productos Detectados ({detectedProducts.length})</CardTitle>
                <CardDescription>
                  Revisa los productos agrupados. Cada grupo se intentará crear como un producto independiente en WooCommerce.
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
              disabled={isUploading || photos.length === 0 || detectedProducts.length === 0}
              className="w-full md:w-auto"
            >
              {isUploading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {!isUploading && <Layers className="mr-2 h-4 w-4" />}
              {isUploading ? "Subiendo y Registrando..." : `Iniciar Subida y Creación de ${detectedProducts.length} Producto(s)`}
            </Button>
          </CardFooter>
        </Card>
      )}

      {currentBatchId && (
        <Card className="shadow-lg rounded-lg">
            <CardHeader>
                <div className="flex items-center justify-between">
                    <div className="flex items-center space-x-3">
                        {isBatchGenerallyProcessing ? <Loader2 className="h-8 w-8 text-primary animate-spin" /> : <Eye className="h-8 w-8 text-primary"/>}
                        <div>
                            <CardTitle>Estado del Lote: <code className="font-code bg-muted px-1 py-0.5 rounded-sm">{currentBatchId}</code></CardTitle>
                            <CardDescription>
                                {isBatchGenerallyProcessing
                                    ? `Procesando ${totalPhotosInBatch > 0 ? totalPhotosInBatch : '...'} imágenes para los productos del lote... (${completedPhotosCount} completadas, ${errorPhotosCount} errores)`
                                    : batchPhotosStatus.length > 0
                                        ? `Procesamiento del lote finalizado. ${completedPhotosCount} imágenes procesadas, ${errorPhotosCount} con errores.`
                                        : "Esperando información del lote..."
                                }
                            </CardDescription>
                        </div>
                    </div>
                    {isBatchGenerallyProcessing && totalPhotosInBatch > 0 && (
                         <Progress value={overallProgress} className="w-1/4 h-3" />
                    )}
                </div>
            </CardHeader>
            <CardContent>
                {!initialLoadComplete && isBackendProcessing ? (
                     <div className="min-h-[100px] flex flex-col items-center justify-center text-center">
                        <Loader2 className="h-12 w-12 text-primary animate-spin mx-auto mb-2" />
                        <p className="text-muted-foreground">Cargando información del lote...</p>
                    </div>
                ) : batchPhotosStatus.length > 0 ? (
                    <ScrollArea className="h-96">
                        <ul className="space-y-2">
                            {batchPhotosStatus.map(photoStatus => (
                                <li key={photoStatus.id} className="p-3 border rounded-md bg-background flex items-center justify-between hover:bg-muted/50 transition-colors">
                                    <div className="flex-1 min-w-0">
                                        <div className="flex items-center space-x-2">
                                            <FileText className="h-5 w-5 text-muted-foreground flex-shrink-0"/>
                                            <p className="text-sm font-medium text-foreground truncate" title={photoStatus.imageName}>{photoStatus.imageName}</p>
                                            {photoStatus.productContext?.name && (
                                              <Badge variant="outline" className="text-xs ml-1">Producto: {photoStatus.productContext.name}</Badge>
                                            )}
                                        </div>
                                        {photoStatus.status.startsWith('error') && photoStatus.errorMessage && (
                                            <p className="text-xs text-destructive truncate" title={photoStatus.errorMessage}><Info className="inline h-3 w-3 mr-1"/>{photoStatus.errorMessage}</p>
                                        )}
                                    </div>
                                    <div className="flex items-center space-x-3 ml-4 flex-shrink-0">
                                        <Badge variant={getStatusBadgeVariant(photoStatus.status)} className="text-xs w-40 text-center justify-center">
                                            {getStatusText(photoStatus.status)}
                                        </Badge>
                                        <div className="w-24">
                                          {photoStatus.status.startsWith('processing_') || (photoStatus.status === 'uploaded' && isBatchGenerallyProcessing) ? (
                                              <Progress value={photoStatus.progress || 0} className="h-2" />
                                          ) : photoStatus.status.startsWith('completed') ? (
                                              <CheckCircle className="h-5 w-5 text-green-500" />
                                          ) : photoStatus.status.startsWith('error') ? (
                                              <XCircle className="h-5 w-5 text-destructive" />
                                          ) : (
                                            batchPhotosStatus.length > 0 ? <span className="text-xs text-muted-foreground">Pendiente</span> : null
                                          )}
                                        </div>
                                    </div>
                                </li>
                            ))}
                        </ul>
                    </ScrollArea>
                ) : (
                     <div className="min-h-[100px] flex flex-col items-center justify-center text-center">
                        <AlertTriangle className="h-10 w-10 text-muted-foreground mb-2" />
                        <p className="text-muted-foreground">No hay detalles de procesamiento para este lote o el lote no se inició correctamente.</p>
                         <p className="text-xs text-muted-foreground">Si acabas de iniciar el lote, espera unos momentos.</p>
                    </div>
                )}
            </CardContent>
             <CardFooter className="border-t pt-4 flex justify-end">
                <Button
                    onClick={() => { setCurrentBatchId(null); setPhotos([]); setUploadProgress({}); router.replace('/batch');}}
                    variant="outline"
                    disabled={isBatchGenerallyProcessing && batchPhotosStatus.length > 0}
                >
                    Procesar Otro Lote
                </Button>
            </CardFooter>
        </Card>
      )}
    </div>
  );
}


    