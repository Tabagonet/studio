// src/app/(app)/wizard/product-wizard.tsx

"use client";

import React, { useState, useEffect, useCallback } from 'react';
import { Step1DetailsPhotos } from '@/app/(app)/wizard/step-1-details-photos';
import { Step2Preview } from './step-2-preview'; 
import { Step3Confirm } from './step-3-confirm';
import { Step4Processing } from './step-4-processing';
import type { ProductData, SubmissionStep, SubmissionStatus, ProductPhoto } from '@/lib/types';
import { INITIAL_PRODUCT_DATA, ALL_LANGUAGES } from '@/lib/constants';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { auth } from '@/lib/firebase';
import { ArrowLeft, ArrowRight, Rocket, ExternalLink } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import Link from 'next/link';
import axios from 'axios';

export function ProductWizard() {
  const [currentStep, setCurrentStep] = useState(1);
  const [isStepValid, setIsStepValid] = useState(true);
  const [productData, setProductData] = useState<ProductData>(INITIAL_PRODUCT_DATA);
  const [submissionStatus, setSubmissionStatus] = useState<SubmissionStatus>('idle');
  const [steps, setSteps] = useState<SubmissionStep[]>([]);
  const [finalLinks, setFinalLinks] = useState<{ url: string; title: string }[]>([]);

  const { toast } = useToast();

  const isProcessing = submissionStatus === 'processing';

  const updateProductData = useCallback((data: Partial<ProductData>) => {
    setProductData(prev => ({ ...prev, ...data }));
  }, []);
  
  const updateStepStatus = (id: string, status: SubmissionStep['status'], message?: string, error?: string) => {
    setSteps(prevSteps => 
      prevSteps.map(step => 
        step.id === id ? { ...step, status, message: message || step.message, error } : step
      )
    );
  };
  
  const handleCreateProduct = useCallback(async () => {
    setCurrentStep(4);
    
    let initialSteps: SubmissionStep[] = [
      { id: 'create_product', name: `Creando producto`, status: 'pending', message: 'Preparando datos...' },
    ];
    if (productData.targetLanguages && productData.targetLanguages.length > 0) {
        initialSteps.push({ id: 'sync_translations', name: 'Sincronizando enlaces de traducción', status: 'pending', message: 'Esperando creación del producto principal.' });
    }
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
        productData.photos.forEach(photo => {
            if (photo.file) {
                formData.append('photos', photo.file, photo.name);
            }
        });

        updateStepStatus('create_product', 'processing', 'Enviando datos a WooCommerce...');
        const originalResponse = await fetch('/api/woocommerce/products', { 
            method: 'POST', 
            headers: { 'Authorization': `Bearer ${token}` }, 
            body: formData
        });

        if (!originalResponse.ok) { 
            const errorData = await originalResponse.json(); 
            throw new Error(errorData.error || `Error creando producto original`); 
        }
        
        const originalResult = await originalResponse.json();
        const mainProductId = originalResult.data.id;
        
        updateStepStatus('create_product', 'success', 'Producto original creado con éxito.');
        setFinalLinks([{ url: originalResult.data.url, title: originalResult.data.title }]);

        // Now, handle translations if any
        if (productData.targetLanguages && productData.targetLanguages.length > 0) {
            updateStepStatus('sync_translations', 'processing', 'Iniciando traducciones...');
            const translateResponse = await fetch('/api/woocommerce/products/translate', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
              body: JSON.stringify({
                productId: mainProductId,
                targetLanguages: productData.targetLanguages,
              }),
            });
            
             if (!translateResponse.ok) { 
                const errorData = await translateResponse.json(); 
                throw new Error(errorData.error || `Error en la traducción`); 
            }
            const translationResult = await translateResponse.json();
            updateStepStatus('sync_translations', 'success', translationResult.message);
        }

        setSubmissionStatus('success');

    } catch (error: any) {
        const failedStep = steps.find(s => s.status === 'processing');
        if (failedStep) {
            updateStepStatus(failedStep.id, 'error', error.message);
        }
        toast({ title: 'Proceso Interrumpido', description: error.message, variant: 'destructive' });
        setSubmissionStatus('error');
    }
  }, [productData, toast, steps]);


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
      if(isStepValid) {
        setCurrentStep(4);
      } else {
        toast({
            title: "Validación Fallida",
            description: "Por favor, corrige los errores antes de continuar.",
            variant: "destructive",
        })
      }
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
        return <Step3Confirm productData={productData} onValidationComplete={setIsStepValid} />;
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
            <Button onClick={nextStep} disabled={!isStepValid}>
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
