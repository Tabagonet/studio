
"use client";

import React, { useState, useCallback } from 'react';
import type { BlogPostData, SubmissionStep, SubmissionStatus, ProductPhoto } from '@/lib/types';
import { INITIAL_BLOG_DATA } from '@/lib/constants';
import { useToast } from '@/hooks/use-toast';
import { auth } from '@/lib/firebase';
import { ArrowLeft, ArrowRight, Rocket } from 'lucide-react';
import { Button } from '@/components/ui/button';

import { Step1Content } from './step-1-content';
import { Step2Preview } from './step-2-preview';
import { Step3Results } from './step-3-results';
import { Card } from '@/components/ui/card';

const LANG_CODE_MAP: { [key: string]: string } = {
    'Spanish': 'es',
    'English': 'en',
    'French': 'fr',
    'German': 'de',
    'Portuguese': 'pt',
};

export function BlogCreator() {
  const [currentStep, setCurrentStep] = useState(1);
  const [postData, setPostData] = useState<BlogPostData>(INITIAL_BLOG_DATA);
  
  const [submissionStatus, setSubmissionStatus] = useState<SubmissionStatus>('idle');
  const [steps, setSteps] = useState<SubmissionStep[]>([]);
  const [finalLinks, setFinalLinks] = useState<{ url: string; title: string }[]>([]);

  const { toast } = useToast();

  const updatePostData = useCallback((data: Partial<BlogPostData>) => {
    setPostData(prev => ({ ...prev, ...data }));
  }, []);

  const updateStepStatus = (id: string, status: SubmissionStep['status'], error?: string) => {
    setSteps(prevSteps => 
      prevSteps.map(step => 
        step.id === id ? { ...step, status, error } : step
      )
    );
  };

  const handleCreatePost = async () => {
    setCurrentStep(3); // Move to the results/processing screen
    
    const initialSteps: SubmissionStep[] = [];
    if (postData.featuredImage?.file) {
      initialSteps.push({ id: 'upload_image', name: 'Subiendo imagen destacada', status: 'pending' });
    }
    initialSteps.push({ id: 'create_original', name: `Creando entrada original (${postData.sourceLanguage})`, status: 'pending' });
    postData.targetLanguages.forEach(lang => {
        initialSteps.push({ id: `translate_${lang}`, name: `Traduciendo a ${lang}`, status: 'pending' });
        initialSteps.push({ id: `create_${lang}`, name: `Creando entrada en ${lang}`, status: 'pending' });
    });
    if (postData.targetLanguages.length > 0) {
        initialSteps.push({ id: 'sync_translations', name: 'Sincronizando enlaces de traducción', status: 'pending' });
    }
    setSteps(initialSteps);
    setSubmissionStatus('processing');
    setFinalLinks([]);

    const user = auth.currentUser;
    if (!user) {
        toast({ title: 'Error', description: 'No autenticado.', variant: 'destructive' });
        setSubmissionStatus('error');
        return;
    }
    const token = await user.getIdToken();
    let finalPostData = { ...postData };
    let createdPostUrls: { url: string; title: string }[] = [];
    const allTranslations: { [key: string]: number } = {};

    try {
        // --- Step 1: Upload Image (if necessary) ---
        if (postData.featuredImage?.file) {
            updateStepStatus('upload_image', 'processing');
            const formData = new FormData();
            formData.append('imagen', postData.featuredImage.file!);
            const uploadResponse = await fetch('/api/upload-image', { method: 'POST', headers: { 'Authorization': `Bearer ${token}` }, body: formData });
            if (!uploadResponse.ok) {
                const errorData = await uploadResponse.json();
                throw new Error(errorData.error || 'Error al subir la imagen destacada');
            }
            const imageData = await uploadResponse.json();
            
            const currentImage = finalPostData.featuredImage;
            if (currentImage) {
                 const updatedImage: ProductPhoto = {
                    ...currentImage,
                    uploadedUrl: imageData.url,
                    uploadedFilename: imageData.filename_saved_on_server,
                    file: undefined // Clear the file object after upload
                 };
                 finalPostData = { ...finalPostData, featuredImage: updatedImage };
            }

            updateStepStatus('upload_image', 'success');
        }

        // --- Step 2: Create Original Post ---
        updateStepStatus('create_original', 'processing');
        const sourceLangSlug = LANG_CODE_MAP[postData.sourceLanguage] || 'en';
        const originalPayload = { 
            postData: finalPostData, 
            lang: sourceLangSlug,
        };
        const originalResponse = await fetch('/api/wordpress/posts', { method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` }, body: JSON.stringify(originalPayload) });
        if (!originalResponse.ok) {
            const errorData = await originalResponse.json();
            throw new Error(errorData.error || `Error al crear la entrada original`);
        }
        const originalResult = await originalResponse.json();
        createdPostUrls.push({ url: originalResult.url, title: originalResult.title });
        allTranslations[sourceLangSlug] = originalResult.id;
        updateStepStatus('create_original', 'success');
        
        // --- Step 3: Create Translations ---
        for (const lang of postData.targetLanguages) {
            // a. Translate content
            updateStepStatus(`translate_${lang}`, 'processing');
            const contentToTranslate = { title: postData.title, content: postData.content };
            const translateResponse = await fetch('/api/translate', { method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` }, body: JSON.stringify({ contentToTranslate, targetLanguage: lang }) });
            if (!translateResponse.ok) throw new Error(`Error al traducir a ${lang}`);
            const { content: translatedContent } = await translateResponse.json();
            updateStepStatus(`translate_${lang}`, 'success');

            // b. Create translated post
            updateStepStatus(`create_${lang}`, 'processing');
            const translatedPostData = { ...finalPostData, title: translatedContent.title, content: translatedContent.content };
            const targetLangSlug = LANG_CODE_MAP[lang] || lang.toLowerCase().substring(0, 2);
            
            const translatedPayload = { 
                postData: translatedPostData, 
                lang: targetLangSlug,
            };
            const translatedResponse = await fetch('/api/wordpress/posts', { method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` }, body: JSON.stringify(translatedPayload) });
            if (!translatedResponse.ok) {
                 const errorData = await translatedResponse.json();
                 throw new Error(errorData.error || `Error al crear la entrada en ${lang}`);
            }
            const translatedResult = await translatedResponse.json();
            createdPostUrls.push({ url: translatedResult.url, title: translatedResult.title });
            allTranslations[targetLangSlug] = translatedResult.id;
            updateStepStatus(`create_${lang}`, 'success');
        }
        
        // --- Step 4: Final Sync of all translation links ---
        if (Object.keys(allTranslations).length > 1) {
            updateStepStatus('sync_translations', 'processing');
            
            const linkResponse = await fetch('/api/wordpress/posts/link-translations', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify({ translations: allTranslations })
            });

            if (!linkResponse.ok) {
                const errorResult = await linkResponse.json();
                throw new Error(errorResult.message || 'Error al enlazar las traducciones.');
            }
            updateStepStatus('sync_translations', 'success');
        }


        setFinalLinks(createdPostUrls);
        setSubmissionStatus('success');

    } catch (error: any) {
        const failedStep = steps.find(s => s.status === 'processing');
        if (failedStep) {
            updateStepStatus(failedStep.id, 'error', error.message);
        }
        toast({ title: 'Proceso Interrumpido', description: error.message, variant: 'destructive' });
        setSubmissionStatus('error');
    }
  };


  const nextStep = () => setCurrentStep(prev => Math.min(prev + 1, 2));
  const prevStep = () => setCurrentStep(prev => Math.max(prev - 1, 1));
  const startOver = () => {
      setPostData(INITIAL_BLOG_DATA);
      setSubmissionStatus('idle');
      setSteps([]);
      setFinalLinks([]);
      setCurrentStep(1);
  };
  
  if (currentStep === 3) {
      return <Step3Results status={submissionStatus} steps={steps} finalLinks={finalLinks} onStartOver={startOver} />;
  }

  return (
    <div className="space-y-8">
      {currentStep === 1 && <Step1Content postData={postData} updatePostData={updatePostData} />}
      {currentStep === 2 && <Step2Preview postData={postData} />}
      
      <Card className="mt-8">
        <div className="flex justify-between p-4">
          <Button onClick={prevStep} disabled={currentStep === 1}>
            <ArrowLeft className="mr-2 h-4 w-4" />
            Anterior
          </Button>

          {currentStep === 1 ? (
            <Button onClick={nextStep}>
              Previsualizar Entrada
              <ArrowRight className="ml-2 h-4 w-4" />
            </Button>
          ) : (
            <Button onClick={handleCreatePost}>
              <Rocket className="mr-2 h-4 w-4" />
              Crear Entrada(s)
            </Button>
          )}
        </div>
      </Card>
    </div>
  );
}
