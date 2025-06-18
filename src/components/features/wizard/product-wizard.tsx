
"use client";

import React, { useState, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { WIZARD_STEPS, INITIAL_PRODUCT_DATA } from "@/lib/constants";
import type { ProductData, ProcessingStatusEntry, WizardProductContext } from '@/lib/types';
import { Step1DetailsPhotos } from "./step-1-details-photos";
import { Step2Preview } from "./step-2-preview";
import { Step3Confirm } from "./step-3-confirm";
import { Progress } from "@/components/ui/progress";
import { useToast } from '@/hooks/use-toast';
import { db, auth } from '@/lib/firebase';
import { getIdToken } from 'firebase/auth'; 
import { doc, serverTimestamp, collection, writeBatch, Timestamp } from 'firebase/firestore';
import { useRouter } from 'next/navigation';

export function ProductWizard() {
  const [currentStep, setCurrentStep] = useState(0);
  const [productData, setProductData] = useState<ProductData>(INITIAL_PRODUCT_DATA);
  const [isProcessing, setIsProcessing] = useState(false);
  const { toast } = useToast();
  const router = useRouter();

  const updateProductData = useCallback((data: Partial<ProductData>) => {
    setProductData((prev) => ({ ...prev, ...data }));
  }, []);

  const nextStep = () => {
    if (currentStep < WIZARD_STEPS.length - 1) {
      setCurrentStep(currentStep + 1);
      window.scrollTo(0, 0);
    }
  };

  const prevStep = () => {
    if (currentStep > 0) {
      setCurrentStep(currentStep - 1);
      window.scrollTo(0, 0);
    }
  };

  const getAuthToken = async (): Promise<string | null> => {
    if (auth.currentUser) {
      try {
        return await getIdToken(auth.currentUser);
      } catch (error) {
        console.error("Error getting auth token:", error);
        toast({
          title: "Error de Autenticación",
          description: "No se pudo obtener el token de autenticación.",
          variant: "destructive",
        });
        return null;
      }
    }
    toast({
        title: "Usuario No Autenticado",
        description: "Por favor, inicia sesión para continuar.",
        variant: "destructive",
    });
    return null;
  };

  const handleSubmitProduct = async () => {
    setIsProcessing(true);
    const wizardJobId = `wizard_${Date.now()}`;
    
    if (!auth.currentUser) {
      toast({ title: "Usuario No Autenticado", variant: "destructive" });
      setIsProcessing(false);
      router.push('/login');
      return;
    }
    const userId = auth.currentUser.uid;

    if (productData.photos.length === 0) {
        toast({ title: "No hay imágenes", description: "Sube al menos una imagen.", variant: "destructive" });
        setIsProcessing(false);
        return;
    }

    const authToken = await getAuthToken();
    if (!authToken) {
        setIsProcessing(false);
        return;
    }

    const uploadedPhotoDetails: { name: string; relativePath: string; originalPhotoId: string }[] = [];
    let allUploadsSuccessful = true;

    for (const photo of productData.photos) {
      const formData = new FormData();
      formData.append('file', photo.file); 
      formData.append('batchId', wizardJobId); // Use wizardJobId as batchId for local storage
      formData.append('fileName', photo.name); // Send original filename

      try {
        const response = await fetch('/api/upload-image-local', { // Use new local upload endpoint
          method: 'POST',
          headers: { 'Authorization': `Bearer ${authToken}` },
          body: formData,
        });
        
        const responseText = await response.text();
        let result;
        try {
            result = JSON.parse(responseText);
        } catch (parseError) {
            console.error(`[Wizard] Failed to parse JSON from /api/upload-image-local for ${photo.name}. Response text:`, responseText.substring(0, 500));
            throw new Error(`Respuesta no JSON de /api/upload-image-local para ${photo.name}.`);
        }

        if (!response.ok || result.success !== true || !result.relativePath) {
          console.error(`[Wizard] /api/upload-image-local for ${photo.name} failed or invalid response. Status: ${response.status}, Result:`, result);
          throw new Error(result.error || `La subida local de ${photo.name} falló.`);
        }
        uploadedPhotoDetails.push({ name: photo.file.name, relativePath: result.relativePath, originalPhotoId: photo.id });
        
        // Update ProductPhoto in state with localPath if needed by other components, though not strictly necessary here
        // updateProductData({ photos: productData.photos.map(p => p.id === photo.id ? {...p, localPath: result.relativePath} : p) });

      } catch (error) {
        console.error(`[Wizard] Error al subir ${photo.file.name} localmente:`, error);
        toast({ title: `Error al Subir ${photo.file.name}`, description: (error as Error).message, variant: "destructive" });
        allUploadsSuccessful = false;
        break;
      }
    }

    if (!allUploadsSuccessful) {
      setIsProcessing(false);
      // Consider cleanup of already uploaded files for this wizardJobId if some failed
      return;
    }

    const firestoreBatch = writeBatch(db);
    try {
      for (const uploadedPhoto of uploadedPhotoDetails) {
        const photoDocRef = doc(collection(db, 'processing_status'));
        const originalPhotoData = productData.photos.find(p => p.id === uploadedPhoto.originalPhotoId);

        const productContextForEntry: WizardProductContext = {
            name: productData.name,
            sku: productData.sku,
            productType: productData.productType,
            regularPrice: productData.regularPrice,
            salePrice: productData.salePrice,
            category: productData.category,
            keywords: productData.keywords,
            attributes: productData.attributes,
            shortDescription: productData.shortDescription, 
            longDescription: productData.longDescription, 
            isPrimary: originalPhotoData?.isPrimary || false,
        };

        // Storing relative path from server's public dir
        const entry: Omit<ProcessingStatusEntry, 'id' | 'updatedAt'> = {
          userId: userId,
          batchId: wizardJobId,
          imageName: uploadedPhoto.name,
          originalStoragePath: uploadedPhoto.relativePath, 
          originalDownloadUrl: uploadedPhoto.relativePath, 
          status: "uploaded",
          uploadedAt: serverTimestamp() as Timestamp,
          progress: 0,
          productContext: productContextForEntry
        };
        firestoreBatch.set(photoDocRef, entry);
      }
      await firestoreBatch.commit();
    } catch (error) {
      console.error("[Wizard] Error al escribir en Firestore:", error);
      toast({ title: "Error de Base de Datos", description: "No se pudieron registrar las imágenes.", variant: "destructive" });
      setIsProcessing(false);
      return;
    }

    try {
      const response = await fetch('/api/process-photos', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ batchId: wizardJobId, userId: userId }), 
      });
      
      const responseText = await response.text();
      let resultData;
      try {
          resultData = JSON.parse(responseText);
      } catch (e) {
          throw new Error(`Respuesta no JSON del servidor al iniciar procesamiento: ${responseText.substring(0,100)}`);
      }

      if (!response.ok) {
        throw new Error(resultData.error || resultData.message || `Error del servidor al iniciar procesamiento: ${response.status}`);
      }

      toast({
        title: "Producto Enviado a Procesamiento",
        description: "Tu producto se está procesando. Serás redirigido para ver el progreso.",
        duration: 7000,
      });

      setCurrentStep(0);
      setProductData(INITIAL_PRODUCT_DATA);
      router.push(`/batch?batchId=${wizardJobId}`); // Redirect to batch page to see progress

    } catch (error) {
      console.error("[Wizard] Error al iniciar el procesamiento backend:", error);
      toast({ title: "Error de Procesamiento", description: (error as Error).message, variant: "destructive" });
    } finally {
      setIsProcessing(false);
    }
  };

  const progressPercentage = ((currentStep + 1) / WIZARD_STEPS.length) * 100;

  return (
    <div className="space-y-8">
      <div className="mb-8">
        <Progress value={progressPercentage} className="w-full h-2 mb-2" />
        <div className="flex justify-between text-sm text-muted-foreground">
          {WIZARD_STEPS.map((step, index) => (
            <div key={step.id} className={`text-center ${index === currentStep ? 'font-semibold text-primary' : ''}`}>
              <span className={`inline-block h-6 w-6 rounded-full text-xs leading-6 text-center mr-1 ${index <= currentStep ? 'bg-primary text-primary-foreground' : 'bg-gray-200'}`}>
                {step.id}
              </span>
              {step.name}
            </div>
          ))}
        </div>
      </div>

      {currentStep === 0 && (
        <Step1DetailsPhotos
          productData={productData}
          updateProductData={updateProductData}
        />
      )}
      {currentStep === 1 && (
        <Step2Preview productData={productData} updateProductData={updateProductData} />
      )}
      {currentStep === 2 && (
        <Step3Confirm productData={productData} isProcessing={isProcessing} />
      )}

      <div className="flex justify-between pt-6 border-t">
        <Button variant="outline" onClick={prevStep} disabled={currentStep === 0 || isProcessing}>
          Anterior
        </Button>
        {currentStep < WIZARD_STEPS.length - 1 ? (
          <Button onClick={nextStep} disabled={isProcessing || (currentStep === 0 && productData.photos.length === 0) }>Siguiente</Button>
        ) : (
          <Button onClick={handleSubmitProduct} disabled={isProcessing || productData.photos.length === 0}>
            {isProcessing ? "Procesando..." : "Confirmar y Procesar Producto"}
          </Button>
        )}
      </div>
    </div>
  );
}
