
"use client";

import React, { useState, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { WIZARD_STEPS, INITIAL_PRODUCT_DATA } from "@/lib/constants";
import type { ProductData, ProcessingStatusEntry, WizardProductContext } from "@/lib/types";
import { Step1DetailsPhotos } from "./step-1-details-photos";
import { Step2Preview } from "./step-2-preview";
import { Step3Confirm } from "./step-3-confirm";
import { Progress } from "@/components/ui/progress";
import { useToast } from "@/hooks/use-toast";
import { db } from '@/lib/firebase';
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

  const handleSubmitProduct = async () => {
    setIsProcessing(true);
    const wizardJobId = `wizard_${Date.now()}`;
    const userId = 'temp_user_id'; // TODO: Replace with actual authenticated user ID

    const uploadedPhotoDetails: { name: string; relativePath: string; originalPhotoId: string }[] = [];
    let allUploadsSuccessful = true;

    if (productData.photos.length === 0) {
        toast({
            title: "No hay imágenes",
            description: "Por favor, sube al menos una imagen para el producto.",
            variant: "destructive",
        });
        setIsProcessing(false);
        return;
    }

    for (const photo of productData.photos) {
      const formData = new FormData();
      formData.append('file', photo.file);
      formData.append('batchId', wizardJobId);
      formData.append('userId', userId);
      formData.append('fileName', photo.file.name);

      try {
        const response = await fetch('/api/upload-image-local', {
          method: 'POST',
          body: formData,
        });

        if (!response.ok) {
          const errorResult = await response.json();
          throw new Error(errorResult.error || `Error al subir ${photo.file.name}`);
        }
        const result = await response.json();
        uploadedPhotoDetails.push({ name: photo.file.name, relativePath: result.relativePath, originalPhotoId: photo.id });
      } catch (error) {
        console.error(`Error al subir ${photo.file.name} para el asistente:`, error);
        toast({
          title: `Error al Subir Imagen ${photo.file.name}`,
          description: (error as Error).message,
          variant: "destructive",
        });
        allUploadsSuccessful = false;
        break;
      }
    }

    if (!allUploadsSuccessful) {
      setIsProcessing(false);
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
            isPrimary: originalPhotoData?.isPrimary || false,
        };

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
      console.error("Error al escribir en Firestore para el asistente:", error);
      toast({
        title: "Error de Base de Datos",
        description: "No se pudieron registrar las imágenes para procesamiento.",
        variant: "destructive",
      });
      setIsProcessing(false);
      return;
    }

    try {
      const response = await fetch('/api/process-photos', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ batchId: wizardJobId }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || `Error del servidor: ${response.status}`);

      toast({
        title: "Producto Enviado a Procesamiento",
        description: "Las imágenes de tu producto se están procesando. Serás redirigido para ver el progreso.",
        duration: 7000,
      });

      setCurrentStep(0);
      setProductData(INITIAL_PRODUCT_DATA);
      router.push(`/batch?batchId=${wizardJobId}`);

    } catch (error) {
      console.error("Error al iniciar el procesamiento backend para el asistente:", error);
      toast({
        title: "Error de Procesamiento",
        description: "No se pudo iniciar el procesamiento de las imágenes del producto.",
        variant: "destructive",
      });
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
            {isProcessing ? "Procesando..." : "Confirmar y Procesar Imágenes"}
          </Button>
        )}
      </div>
    </div>
  );
}
