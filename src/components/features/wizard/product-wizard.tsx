
"use client";

import React, { useState, useEffect } from 'react';
import { Step1DetailsPhotos } from './step-1-details-photos';
import { Step2Preview } from './step-2-preview'; 
import { Step3Confirm } from './step-3-confirm';
import { Step4Processing } from './step-4-processing';
import type { ProductData, ProductPhoto } from '@/lib/types';
import { INITIAL_PRODUCT_DATA } from '@/lib/constants';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { auth } from '@/lib/firebase';
import { ArrowLeft, ArrowRight, Loader2, Rocket } from 'lucide-react';

export function ProductWizard() {
  const [currentStep, setCurrentStep] = useState(1);
  const [productData, setProductData] = useState<ProductData>(INITIAL_PRODUCT_DATA);
  const [isProcessing, setIsProcessing] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    // This effect triggers the processing when the user reaches step 4
    if (currentStep === 4 && !isProcessing) {
      handleCreateProduct();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentStep]);


  const updateProductData = (data: Partial<ProductData>) => {
    setProductData(prev => ({ ...prev, ...data }));
  };

  const updatePhotoState = (photoId: string, updates: Partial<ProductPhoto>) => {
    setProductData(prev => ({
      ...prev,
      photos: prev.photos.map(p => p.id === photoId ? { ...p, ...updates } : p),
    }));
  }

  const handleCreateProduct = async () => {
    setIsProcessing(true);

    const user = auth.currentUser;
    if (!user) {
        toast({ title: "Error de autenticación", description: "Debes iniciar sesión.", variant: "destructive" });
        setIsProcessing(false);
        return;
    }
    const token = await user.getIdToken();

    const photosToUpload = productData.photos.filter(p => p.status === 'pending');

    const uploadPromises = photosToUpload.map(photo => {
      if (!photo.file) return Promise.resolve(); 

      updatePhotoState(photo.id, { status: 'uploading', progress: 5 });

      const formData = new FormData();
      formData.append('imagen', photo.file);
      
      // Axios or a library with progress events would be better here.
      // We simulate progress.
      updatePhotoState(photo.id, { progress: 30 });

      return fetch('/api/upload-image', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}` },
        body: formData,
      })
      .then(async response => {
        updatePhotoState(photo.id, { progress: 70 });
        const result = await response.json();
        if (!response.ok || !result.success) {
          throw new Error(result.error || 'La subida ha fallado');
        }
        updatePhotoState(photo.id, { status: 'completed', progress: 100, url: result.url });
        return result;
      })
      .catch(error => {
        const errorMessage = (error as Error).message;
        updatePhotoState(photo.id, { status: 'error', error: errorMessage, progress: 0 });
        throw new Error(`Fallo al subir ${photo.name}: ${errorMessage}`);
      });
    });

    const results = await Promise.allSettled(uploadPromises);
    
    const failedUploads = results.filter(r => r.status === 'rejected');

    if (failedUploads.length > 0) {
      toast({
        title: "Error en la subida",
        description: `${failedUploads.length} imágen(es) no se pudieron subir. Por favor, revisa los errores e inténtalo de nuevo.`,
        variant: "destructive",
      });
      setIsProcessing(false); // Stop processing on failure
      return;
    }
    
    // All images uploaded, now create the product
    toast({
      title: "Imágenes Subidas Correctamente",
      description: "Todas las imágenes están en el servidor. Próximo paso: crear producto en WooCommerce.",
    });

    // TODO: Implement this part
    console.log("Datos del producto listos para enviar a WooCommerce:", productData);
    
    // Simulate final step after a delay
    setTimeout(() => {
        setIsProcessing(false); // This will indicate the full process is "finished" for now
        toast({ title: "Proceso finalizado (simulación)", description: "Creación en WooCommerce por implementar."});
    }, 2000);
  };


  const nextStep = () => {
    if (currentStep < 4) {
      setCurrentStep(prev => prev + 1);
      window.scrollTo(0, 0);
    }
  };
  
  const prevStep = () => {
    if (currentStep > 1) {
      setCurrentStep(prev => prev - 1);
      window.scrollTo(0, 0);
    }
  };

  const renderStep = () => {
    switch (currentStep) {
      case 1:
        return <Step1DetailsPhotos productData={productData} updateProductData={updateProductData} />;
      case 2:
        return <Step2Preview productData={productData} />;
      case 3:
        return <Step3Confirm productData={productData} />;
      case 4:
        return <Step4Processing productData={productData} isProcessing={isProcessing} />;
      default:
        return <Step1DetailsPhotos productData={productData} updateProductData={updateProductData} />;
    }
  };

  return (
    <div className="space-y-8">
      {renderStep()}
      
      {currentStep < 4 && (
        <div className="flex justify-between mt-8">
            <Button onClick={prevStep} disabled={currentStep === 1 || isProcessing}>
            <ArrowLeft className="mr-2 h-4 w-4" />
            Anterior
            </Button>

            {currentStep < 3 && (
            <Button onClick={nextStep} disabled={isProcessing}>
                Siguiente
                <ArrowRight className="ml-2 h-4 w-4" />
            </Button>
            )}
            
            {currentStep === 3 && (
            <Button onClick={() => setCurrentStep(4)} disabled={isProcessing}>
                <Rocket className="mr-2 h-4 w-4" />
                Crear Producto
            </Button>
            )}
        </div>
      )}

      {/* Debug view can be enabled/disabled as needed */}
      {/* 
       <pre className="mt-4 p-4 bg-muted rounded-md text-xs overflow-x-auto">
        <code>{JSON.stringify(productData, null, 2)}</code>
       </pre>
      */}
    </div>
  );
}
