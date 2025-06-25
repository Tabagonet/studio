
"use client";

import React, { useState, useEffect, useCallback } from 'react';
import { Step1DetailsPhotos } from '@/app/(app)/wizard/step-1-details-photos';
import { Step2Preview } from './step-2-preview'; 
import { Step3Confirm } from './step-3-confirm';
import { Step4Processing } from './step-4-processing';
import type { ProductData, SubmissionStep, WizardProcessingState } from '@/lib/types';
import { INITIAL_PRODUCT_DATA } from '@/lib/constants';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { auth } from '@/lib/firebase';
import { ArrowLeft, ArrowRight, Rocket, ExternalLink } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import Link from 'next/link';

export function ProductWizard() {
  const [currentStep, setCurrentStep] = useState(1);
  const [productData, setProductData] = useState<ProductData>(INITIAL_PRODUCT_DATA);
  const [processingState, setProcessingState] = useState<WizardProcessingState>('idle');
  const [steps, setSteps] = useState<SubmissionStep[]>([]);
  const [finalLinks, setFinalLinks] = useState<{ url: string; title: string }[]>([]);

  const { toast } = useToast();

  const isProcessing = processingState === 'processing';

  const updateProductData = useCallback((data: Partial<ProductData>) => {
    setProductData(prev => ({ ...prev, ...data }));
  }, []);
  
  const updateStepStatus = (id: string, status: SubmissionStep['status'], error?: string) => {
    setSteps(prevSteps => 
      prevSteps.map(step => 
        step.id === id ? { ...step, status, error } : step
      )
    );
  };

  const handleCreateProduct = useCallback(async () => {
    setCurrentStep(4); // Move to the processing screen

    const user = auth.currentUser;
    if (!user) {
        toast({ title: "Error de autenticación", description: "Debes iniciar sesión.", variant: "destructive" });
        setProcessingState('error');
        return;
    }

    // Build the dynamic list of steps
    const initialSteps: SubmissionStep[] = [];
    if (productData.photos.some(p => p.file)) {
      initialSteps.push({ id: 'upload_images', name: 'Subiendo imágenes', status: 'pending' });
    }
    initialSteps.push({ id: 'create_product', name: `Creando producto(s) y traducciones`, status: 'pending' });
    setSteps(initialSteps);
    setFinalLinks([]);
    setProcessingState('processing');
    
    try {
        const token = await user.getIdToken();

        // The single API call that handles everything
        updateStepStatus('create_product', 'processing');

        const response = await fetch('/api/woocommerce/products', {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
            body: JSON.stringify(productData),
        });

        const result = await response.json();
        
        if (!response.ok) {
          throw new Error(result.error || 'Error desconocido al crear el producto.');
        }
        
        toast({
          title: "¡Producto(s) Creado(s)!",
          description: `El proceso ha finalizado correctamente.`,
        });
        
        setFinalLinks(result.data); // Assuming API returns an array of {url, title}
        updateStepStatus('create_product', 'success');
        setProcessingState('finished');

    } catch (error: any) {
        const errorMessage = error.message || "No se pudo crear el producto.";
        toast({
            title: "Error al Crear Producto",
            description: errorMessage,
            variant: "destructive",
        });
        updateStepStatus('create_product', 'error', errorMessage);
        setProcessingState('error');
        console.error("Full error object when creating product:", error);
    }
  }, [productData, toast]);


  const nextStep = () => {
    if (currentStep < 3) {
      setCurrentStep(prev => prev + 1);
      window.scrollTo(0, 0);
    } else if (currentStep === 3) {
      handleCreateProduct();
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
        return <Step4Processing processingState={processingState} steps={steps} />;
      default:
        return <Step1DetailsPhotos productData={productData} updateProductData={updateProductData} isProcessing={isProcessing} />;
    }
  };
  
  const startOver = () => {
    setProductData(INITIAL_PRODUCT_DATA);
    setSteps([]);
    setFinalLinks([]);
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
            <Button onClick={handleCreateProduct}>
                <Rocket className="mr-2 h-4 w-4" />
                Crear Producto(s)
            </Button>
            )}
        </div>
      )}

      {(processingState === 'finished' || processingState === 'error') && (
         <Card>
            <CardHeader>
                <CardTitle>{processingState === 'finished' ? 'Proceso Completado' : 'Proceso Interrumpido'}</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col items-start gap-4">
                {finalLinks.length > 0 && (
                    <div className="space-y-2">
                        <h3 className="font-semibold">Productos Creados:</h3>
                        {finalLinks.map((link, index) => (
                           <Button variant="link" asChild key={index}>
                             <Link href={link.url} target="_blank" rel="noopener noreferrer">
                               <ExternalLink className="mr-2 h-4 w-4" /> Ver "{link.title}"
                             </Link>
                           </Button>
                        ))}
                    </div>
                )}
                <Button onClick={startOver}>Crear otro producto</Button>
            </CardContent>
        </Card>
      )}
    </div>
  );
}
