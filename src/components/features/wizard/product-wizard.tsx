
"use client";

import React, { useState, useEffect, useCallback } from 'react';
import { Step1DetailsPhotos } from '@/app/(app)/wizard/step-1-details-photos';
import { Step2Preview } from './step-2-preview'; 
import { Step3Confirm } from './step-3-confirm';
import { Step4Processing } from './step-4-processing';
import type { ProductData, ProductPhoto, WizardProcessingState } from '@/lib/types';
import { INITIAL_PRODUCT_DATA } from '@/lib/constants';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { auth } from '@/lib/firebase';
import { ArrowLeft, ArrowRight, Rocket } from 'lucide-react';
import axios from 'axios';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

export function ProductWizard() {
  const [currentStep, setCurrentStep] = useState(1);
  const [productData, setProductData] = useState<ProductData>(INITIAL_PRODUCT_DATA);
  const [processingState, setProcessingState] = useState<WizardProcessingState>('idle');
  const [progress, setProgress] = useState({ images: 0, product: 0 });
  const { toast } = useToast();

  const isProcessing = processingState === 'uploading' || processingState === 'creating';

  const updateProductData = useCallback((data: Partial<ProductData>) => {
    setProductData(prev => ({ ...prev, ...data }));
  }, []);

  const updatePhotoState = useCallback((photoId: string, updates: Partial<ProductPhoto>) => {
    setProductData(prevData => {
      const newPhotos = prevData.photos.map(p => p.id === photoId ? { ...p, ...updates } : p);
      
      const totalProgress = newPhotos.reduce((acc, p) => acc + (p.progress || 0), 0);
      const averageProgress = newPhotos.length > 0 ? totalProgress / newPhotos.length : 0;
      setProgress(prevProgress => ({ ...prevProgress, images: Math.round(averageProgress) }));

      return { ...prevData, photos: newPhotos };
    });
  }, []);
  
  const handleCreateProduct = useCallback(async () => {
    const user = auth.currentUser;
    if (!user) {
        toast({ title: "Error de autenticación", description: "Debes iniciar sesión.", variant: "destructive" });
        setProcessingState('error');
        return;
    }
    
    setProcessingState('uploading');
    const token = await user.getIdToken();

    const photosToUpload = productData.photos.filter(p => p.file && p.status !== 'completed');
    const uploadPromises = photosToUpload.map(photo => {
      if (!photo.file) return Promise.resolve(null);
      const formData = new FormData();
      formData.append('imagen', photo.file);

      return axios.post('/api/upload-image', formData, {
        headers: { 'Authorization': `Bearer ${token}` },
        onUploadProgress: (progressEvent: any) => {
          const percentCompleted = Math.round((progressEvent.loaded * 100) / (progressEvent.total || 1));
          updatePhotoState(photo.id, { status: 'uploading', progress: percentCompleted });
        },
      }).then(response => {
          const result = response.data;
          if (!result.success) throw new Error(result.error || 'La subida ha fallado');
          updatePhotoState(photo.id, { status: 'completed', progress: 100, url: result.url });
          return { ...photo, url: result.url };
      }).catch(error => {
          const errorMessage = error.response?.data?.error || error.message || 'Error desconocido';
          updatePhotoState(photo.id, { status: 'error', error: errorMessage, progress: 0 });
          return Promise.reject(new Error(`Fallo al subir ${photo.name}: ${errorMessage}`));
      });
    });

    const uploadResults = await Promise.allSettled(uploadPromises);
    const failedUploads = uploadResults.filter(r => r.status === 'rejected');

    if (failedUploads.length > 0) {
      toast({
        title: "Error en la subida de imágenes",
        description: `No se pudieron subir ${failedUploads.length} imágen(es). Revisa los errores e inténtalo de nuevo.`,
        variant: "destructive",
      });
      setProcessingState('error');
      return;
    }

    const successfullyUploadedPhotos = uploadResults
      .filter((r): r is PromiseFulfilledResult<ProductPhoto> => r.status === 'fulfilled' && r.value !== null)
      .map(r => r.value);
    
    const finalPhotosWithUrls = productData.photos.map(p => {
        const uploadedVersion = successfullyUploadedPhotos.find(up => up.id === p.id);
        return uploadedVersion || p;
    });

    setProcessingState('creating');
    setProgress(prev => ({ ...prev, product: 50 }));

    try {
        const finalProductData = {
          ...productData,
          photos: finalPhotosWithUrls,
        };
        
        const response = await axios.post('/api/woocommerce/products', finalProductData, {
            headers: { 'Authorization': `Bearer ${token}` }
        });

        if (response.data.success) {
            toast({
              title: "¡Producto Creado!",
              description: `"${response.data.data.name}" se ha creado en WooCommerce.`,
            });
            setProgress(prev => ({ ...prev, product: 100 }));
            setProcessingState('finished');
        } else {
            throw new Error(response.data.error || 'Error desconocido al crear el producto.');
        }
    } catch (error: any) {
        const errorMessage = error.response?.data?.error || error.message || "No se pudo crear el producto en WooCommerce.";
        toast({
            title: "Error al Crear Producto",
            description: errorMessage,
            variant: "destructive",
        });
        setProcessingState('error');
        console.error("Full error object when creating product:", error.response?.data || error);
    }

  }, [productData, toast, updatePhotoState]);


  useEffect(() => {
    if (currentStep === 4 && processingState === 'idle') {
      handleCreateProduct();
    }
  }, [currentStep, processingState, handleCreateProduct]);

  const nextStep = () => {
    if (currentStep < 4) {
      setCurrentStep(prev => prev + 1);
      window.scrollTo(0, 0);
    }
  };
  
  const prevStep = () => {
    if (currentStep > 1 && !isProcessing) {
      setCurrentStep(prev => prev - 1);
      window.scrollTo(0, 0);
    }
  };

  const renderStep = () => {
    switch (currentStep) {
      case 1:
        return <Step1DetailsPhotos productData={productData} updateProductData={updateProductData} isProcessing={isProcessing} />;
      case 2:
        return <Step2Preview productData={productData} />;
      case 3:
        return <Step3Confirm productData={productData} />;
      case 4:
        return <Step4Processing productData={productData} processingState={processingState} progress={progress} />;
      default:
        return <Step1DetailsPhotos productData={productData} updateProductData={updateProductData} isProcessing={isProcessing} />;
    }
  };
  
  const startOver = () => {
    setProductData(INITIAL_PRODUCT_DATA);
    setProgress({ images: 0, product: 0 });
    setProcessingState('idle');
    setCurrentStep(1);
    window.scrollTo(0, 0);
  }

  return (
    <div className="space-y-8">
      {renderStep()}
      
      {currentStep < 4 && !isProcessing && (
        <div className="flex justify-between mt-8">
            <Button onClick={prevStep} disabled={currentStep === 1}>
            <ArrowLeft className="mr-2 h-4 w-4" />
            Anterior
            </Button>

            {currentStep < 3 ? (
            <Button onClick={nextStep}>
                Siguiente
                <ArrowRight className="ml-2 h-4 w-4" />
            </Button>
            ) : (
            <Button onClick={() => setCurrentStep(4)}>
                <Rocket className="mr-2 h-4 w-4" />
                Crear Producto
            </Button>
            )}
        </div>
      )}

      {(processingState === 'finished' || processingState === 'error') && (
         <Card>
            <CardHeader>
                <CardTitle>{processingState === 'finished' ? 'Proceso Completado' : 'Proceso Interrumpido'}</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-wrap gap-4">
                <Button onClick={startOver}>Crear otro producto</Button>
                {/* This could link to the created product in WooCommerce admin */}
                {processingState === 'finished' && <Button variant="outline" disabled>Ver producto en WooCommerce (próximamente)</Button>}
            </CardContent>
        </Card>
      )}

      {/* <div className="mt-4 p-4 bg-muted rounded-md text-xs overflow-x-auto">
        <code>{JSON.stringify({productData, processingState, progress}, null, 2)}</code>
      </div> */}
    </div>
  );
}
