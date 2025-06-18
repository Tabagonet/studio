
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

function cleanTextForSku(text: string): string {
  if (!text) return `prod-${Date.now().toString().slice(-5)}`;
  return text
    .toLowerCase()
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "") 
    .replace(/\s+/g, '-') 
    .replace(/[^\w-]+/g, '') 
    .replace(/-+/g, '-') 
    .replace(/^-+|-+$/g, '') 
    .substring(0, 30); 
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
          const errors = statuses.filter(s => s.status.startsWith('error_')).length;
          const successes = statuses.length - errors;
          toast({
            title: `Procesamiento del Lote ${currentBatchId} Finalizado`,
            description: `${successes} productos/imágenes procesados exitosamente, ${errors} con errores.`,
            duration: 7000,
          });
        }
      } else if (hasStatuses) { 
        setIsBackendProcessing(true);
      } else { 
        setIsBackendProcessing(true); 
      }

      if (firstSnapshot) {
        firstSnapshot = false;
        setInitialLoadComplete(true);
      }

    }, (error) => {
      console.error("Error escuchando cambios en el lote:", error);
      toast({ title: "Error de Sincronización", variant: "destructive" });
      setIsBackendProcessing(false);
      setInitialLoadComplete(true);
    });

    return () => unsubscribe();
  }, [currentBatchId, toast]);


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
        toast({ title: "Error de Autenticación", variant: "destructive" });
        return null;
      }
    }
    toast({ title: "Usuario No Autenticado", variant: "destructive" });
    return null;
  };

  const triggerBackendProcessing = async (batchId: string) => {
    setCurrentBatchId(batchId);
    setInitialLoadComplete(false);
    setIsBackendProcessing(true);

    const currentAuth = auth;
    if (!currentAuth.currentUser) {
      toast({ title: "Usuario No Autenticado", variant: "destructive" });
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
      const responseText = await response.text(); 
      let responseData;
      try {
          responseData = JSON.parse(responseText);
      } catch(e){
          console.error("[Batch Page] Non-JSON response from /api/process-photos on trigger. Status:", response.status, "Body:", responseText.substring(0, 500));
          throw new Error(`Server returned non-JSON error for process-photos trigger. Status: ${response.status}. Body: ${responseText.substring(0,100)}...`);
      }

      if (!response.ok) {
        console.error("[Batch Page] Error response from /api/process-photos trigger. Status:", response.status, "Data:", responseData);
        const errorMessage = responseData.error || responseData.message || JSON.stringify(responseData);
        toast({
          title: "Error al Iniciar Procesamiento Backend",
          description: `No se pudo iniciar el procesamiento del lote ${batchId}. Detalles: ${errorMessage}`,
          variant: "destructive",
          duration: 10000,
        });
        throw new Error(errorMessage); 
      }
      console.log(`[Batch Page] Backend processing successfully triggered for batchId: ${batchId}. Response:`, responseData);
    } catch (error) {
      console.error("Error al notificar al backend para iniciar el procesamiento:", error);
       if (!(error instanceof Error && (error.message.startsWith("Error del servidor al iniciar procesamiento") || error.message.startsWith("Server returned non-JSON")))) {
        toast({
            title: "Error de Red al Iniciar Procesamiento",
            description: `No se pudo contactar al servidor para el lote ${batchId}. Detalles: ${(error as Error).message}`,
            variant: "destructive",
            duration: 10000,
        });
      }
    }
  };

  const handleStartUploads = async () => {
    const productsToProcess = getDetectedProducts();
    if (productsToProcess.length === 0) {
      toast({ title: "No hay imágenes o productos detectados", variant: "destructive" });
      return;
    }

    const currentAuth = auth;
    if (!currentAuth.currentUser) {
      toast({ title: "Usuario No Autenticado", variant: "destructive" });
      router.push('/login');
      return;
    }
    const userId = currentAuth.currentUser.uid;

    setIsUploading(true);
    setBatchPhotosStatus([]);
    setUploadProgress({}); 
    const newBatchId = `batch_${Date.now()}`;

    const authToken = await getAuthToken();
    if (!authToken) {
        setIsUploading(false);
        return;
    }

    const firestoreBatch = writeBatch(db);
    let firestoreWriteCount = 0;
    let totalPhotosAttempted = 0;

    // Phase 1: Upload all photos to local server via /api/upload-image-local
    const photoUploadResults: Record<string, { success: boolean; relativePath?: string; error?: string }> = {};

    for (const productGroup of productsToProcess) {
      for (const photo of productGroup.photoObjects) {
        totalPhotosAttempted++;
        setUploadProgress(prev => ({ ...prev, [photo.id]: 0 })); 

        const formData = new FormData();
        formData.append('file', photo.file);
        formData.append('batchId', newBatchId);
        formData.append('fileName', photo.name);

        try {
          console.log(`[Batch Page] Uploading ${photo.file.name} to /api/upload-image-local for batch ${newBatchId}`);
          const response = await fetch('/api/upload-image-local', { // Use new local upload endpoint
            method: 'POST',
            headers: { 'Authorization': `Bearer ${authToken}` },
            body: formData,
          });
          
          const responseText = await response.text();
          let result;
          try {
            result = JSON.parse(responseText);
          } catch (parseError) {
            console.error(`[Batch Page] Failed to parse JSON from /api/upload-image-local for ${photo.file.name}. Response text:`, responseText.substring(0, 500));
            throw new Error(`Respuesta no JSON de /api/upload-image-local para ${photo.file.name}.`);
          }

          if (!response.ok || result.success !== true || !result.relativePath) {
            console.error(`[Batch Page] /api/upload-image-local for ${photo.file.name} failed or invalid response. Status: ${response.status}, Result:`, result);
            throw new Error(result.error || `La subida local de ${photo.file.name} falló.`);
          }
          
          photoUploadResults[photo.id] = { success: true, relativePath: result.relativePath };
          setUploadProgress(prev => ({ ...prev, [photo.id]: 100 }));
          // Update photo in state with its new localPath (relativePath from server's public dir)
           setPhotos(prevPhotos => prevPhotos.map(p => p.id === photo.id ? {...p, localPath: result.relativePath} : p));


        } catch (error) {
          console.error(`[Batch Page] Error during local upload for ${photo.file.name}:`, error);
          photoUploadResults[photo.id] = { success: false, error: (error as Error).message };
          setUploadProgress(prev => ({ ...prev, [photo.id]: -1 }));
          toast({ title: `Error al subir ${photo.file.name}`, description: (error as Error).message, variant: "destructive" });
        }
      }
    }
    
    // Phase 2: Register successfully uploaded photos in Firestore
    for (const productGroup of productsToProcess) {
      const productName = productGroup.displayName;
      const baseProductContext: Omit<WizardProductContext, 'isPrimary' | 'sku' | 'regularPrice' | 'salePrice' | 'category' | 'keywords' | 'shortDescription' | 'longDescription' | 'attributes' > & Partial<WizardProductContext> = {
        name: productName,
        productType: 'simple' as ProductType, 
        // SKU, prices, category, keywords, descriptions, attributes will be generated by AI/templates in backend
        // or remain empty if not generated.
        sku: cleanTextForSku(productName), // Provide a basic SKU
        keywords: productName.toLowerCase().replace(/-/g, ' '), // Basic keywords from name
      };

      for (let i = 0; i < productGroup.photoObjects.length; i++) {
        const photo = productGroup.photoObjects[i];
        const uploadResult = photoUploadResults[photo.id];

        if (uploadResult && uploadResult.success && uploadResult.relativePath) {
          const photoDocRef = doc(collection(db, 'processing_status'));
          const productContextForEntry: WizardProductContext = {
            ...baseProductContext,
            name: productName, // ensure name is set
            productType: 'simple', // default for batch
            isPrimary: i === 0, 
            regularPrice: '', // To be set by AI or rules if any
            salePrice: '',
            category: '',
            attributes: [],
            shortDescription: '',
            longDescription: '',
          };
          
          console.log(`[Batch Page] Preparing to write to Firestore for ${photo.file.name}, batch ${newBatchId}, relativePath: ${uploadResult.relativePath}`);
          firestoreBatch.set(photoDocRef, {
            userId: userId,
            batchId: newBatchId,
            imageName: photo.file.name, // Original filename
            originalStoragePath: uploadResult.relativePath, // Path on local server (relative to public)
            originalDownloadUrl: uploadResult.relativePath, // Path on local server (relative to public)
            status: "uploaded",
            uploadedAt: serverTimestamp() as Timestamp,
            progress: 0,
            productContext: productContextForEntry,
          } as Omit<ProcessingStatusEntry, 'id' | 'updatedAt'>);
          firestoreWriteCount++;
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
        toast({ title: "Error de Base de Datos", description: "No se pudieron guardar los detalles.", variant: "destructive", duration: 10000 });
        setIsUploading(false);
        return; 
      }
    }

    const successfulUploadsCount = Object.values(photoUploadResults).filter(r => r.success).length;
    console.log(`[Batch Page] Local uploads complete. Total attempted: ${totalPhotosAttempted}, Successful local uploads: ${successfulUploadsCount}`);
    setIsUploading(false);

    if (totalPhotosAttempted > 0) {
        if (successfulUploadsCount === totalPhotosAttempted) {
            toast({ title: "Subida a Servidor Local Completa", description: `Se subieron ${successfulUploadsCount} imágenes. Iniciando procesamiento backend...` });
            await triggerBackendProcessing(newBatchId);
        } else if (successfulUploadsCount > 0) {
            toast({
                title: "Subida Parcial a Servidor Local",
                description: `Se subieron ${successfulUploadsCount} de ${totalPhotosAttempted} imágenes. Algunas subidas fallaron. ¿Deseas procesar las imágenes subidas correctamente?`,
                action: ( <Button onClick={() => triggerBackendProcessing(newBatchId)} size="sm"> Procesar Igualmente </Button> ),
                duration: 10000,
            });
            setCurrentBatchId(newBatchId);
            setInitialLoadComplete(false);
            setIsBackendProcessing(true); 
        } else { 
             toast({ title: "Subida Fallida", description: "No se pudo subir ninguna imagen al servidor local. Revisa errores.", variant: "destructive" });
        }
    } else {
        console.log("[Batch Page] No photos were attempted for upload.");
    }
  };

  const getDetectedProducts = () => {
    if (photos.length === 0) return [];
    const productGroups: Record<string, { displayName: string; imageNames: string[]; photoObjects: ProductPhoto[] }> = {};
    
    photos.forEach(photo => {
      // Improved regex to better capture product name before typical suffixes like -1, -01, -Copy, etc.
      const baseNameMatch = photo.name.match(/^(.*?)(?:[-_](?:\d+|[cC]opy\d*|[vV]ariation\d*|[pP]rimary|[sS]econdary))*\.(jpe?g|png|webp|gif)$/i);
      let productKey = baseNameMatch && baseNameMatch[1] ? baseNameMatch[1] : photo.name.replace(/\.(jpe?g|png|webp|gif)$/i, '');
      productKey = productKey.replace(/[-_]$/, ''); // Remove trailing hyphen or underscore if any

      if (!productGroups[productKey]) {
        const displayName = productKey.replace(/-/g, ' ').replace(/_/g, ' '); 
        productGroups[productKey] = { displayName, imageNames: [], photoObjects: [] };
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
    if (status.startsWith('completed')) return 'default'; 
    if (status === 'uploaded' || status.startsWith('processing_image_')) return 'secondary';
    return 'outline';
  };

  const getStatusText = (status: ProcessingStatusEntry['status']): string => {
    const map: Partial<Record<ProcessingStatusEntry['status'], string>> = { // Made partial for new statuses
        uploaded: "Subido, Pend. Proceso",
        processing_image_started: "Iniciando Proc. Imagen",
        processing_image_name_parsed: "Analizando Nombre Archivo",
        processing_image_classified: "Clasificando Imagen (IA)",
        processing_image_content_generated: "Generando Contenido (IA)",
        processing_image_downloaded: "Cargando Imagen Local", // Changed meaning
        processing_image_validated: "Validando Imagen",
        processing_image_optimized: "Optimizando Imagen",
        processing_image_seo_named: "Generando Nombre SEO",
        processing_image_metadata_generated: "Generando Metadatos",
        processing_image_rules_applied: "Aplicando Reglas",
        processing_image_reuploaded: "Subiendo a WooCommerce", // Changed meaning
        completed_image_pending_woocommerce: "Imagen Lista, Pend. Woo",
        error_processing_image: "Error Procesando Imagen",
        completed_woocommerce_integration: "Integrado con WooCommerce",
        error_woocommerce_integration: "Error Integración Woo"
    };
    return map[status] || status.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
  };

  const totalPhotosInBatch = batchPhotosStatus.length;
  const completedPhotosCount = batchPhotosStatus.filter(p => p.status === 'completed_woocommerce_integration').length;
  const errorPhotosCount = batchPhotosStatus.filter(p => p.status.startsWith('error')).length;
  const overallProgress = totalPhotosInBatch > 0 ? ((batchPhotosStatus.reduce((acc,p) => acc + (p.progress || 0), 0) / totalPhotosInBatch)) : 0;


  return (
    <div className="container mx-auto py-8 space-y-8">
      <div>
        <h1 className="text-3xl font-bold tracking-tight text-foreground font-headline">Procesamiento de Productos en Lote (Local)</h1>
        <p className="text-muted-foreground">
          Sube imágenes para crear productos. Se guardarán localmente, procesarán con IA local y luego se enviarán a WooCommerce.
          Patrón nombre: <code className="bg-muted px-1 py-0.5 rounded-sm font-code">NombreProducto-ID.jpg</code>
        </p>
      </div>

      <Card className="shadow-xl rounded-lg">
        <CardHeader className="bg-muted/30 p-6 rounded-t-lg">
          <div className="flex items-center space-x-3"> <UploadCloud className="h-8 w-8 text-primary" />
            <div> <CardTitle className="text-xl">Cargar Imágenes para Lote (Local)</CardTitle>
              <CardDescription> Arrastra y suelta imágenes o haz clic. Máx 50 archivos, 5MB c/u. </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-6 md:p-8">
          <ImageUploader photos={photos} onPhotosChange={handlePhotosChange} maxFiles={50} />
        </CardContent>
      </Card>

      {isUploading && photos.length > 0 && (
        <Card className="shadow-lg rounded-lg">
          <CardHeader>
             <div className="flex items-center space-x-3"> <Loader2 className="h-8 w-8 text-primary animate-spin" />
                <div> <CardTitle>Subiendo Imágenes a Servidor Local...</CardTitle>
                    <CardDescription>Espera mientras se suben y registran tus imágenes.</CardDescription>
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
            <div className="flex items-center space-x-3"> <ListTree className="h-8 w-8 text-primary" />
              <div> <CardTitle>Productos Detectados ({detectedProducts.length})</CardTitle>
                <CardDescription> Revisa los productos agrupados. Cada grupo se creará como un producto. </CardDescription>
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
                <p className="text-muted-foreground">No se pudieron agrupar productos. Revisa patrón de nombres.</p>
              </div>
            )}
          </CardContent>
          <CardFooter className="border-t pt-6 flex justify-end">
            <Button onClick={handleStartUploads} disabled={isUploading || photos.length === 0 || detectedProducts.length === 0} className="w-full md:w-auto">
              {isUploading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {!isUploading && <Layers className="mr-2 h-4 w-4" />}
              {isUploading ? "Subiendo y Registrando..." : `Iniciar Creación de ${detectedProducts.length} Producto(s)`}
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
                                    ? `Procesando ${totalPhotosInBatch > 0 ? totalPhotosInBatch : '...'} imágenes para los productos del lote... (${completedPhotosCount} completados, ${errorPhotosCount} errores)`
                                    : batchPhotosStatus.length > 0
                                        ? `Procesamiento del lote finalizado. ${completedPhotosCount} productos integrados, ${errorPhotosCount} con errores.`
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
                                          {photoStatus.progress !== undefined && photoStatus.progress < 100 && (photoStatus.status.startsWith('processing_') || (photoStatus.status === 'uploaded' && isBatchGenerallyProcessing)) ? (
                                              <Progress value={photoStatus.progress} className="h-2" />
                                          ) : photoStatus.status.startsWith('completed') ? (
                                              <CheckCircle className="h-5 w-5 text-green-500" />
                                          ) : photoStatus.status.startsWith('error') ? (
                                              <XCircle className="h-5 w-5 text-destructive" />
                                          ) : (
                                            batchPhotosStatus.length > 0 && initialLoadComplete ? <span className="text-xs text-muted-foreground">Pendiente</span> : null
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
                        <p className="text-muted-foreground">No hay detalles de procesamiento para este lote o no se inició.</p>
                         <p className="text-xs text-muted-foreground">Si acabas de iniciar el lote, espera unos momentos.</p>
                    </div>
                )}
            </CardContent>
             <CardFooter className="border-t pt-4 flex justify-end">
                <Button onClick={() => { setCurrentBatchId(null); setPhotos([]); setUploadProgress({}); router.replace('/batch');}} variant="outline" disabled={isBatchGenerallyProcessing && batchPhotosStatus.length > 0 && batchPhotosStatus.some(s=>s.progress < 100 && !s.status.startsWith('error')) }>
                    Procesar Otro Lote
                </Button>
            </CardFooter>
        </Card>
      )}
    </div>
  );
}
