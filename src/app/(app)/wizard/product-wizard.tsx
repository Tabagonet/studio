
"use client";

import React, { useState, useEffect, useCallback } from 'react';
import { Step1DetailsPhotos } from '@/app/(app)/wizard/step-1-details-photos';
import { Step2Preview } from './step-2-preview'; 
import { Step3Confirm } from './step-3-confirm';
import { Step4Processing } from './step-4-processing';
import type { ProductData, SubmissionStep, SubmissionStatus, WizardProcessingState } from '@/lib/types';
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
  const [processingState, setProcessingState] = useState<WizardProcessingState>('idle');
  const [progress, setProgress] = useState({ images: 0, product: 0 });

  const { toast } = useToast();

  const isProcessing = processingState === 'processing';

  const updateProductData = useCallback((data: Partial<ProductData>) => {
    setProductData(prev => ({ ...prev, ...data }));
  }, []);
  
  const updateStepStatus = (id: string, status: SubmissionStep['status'], error?: string, progress?: number) => {
    setSteps(prevSteps => 
      prevSteps.map(step => 
        step.id === id ? { ...step, status, error, progress } : step
      )
    );
  };

  const handleCreateProduct = useCallback(async () => {
    setCurrentStep(4); // Move to the processing screen
    setProcessingState('processing');
    setProgress({ images: 0, product: 0 });
    
    const initialSteps: SubmissionStep[] = [];
    if (productData.photos.some(p => p.file)) {
      initialSteps.push({ id: 'upload_images', name: 'Subiendo imágenes', status: 'pending', progress: 0 });
    }
    const sourceLangName = ALL_LANGUAGES.find(l => l.code === productData.language)?.name || productData.language;
    initialSteps.push({ id: 'create_original', name: `Creando producto original (${sourceLangName})`, status: 'pending', progress: 0 });
    
    productData.targetLanguages?.forEach(lang => {
        const targetLangName = ALL_LANGUAGES.find(l => l.code === lang)?.name || lang;
        initialSteps.push({ id: `translate_${lang}`, name: `Traduciendo a ${targetLangName}`, status: 'pending', progress: 0 });
        initialSteps.push({ id: `create_${lang}`, name: `Creando producto en ${targetLangName}`, status: 'pending', progress: 0 });
    });
     if (productData.targetLanguages && productData.targetLanguages.length > 0) {
        initialSteps.push({ id: 'sync_translations', name: 'Sincronizando enlaces de traducción', status: 'pending', progress: 0 });
    }
    setSteps(initialSteps);
    setFinalLinks([]);
    setSubmissionStatus('processing');
    
    const user = auth.currentUser;
    if (!user) {
        toast({ title: 'Error', description: 'No autenticado.', variant: 'destructive' });
        setProcessingState('error');
        setSubmissionStatus('error');
        return;
    }
    
    try {
        const token = await user.getIdToken();
        let finalProductData = { ...productData };
        let createdPostUrls: { url: string; title: string }[] = [];
        const allTranslations: { [key: string]: number } = {};

        // --- Step 1: Upload Images (if necessary) ---
        if (productData.photos.some(p => p.file)) {
            updateStepStatus('upload_images', 'processing', undefined, 10);
            const photosToUpload = productData.photos.filter(p => p.file);
            const uploadedPhotosInfo: { id: string | number; uploadedUrl: string; uploadedFilename: string }[] = [];
            
            for (const [index, photo] of photosToUpload.entries()) {
                 const formData = new FormData();
                 formData.append('imagen', photo.file!);
                 const response = await fetch('/api/upload-image', { method: 'POST', headers: { 'Authorization': `Bearer ${token}` }, body: formData });
                 if (!response.ok) throw new Error(`Error subiendo ${photo.name}`);
                 const imageData = await response.json();
                 uploadedPhotosInfo.push({ id: photo.id, uploadedUrl: imageData.url, uploadedFilename: imageData.filename_saved_on_server });
                 updateStepStatus('upload_images', 'processing', undefined, 10 + (80 * (index + 1) / photosToUpload.length));
                 setProgress(prev => ({...prev, images: Math.round(((index+1)/photosToUpload.length) * 100)}));
            }
            
            finalProductData.photos = productData.photos.map(p => {
                const uploaded = uploadedPhotosInfo.find(u => u.id === p.id);
                return uploaded ? { ...p, file: undefined, uploadedUrl: uploaded.uploadedUrl, uploadedFilename: uploaded.uploadedFilename } : p;
            });
            updateStepStatus('upload_images', 'success', undefined, 100);
        }
        
        setProgress(prev => ({...prev, product: 10}));

        // --- Step 2: Create Original Product ---
        updateStepStatus('create_original', 'processing', undefined, 50);
        const sourceLangSlug = ALL_LANGUAGES.find(l => l.code === finalProductData.language)?.slug || 'es';
        const originalPayload = { productData: { ...finalProductData, targetLanguages: [] }, lang: sourceLangSlug };
        
        const originalResponse = await fetch('/api/woocommerce/products', { method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` }, body: JSON.stringify(originalPayload) });
        if (!originalResponse.ok) { const errorData = await originalResponse.json(); throw new Error(errorData.error || `Error creando producto original`); }
        const originalResult = await originalResponse.json();
        createdPostUrls.push({ url: originalResult.data.url, title: originalResult.data.title });
        allTranslations[sourceLangSlug] = originalResult.data.id;
        updateStepStatus('create_original', 'success', undefined, 100);
        setProgress(prev => ({...prev, product: 50}));

        // --- Step 3: Create Translations ---
        if (finalProductData.targetLanguages) {
            for (const lang of finalProductData.targetLanguages) {
                updateStepStatus(`translate_${lang}`, 'processing', undefined, 50);
                const translationPayload = {
                    name: finalProductData.name,
                    short_description: finalProductData.shortDescription,
                    long_description: finalProductData.longDescription,
                };
                const translateResponse = await fetch('/api/translate', { method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` }, body: JSON.stringify({ content: translationPayload, targetLanguage: lang }) });
                if (!translateResponse.ok) throw new Error(`Error traduciendo a ${lang}`);
                const translatedContent = (await translateResponse.json()).content;
                updateStepStatus(`translate_${lang}`, 'success', undefined, 100);

                updateStepStatus(`create_${lang}`, 'processing', undefined, 50);
                const targetLangSlug = ALL_LANGUAGES.find(l => l.code === lang)?.slug || lang.toLowerCase().substring(0, 2);
                const translatedProductData = {
                  ...finalProductData,
                  name: translatedContent.name,
                  shortDescription: translatedContent.short_description,
                  longDescription: translatedContent.long_description,
                  sku: `${finalProductData.sku || 'PROD'}-${targetLangSlug.toUpperCase()}`
                };
                
                const translatedPayload = { productData: translatedProductData, lang: targetLangSlug };
                const translatedResponse = await fetch('/api/woocommerce/products', { method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` }, body: JSON.stringify(translatedPayload) });
                if (!translatedResponse.ok) { const errorData = await translatedResponse.json(); throw new Error(errorData.error || `Error creando producto en ${lang}`); }
                const translatedResult = await translatedResponse.json();
                createdPostUrls.push({ url: translatedResult.data.url, title: translatedResult.data.title });
                allTranslations[targetLangSlug] = translatedResult.data.id;
                updateStepStatus(`create_${lang}`, 'success', undefined, 100);
            }
        }
        
        setProgress(prev => ({...prev, product: 80}));
        // --- Step 4: Final Sync of all translation links ---
        if (Object.keys(allTranslations).length > 1) {
            updateStepStatus('sync_translations', 'processing', undefined, 50);
            const linkResponse = await fetch('/api/wordpress/posts/link-translations', { method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` }, body: JSON.stringify({ translations: allTranslations }) });
            if (!linkResponse.ok) { const errorResult = await linkResponse.json(); throw new Error(errorResult.message || 'Error al enlazar las traducciones.'); }
            updateStepStatus('sync_translations', 'success', undefined, 100);
        }

        setProgress({ images: 100, product: 100 });
        setProcessingState('finished');
        setFinalLinks(createdPostUrls);
        setSubmissionStatus('success');

    } catch (error: any) {
        const failedStep = steps.find(s => s.status === 'processing');
        if (failedStep) {
            updateStepStatus(failedStep.id, 'error', error.message);
        }
        toast({ title: 'Proceso Interrumpido', description: error.message, variant: 'destructive' });
        setProcessingState('error');
        setSubmissionStatus('error');
    }
  }, [productData, toast, steps]);


  useEffect(() => {
    if (currentStep === 4 && processingState === 'idle') {
      handleCreateProduct();
    }
  }, [currentStep, processingState, handleCreateProduct]);

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
        return <Step4Processing processingState={processingState} progress={progress} />;
      default:
        return <Step1DetailsPhotos productData={productData} updateProductData={updateProductData} isProcessing={isProcessing} />;
    }
  };
  
  const startOver = () => {
    setProductData(INITIAL_PRODUCT_DATA);
    setSteps([]);
    setFinalLinks([]);
    setSubmissionStatus('idle');
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
