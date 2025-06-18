
// src/app/(app)/batch/page.tsx
"use client";

import React, { useState, useCallback, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { UploadCloud, ListTree, AlertTriangle, CheckCircle, Loader2, XCircle, Layers, Eye, FileText, Info } from "lucide-react";
import { ImageUploader } from "@/components/features/wizard/image-uploader";
import type { ProductPhoto, ProcessingStatusEntry } from '@/lib/types';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useToast } from '@/hooks/use-toast';
import { app, db } from '@/lib/firebase'; // Firebase client SDK, import app
import { getAuth, getIdToken } from 'firebase/auth'; // Firebase client auth
import { doc, setDoc, serverTimestamp, collection, writeBatch, query, where, onSnapshot, Unsubscribe, Timestamp } from 'firebase/firestore';
import { Badge } from '@/components/ui/badge';

export default function BatchProcessingPage() {
  const [photos, setPhotos] = useState<ProductPhoto[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const [isBackendProcessing, setIsBackendProcessing] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<Record<string, number>>({});
  const { toast } = useToast();
  const [currentBatchId, setCurrentBatchId] = useState<string | null>(null);
  const [batchPhotosStatus, setBatchPhotosStatus] = useState<ProcessingStatusEntry[]>([]);

  useEffect(() => {
    const searchParams = new URLSearchParams(window.location.search);
    const batchIdFromUrl = searchParams.get('batchId');
    if (batchIdFromUrl) {
      setCurrentBatchId(batchIdFromUrl);
    }
  }, []);

  useEffect(() => {
    if (!currentBatchId) {
      setBatchPhotosStatus([]);
      return;
    }

    setIsBackendProcessing(true);

    const q = query(collection(db, 'processing_status'), where('batchId', '==', currentBatchId));
    
    const unsubscribe = onSnapshot(q, (querySnapshot) => {
      const statuses: ProcessingStatusEntry[] = [];
      querySnapshot.forEach((doc) => {
        statuses.push({ id: doc.id, ...doc.data() } as ProcessingStatusEntry);
      });
      setBatchPhotosStatus(statuses.sort((a, b) => (a.imageName || "").localeCompare(b.imageName || "")));

      const allProcessed = statuses.length > 0 && statuses.every(
        s => s.status === 'completed_image_pending_woocommerce' || s.status === 'error_processing_image' || s.status === 'completed_woocommerce_integration' || s.status === 'error_woocommerce_integration'
      );

      if (allProcessed) {
        setIsBackendProcessing(false);
        const errors = statuses.filter(s => s.status === 'error_processing_image' || s.status === 'error_woocommerce_integration').length;
        const successes = statuses.length - errors;
        toast({
          title: `Procesamiento del Lote ${currentBatchId} Finalizado`,
          description: `${successes} imágenes procesadas exitosamente, ${errors} con errores.`,
          duration: 7000,
        });
      } else if (statuses.length > 0) {
        setIsBackendProcessing(true);
      }

    }, (error) => {
      console.error("Error escuchando cambios en el lote:", error);
      toast({
        title: "Error de Sincronización",
        description: "No se pudo obtener el estado del procesamiento en tiempo real.",
        variant: "destructive",
      });
      setIsBackendProcessing(false);
    });

    return () => unsubscribe();

  }, [currentBatchId, toast]);


  const handlePhotosChange = (newPhotos: ProductPhoto[]) => {
    setPhotos(newPhotos);
    setUploadProgress({});
  };

  const getAuthToken = async (): Promise<string | null> => {
    const auth = getAuth(app); // Use specific app instance
    if (auth.currentUser) {
      try {
        return await getIdToken(auth.currentUser);
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
    
    toast({
      title: "Iniciando Monitoreo de Procesamiento Backend",
      description: `Escuchando actualizaciones para el lote ${batchId}...`,
    });
    
    const auth = getAuth(app); // Use specific app instance
    const userId = auth.currentUser ? auth.currentUser.uid : 'temp_user_id_fallback';


    try {
      const response = await fetch('/api/process-photos', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ batchId, userId: userId }),
      });
      if (!response.ok) {
        let errorMessage = `Error del servidor: ${response.status} ${response.statusText}`;
        const responseText = await response.text();
        try {
            const errorData = JSON.parse(responseText);
            errorMessage = errorData.error || errorData.message || JSON.stringify(errorData);
        } catch (parseError) {
            errorMessage = `Server returned non-JSON error for process-photos. Status: ${response.status}. Body: ${responseText.substring(0,100)}...`;
            console.error("Non-JSON error response from /api/process-photos:", responseText);
        }
        throw new Error(errorMessage);
      }
      // const result = await response.json(); // Not strictly needed here unless we use result.message
    } catch (error) {
      console.error("Error al notificar al backend (puede continuar igualmente):", error);
      // No toast here as it might be confusing if processing still starts
    }
  };

  const handleStartUploads = async () => {
    if (photos.length === 0) {
      toast({ title: "No hay imágenes", description: "Por favor, sube algunas imágenes.", variant: "destructive" });
      return;
    }
    setIsUploading(true);
    setIsBackendProcessing(false); 
    setBatchPhotosStatus([]);
    setUploadProgress({});
    const newBatchId = `batch_${Date.now()}`;
    
    const auth = getAuth(app); // Use specific app instance
    const userId = auth.currentUser ? auth.currentUser.uid : 'temp_user_id_fallback';

    const authToken = await getAuthToken();
    if (!authToken) {
        setIsUploading(false);
        return;
    }

    const firestoreBatch = writeBatch(db); 
    let firestoreWriteCount = 0;

    for (let i = 0; i < photos.length; i++) {
      const photo = photos[i];
      setUploadProgress(prev => ({ ...prev, [photo.id]: 0 }));

      const formData = new FormData();
      formData.append('imagen', photo.file); 

      try {
        const response = await fetch('/api/upload-image', { 
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${authToken}`,
          },
          body: formData,
        });

        if (!response.ok) {
          let errorMessage = `Error al subir ${photo.file.name}: ${response.status} ${response.statusText}`;
          const responseText = await response.text();
          try {
            const errorData = JSON.parse(responseText);
            errorMessage = errorData.error || errorData.message || JSON.stringify(errorData);
          } catch (parseError) {
            errorMessage = `Server returned non-JSON error for /api/upload-image. Status: ${response.status}. Body: ${responseText.substring(0,100)}...`;
            console.error("Non-JSON error response from /api/upload-image:", responseText);
          }
          throw new Error(errorMessage);
        }

        const result = await response.json();
        if (!result.success || !result.url) {
            throw new Error(result.error || `La subida de ${photo.file.name} al servidor externo no devolvió una URL.`);
        }
        const externalUrl = result.url;

        const photoDocRef = doc(collection(db, 'processing_status')); 
        firestoreBatch.set(photoDocRef, {
          userId: userId,
          batchId: newBatchId,
          imageName: photo.file.name,
          originalStoragePath: externalUrl, 
          originalDownloadUrl: externalUrl, 
          status: "uploaded", 
          uploadedAt: serverTimestamp() as Timestamp,
          progress: 0, 
        } as Omit<ProcessingStatusEntry, 'id' | 'updatedAt'>);
        firestoreWriteCount++;

        setUploadProgress(prev => ({ ...prev, [photo.id]: 100 }));
        
        setPhotos(prevPhotos => prevPhotos.map(p => p.id === photo.id ? {...p, externalUrl: externalUrl} : p));


      } catch (error) {
        console.error(`Error al subir ${photo.file.name}:`, error);
        setUploadProgress(prev => ({ ...prev, [photo.id]: -1 })); 
        toast({
          title: `Error al subir ${photo.file.name}`,
          description: (error as Error).message,
          variant: "destructive",
        });
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
    setIsUploading(false); 

    if (totalAttempted > 0) {
        if (successfulUploadsCount === totalAttempted) {
            toast({
                title: "Subida a Servidor Externo Completa",
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
            setCurrentBatchId(newBatchId);
        } else {
             toast({
                title: "Subida Fallida",
                description: "No se pudo subir ninguna imagen al servidor externo. Por favor, revisa los errores e inténtalo de nuevo.",
                variant: "destructive",
            });
        }
    }
  };

  const getDetectedProducts = () => {
    if (photos.length === 0) return [];
    
    const productGroups: Record<string, { displayName: string; imageNames: string[]; photoObjects: ProductPhoto[] }> = {};
    photos.forEach(photo => {
      const baseNamePartMatch = photo.name.match(/^(.*)-\d+\.(jpe?g)$/i);
      const productKey = baseNamePartMatch ? baseNamePartMatch[1] : photo.name.replace(/\.(jpe?g)$/i, '');
      
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
  const disableActions = isUploading || isBackendProcessing;

  const getStatusBadgeVariant = (status: ProcessingStatusEntry['status']): "default" | "secondary" | "destructive" | "outline" => {
    if (status.startsWith('error')) return 'destructive';
    if (status.startsWith('completed')) return 'default';
    if (status === 'uploaded') return 'secondary';
    return 'outline';
  };

  const getStatusText = (status: ProcessingStatusEntry['status']): string => {
    const map: Record<ProcessingStatusEntry['status'], string> = {
        uploaded: "Subido a Servidor Externo",
        processing_image_started: "Iniciando Proc. Imagen",
        processing_image_downloaded: "Descargando de Servidor Externo",
        processing_image_validated: "Validando Imagen",
        processing_image_optimized: "Optimizando Imagen",
        processing_image_seo_named: "Generando Nombre SEO",
        processing_image_metadata_generated: "Generando Metadatos",
        processing_image_rules_applied: "Aplicando Reglas",
        processing_image_reuploaded: "Subiendo Imagen Procesada a Servidor Externo",
        completed_image_pending_woocommerce: "Proc. Imagen Completo",
        error_processing_image: "Error Proc. Imagen",
        completed_woocommerce_integration: "Integrado con WooCommerce",
        error_woocommerce_integration: "Error Integración WooCommerce"
    };
    return map[status] || status.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
  };
  
  const totalPhotosInBatch = batchPhotosStatus.length;
  const processedPhotosCount = batchPhotosStatus.filter(p => p.status === 'completed_image_pending_woocommerce' || p.status === 'completed_woocommerce_integration').length;
  const errorPhotosCount = batchPhotosStatus.filter(p => p.status.startsWith('error')).length;


  return (
    <div className="container mx-auto py-8 space-y-8">
      <div>
        <h1 className="text-3xl font-bold tracking-tight text-foreground font-headline">Procesamiento de Productos en Lote (Servidor Externo)</h1>
        <p className="text-muted-foreground">
          Sube múltiples imágenes JPG para crear varios productos. Las imágenes se subirán a tu servidor externo (quefoto.es).
          Patrón: <code className="bg-muted px-1 py-0.5 rounded-sm font-code">NombreProducto-IDENTIFICADORES-NUMERO.jpg</code>
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
              disabled={isUploading || photos.length === 0}
              className="w-full md:w-auto"
            >
              {isUploading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {!isUploading && <Layers className="mr-2 h-4 w-4" />}
              {isUploading ? "Subiendo y Registrando..." : `Iniciar Subida a Servidor Externo y Procesamiento (${photos.length} ${photos.length === 1 ? 'imagen' : 'imágenes'})`}
            </Button>
          </CardFooter>
        </Card>
      )}

      {currentBatchId && (
        <Card className="shadow-lg rounded-lg">
            <CardHeader>
                <div className="flex items-center justify-between">
                    <div className="flex items-center space-x-3">
                        {isBackendProcessing ? <Loader2 className="h-8 w-8 text-primary animate-spin" /> : <Eye className="h-8 w-8 text-primary"/>}
                        <div>
                            <CardTitle>Estado del Lote: <code className="font-code bg-muted px-1 py-0.5 rounded-sm">{currentBatchId}</code></CardTitle>
                            <CardDescription>
                                {isBackendProcessing 
                                    ? `Procesando ${totalPhotosInBatch} imágenes... (${processedPhotosCount} completadas, ${errorPhotosCount} errores)`
                                    : `Procesamiento del lote finalizado. ${processedPhotosCount} imágenes procesadas, ${errorPhotosCount} con errores.`
                                }
                            </CardDescription>
                        </div>
                    </div>
                    {isBackendProcessing && totalPhotosInBatch > 0 && (
                         <Progress value={(processedPhotosCount + errorPhotosCount) / totalPhotosInBatch * 100} className="w-1/4 h-3" />
                    )}
                </div>
            </CardHeader>
            <CardContent>
                {batchPhotosStatus.length > 0 ? (
                    <ScrollArea className="h-96">
                        <ul className="space-y-2">
                            {batchPhotosStatus.map(photoStatus => (
                                <li key={photoStatus.id} className="p-3 border rounded-md bg-background flex items-center justify-between hover:bg-muted/50 transition-colors">
                                    <div className="flex-1 min-w-0">
                                        <div className="flex items-center space-x-2">
                                            <FileText className="h-5 w-5 text-muted-foreground flex-shrink-0"/>
                                            <p className="text-sm font-medium text-foreground truncate" title={photoStatus.imageName}>{photoStatus.imageName}</p>
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
                                          {(photoStatus.status !== 'uploaded' && !photoStatus.status.startsWith('error') && photoStatus.status !== 'completed_image_pending_woocommerce' && photoStatus.status !== 'completed_woocommerce_integration') || (photoStatus.status === 'uploaded' && isBackendProcessing) ? (
                                              <Progress value={photoStatus.progress || 0} className="h-2" />
                                          ) : photoStatus.status.startsWith('completed') ? (
                                              <CheckCircle className="h-5 w-5 text-green-500" />
                                          ) : photoStatus.status.startsWith('error') ? (
                                              <XCircle className="h-5 w-5 text-destructive" />
                                          ) : (
                                              <span className="text-xs text-muted-foreground">Pendiente</span>
                                          )}
                                        </div>
                                    </div>
                                </li>
                            ))}
                        </ul>
                    </ScrollArea>
                ) : isBackendProcessing ? (
                    <div className="min-h-[100px] flex flex-col items-center justify-center text-center">
                        <Loader2 className="h-12 w-12 text-primary animate-spin mx-auto mb-2" />
                        <p className="text-muted-foreground">Esperando datos del procesamiento...</p>
                    </div>
                ) : (
                     <div className="min-h-[100px] flex flex-col items-center justify-center text-center">
                        <AlertTriangle className="h-10 w-10 text-muted-foreground mb-2" />
                        <p className="text-muted-foreground">No hay detalles de procesamiento para este lote o el lote no se inició.</p>
                    </div>
                )}
            </CardContent>
             <CardFooter className="border-t pt-4 flex justify-end">
                <Button onClick={() => { setCurrentBatchId(null); setPhotos([]); setUploadProgress({}); }} variant="outline" disabled={isBackendProcessing}>
                    Procesar Otro Lote
                </Button>
            </CardFooter>
        </Card>
      )}
    </div>
  );
}
