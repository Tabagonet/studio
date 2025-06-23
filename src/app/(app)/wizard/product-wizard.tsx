
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
import { ArrowLeft, ArrowRight, Rocket, ExternalLink } from 'lucide-react';
import axios from 'axios';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import Link from 'next/link';

export function ProductWizard() {
  const [currentStep, setCurrentStep] = useState(1);
  const [productData, setProductData] = useState<ProductData>(INITIAL_PRODUCT_DATA);
  const [processingState, setProcessingState] = useState<WizardProcessingState>('idle');
  const [progress, setProgress] = useState({ images: 0, product: 0 });
  const [productAdminUrl, setProductAdminUrl] = useState<string | null>(null);
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
    setProgress({ images: 0, product: 0 });

    try {
        const token = await user.getIdToken();

        // Step 1: Upload images to the temporary server (quefoto.es)
        const photosToUpload = productData.photos.filter(p => p.file);
        const uploadedPhotosInfo: { id: string; uploadedUrl: string; uploadedFilename: string }[] = [];

        if (photosToUpload.length > 0) {
          for (const [index, photo] of photosToUpload.entries()) {
              const formData = new FormData();
              formData.append('imagen', photo.file!);
              
              const uploadResponse = await axios.post('/api/upload-image', formData, {
                  headers: { 'Authorization': `Bearer ${token}` }
              });

              if (!uploadResponse.data.success) {
                  throw new Error(`Error subiendo ${photo.name}: ${uploadResponse.data.error}`);
              }
              
              uploadedPhotosInfo.push({
                  id: photo.id,
                  uploadedUrl: uploadResponse.data.url,
                  uploadedFilename: uploadResponse.data.filename_saved_on_server,
              });
              
              setProgress(prev => ({ ...prev, images: Math.round(((index + 1) / photosToUpload.length) * 100) }));
          }
        }
        setProgress({ images: 100, product: 10 });

        // Update productData with the new uploaded URLs before sending to final API
        const finalPhotosForApi = productData.photos.map(p => {
            const uploadedInfo = uploadedPhotosInfo.find(info => info.id === p.id);
            if (uploadedInfo) {
              return { ...p, file: undefined, uploadedUrl: uploadedInfo.uploadedUrl, uploadedFilename: uploadedInfo.uploadedFilename };
            }
            return { ...p, file: undefined };
        });

        const finalProductData = {
          ...productData,
          photos: finalPhotosForApi,
          source: 'wizard'
        };
        
        // Step 2: Create product in WooCommerce, which will fetch images from the temp URL
        const createResponse = await axios.post('/api/woocommerce/products', finalProductData, {
            headers: { 'Authorization': `Bearer ${token}` }
        });

        setProgress(prev => ({ ...prev, product: 80 }));

        if (createResponse.data.success) {
            toast({
              title: "¡Producto Creado!",
              description: `"${createResponse.data.data.name}" se ha creado en WooCommerce.`,
            });
            
            setProductAdminUrl(createResponse.data.admin_url);

            setProgress({ images: 100, product: 100 });
            setProcessingState('finished');
        } else {
            throw new Error(createResponse.data.error || 'Error desconocido al crear el producto.');
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
    setProductAdminUrl(null);
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
                {processingState === 'finished' && productAdminUrl && (
                  <Button asChild variant="outline">
                    <Link href={productAdminUrl} target="_blank" rel="noopener noreferrer">
                      <ExternalLink className="mr-2 h-4 w-4" />
                      Ver producto en WooCommerce
                    </Link>
                  </Button>
                )}
            </CardContent>
        </Card>
      )}
    </div>
  );
}
