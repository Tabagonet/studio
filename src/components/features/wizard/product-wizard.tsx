
"use client";

import React, { useState } from 'react';
import { Step1DetailsPhotos } from './step-1-details-photos';
import { Step2Preview } from './step-2-preview'; 
import { Step3Confirm } from './step-3-confirm';
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
    toast({ title: "Iniciando proceso...", description: "Subiendo imágenes al servidor." });

    const user = auth.currentUser;
    if (!user) {
        toast({ title: "Error de autenticación", description: "Debes iniciar sesión.", variant: "destructive" });
        setIsProcessing(false);
        return;
    }
    const token = await user.getIdToken();

    const photosToUpload = productData.photos.filter(p => p.status === 'pending');

    const uploadPromises = photosToUpload.map(photo => {
      if (!photo.file) return Promise.resolve(); // Should not happen

      updatePhotoState(photo.id, { status: 'uploading', progress: 5 }); // Start upload status

      const formData = new FormData();
      formData.append('imagen', photo.file);
      
      // Simulate progress for now, as fetch doesn't support it directly.
      // A real implementation would use XHR or a library like axios.
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
        console.error(`Error subiendo ${photo.name}:`, error);
        // We throw it again so Promise.allSettled can catch it
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
      setIsProcessing(false);
      return;
    }
    
    toast({
      title: "Imágenes Subidas Correctamente",
      description: "Todas las imágenes están en el servidor. Próximo paso: crear producto en WooCommerce.",
    });

    // TODO: Add logic to create the product in WooCommerce here
    console.log("Datos del producto listos para enviar a WooCommerce:", productData);
    
    // Simulate final step
    setTimeout(() => {
        setIsProcessing(false);
        toast({ title: "Proceso (simulado) finalizado!", description: "El producto se ha creado en WooCommerce."});
    }, 2000);
  };


  const nextStep = () => {
    setCurrentStep(prev => prev + 1);
    window.scrollTo(0, 0);
  };
  
  const prevStep = () => {
    setCurrentStep(prev => prev - 1);
    window.scrollTo(0, 0);
  };

  const renderStep = () => {
    switch (currentStep) {
      case 1:
        return <Step1DetailsPhotos productData={productData} updateProductData={updateProductData} isProcessing={isProcessing} />;
      case 2:
        return <Step2Preview productData={productData} />;
      case 3:
        return <Step3Confirm productData={productData} />;
      default:
        return <Step1DetailsPhotos productData={productData} updateProductData={updateProductData} isProcessing={isProcessing} />;
    }
  };

  return (
    <div className="space-y-8">
      {renderStep()}
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
          <Button onClick={handleCreateProduct} disabled={isProcessing}>
            {isProcessing ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Rocket className="mr-2 h-4 w-4" />
            )}
            {isProcessing ? 'Procesando...' : 'Crear Producto'}
          </Button>
        )}
      </div>
       <pre className="mt-4 p-4 bg-muted rounded-md text-xs overflow-x-auto">
        <code>{JSON.stringify(productData, null, 2)}</code>
       </pre>
    </div>
  );
}
