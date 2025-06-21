
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

const fileToDataUri = (file: File): Promise<string> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
};

export function ProductWizard() {
  const [currentStep, setCurrentStep] = useState(1);
  const [productData, setProductData] = useState<ProductData>(INITIAL_PRODUCT_DATA);
  const [processingState, setProcessingState] = useState<WizardProcessingState>('idle');
  const [progress, setProgress] = useState({ images: 0, product: 0 }); // Progress kept for UI
  const { toast } = useToast();

  const isProcessing = processingState === 'processing';

  const updateProductData = useCallback((data: Partial<ProductData>) => {
    setProductData(prev => ({ ...prev, ...data }));
  }, []);

  const handleCreateProduct = useCallback(async () => {
    const user = auth.currentUser;
    if (!user) {
        toast({ title: "Error de autenticación", description: "Debes iniciar sesión.", variant: "destructive" });
        setProcessingState('error');
        return;
    }
    
    setProcessingState('processing');
    setProgress({ images: 5, product: 0 }); // Start progress

    try {
        const token = await user.getIdToken();

        // Convert files to Data URIs for API transfer
        const photosWithDataUri = await Promise.all(
            productData.photos
                .filter(p => p.file)
                .map(async (photo) => ({
                    ...photo,
                    dataUri: await fileToDataUri(photo.file!),
                    file: undefined, // Remove File object before serialization
                }))
        );

        setProgress({ images: 25, product: 0 }); // Files read

        // Re-integrate photos with Data URIs back into the main photo list
        const finalPhotosForApi = productData.photos.map(p => {
            const photoWithData = photosWithDataUri.find(pwd => pwd.id === p.id);
            return photoWithData || { ...p, file: undefined };
        });

        const finalProductData = {
          ...productData,
          photos: finalPhotosForApi,
        };
        
        setProgress({ images: 50, product: 0 }); // Data prepared for API

        const response = await axios.post('/api/woocommerce/products', finalProductData, {
            headers: { 'Authorization': `Bearer ${token}` }
        });

        setProgress({ images: 100, product: 50 }); // API responded

        if (response.data.success) {
            toast({
              title: "¡Producto Creado!",
              description: `"${response.data.data.name}" se ha creado en WooCommerce.`,
            });
            setProgress({ images: 100, product: 100 });
            setProcessingState('finished');
        } else {
            throw new Error(response.data.error || 'Error desconocido al crear el producto.');
        }

    } catch (error: any) {
        const errorMessage = error.response?.data?.error || error.message || "No se pudo crear el producto.";
        toast({
            title: "Error al Crear Producto",
            description: errorMessage,
            variant: "destructive",
        });
        setProcessingState('error');
        console.error("Full error object when creating product:", error.response?.data || error);
    }
  }, [productData, toast]);


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
        return <Step4Processing processingState={processingState} progress={progress} />;
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
    </div>
  );
}
