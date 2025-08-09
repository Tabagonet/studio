// src/app/(app)/wizard/product-wizard.tsx

"use client";

import React, { useState, useEffect, useCallback } from 'react';
import { Step1DetailsPhotos } from '@/app/(app)/wizard/step-1-details-photos';
import { Step2Preview } from './step-2-preview'; 
import { Step3Confirm } from './step-3-confirm';
import { Step4Processing } from './step-4-processing';
import type { ProductData, SubmissionStep, SubmissionStatus } from '@/lib/types';
import { INITIAL_PRODUCT_DATA, ALL_LANGUAGES } from '@/lib/constants';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { auth } from '@/lib/firebase';
import { ArrowLeft, ArrowRight, Rocket, ExternalLink } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import Link from 'next/link';

export function ProductWizard() {
  const [currentStep, setCurrentStep] = useState(1);
  const [productData, setProductData] = useState<ProductData>(INITIAL_PRODUCT_DATA);
  const [submissionStatus, setSubmissionStatus] = useState<SubmissionStatus>('idle');
  const [steps, setSteps] = useState<SubmissionStep[]>([]);
  const [finalLinks, setFinalLinks] = useState<{ url: string; title: string }[]>([]);

  const { toast } = useToast();

  const isProcessing = submissionStatus === 'processing';

  const updateProductData = useCallback((data: Partial<ProductData>) => {
    setProductData(prev => ({ ...prev, ...data }));
  }, []);
  
  const updateStepStatus = (id: string, status: SubmissionStep['status'], error?: string, progress?: number, message?: string) => {
    setSteps(prevSteps => 
      prevSteps.map(step => 
        step.id === id ? { ...step, status, error, progress, message: message || step.message } : step
      )
    );
  };
  
  const handleCreateProduct = useCallback(async () => {
    setCurrentStep(4);
    
    const photosToUpload = productData.photos.filter(p => p.file);
    let totalOperations = 1; // Start with 1 for the main product creation
    totalOperations += photosToUpload.length; // Each upload is an operation

    let initialSteps: SubmissionStep[] = [];
    if (photosToUpload.length > 0) {
      initialSteps.push({ id: 'upload_images', name: `Subiendo ${photosToUpload.length} imágen(es)`, status: 'pending', progress: 0 });
    }
    const sourceLangName = ALL_LANGUAGES.find(l => l.code === productData.language)?.name || productData.language;
    initialSteps.push({ id: 'create_original', name: `Creando producto original (${sourceLangName})`, status: 'pending', progress: 0 });
    
    setSteps(initialSteps);
    setFinalLinks([]);
    setSubmissionStatus('processing');
    
    const user = auth.currentUser;
    if (!user) {
        toast({ title: 'Error', description: 'No autenticado.', variant: 'destructive' });
        setSubmissionStatus('error');
        return;
    }
    
    try {
        const token = await user.getIdToken();
        
        const formData = new FormData();
        formData.append('productData', JSON.stringify(productData));
        photosToUpload.forEach(photo => {
            if (photo.file) {
                formData.append('photos', photo.file, photo.name);
            }
        });
        
        if (photosToUpload.length > 0) {
          updateStepStatus('upload_images', 'processing', undefined, 50, "Enviando archivos al servidor...");
        }
        updateStepStatus('create_original', 'processing', undefined, 0, "Preparando datos...");

        const response = await fetch('/api/woocommerce/products', {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${token}` },
          body: formData,
        });

        const result = await response.json();

        if (!response.ok) {
          throw new Error(result.error || `Error creando el producto.`);
        }
        
        if (photosToUpload.length > 0) {
          updateStepStatus('upload_images', 'success', undefined, 100, "Imágenes subidas y asignadas.");
        }
        updateStepStatus('create_original', 'success', undefined, 100, "Producto base creado en WooCommerce.");
        
        setFinalLinks([{ url: result.data.url, title: result.data.title }]);
        setSubmissionStatus('success');

    } catch (error: any) {
        const failedStep = steps.find(s => s.status === 'processing');
        if (failedStep) {
            updateStepStatus(failedStep.id, 'error', error.message);
        }
        toast({ title: 'Proceso Interrumpido', description: error.message, variant: 'destructive' });
        setSubmissionStatus('error');
    }
  }, [productData, toast]);


  useEffect(() => {
    if (currentStep === 4 && submissionStatus === 'idle') {
      handleCreateProduct();
    }
  }, [currentStep, submissionStatus, handleCreateProduct]);

  const nextStep = () => {
    if (currentStep < 3) {
      setCurrentStep(prev => prev + 1);
      window.scrollTo(0, 0);
    } else if (currentStep === 3) {
      setCurrentStep(4);
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
        return <Step3Confirm productData={productData} onValidationComplete={() => {}} />;
      case 4:
        return <Step4Processing status={submissionStatus} steps={steps} />;
      default:
        return <Step1DetailsPhotos productData={productData} updateProductData={updateProductData} isProcessing={isProcessing} />;
    }
  };
  
  const startOver = () => {
    setProductData(INITIAL_PRODUCT_DATA);
    setSteps([]);
    setFinalLinks([]);
    setSubmissionStatus('idle');
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
                Crear Producto(s)
            </Button>
            )}
        </div>
      )}

      {(submissionStatus === 'success' || submissionStatus === 'error') && (
         <Card>
            <CardHeader>
                <CardTitle>{submissionStatus === 'success' ? 'Proceso Completado' : 'Proceso Interrumpido'}</CardTitle>
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
