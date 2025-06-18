"use client";

import React, { useState, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { WIZARD_STEPS, INITIAL_PRODUCT_DATA } from "@/lib/constants";
import type { ProductData } from "@/lib/types";
import { Step1DetailsPhotos } from "./step-1-details-photos";
import { Step2Preview } from "./step-2-preview";
import { Step3Confirm } from "./step-3-confirm";
import { Progress } from "@/components/ui/progress";
import { useToast } from "@/hooks/use-toast";

export function ProductWizard() {
  const [currentStep, setCurrentStep] = useState(0);
  const [productData, setProductData] = useState<ProductData>(INITIAL_PRODUCT_DATA);
  const [isProcessing, setIsProcessing] = useState(false);
  const { toast } = useToast();

  const updateProductData = useCallback((data: Partial<ProductData>) => {
    setProductData((prev) => ({ ...prev, ...data }));
  }, []);

  const nextStep = () => {
    if (currentStep < WIZARD_STEPS.length - 1) {
      setCurrentStep(currentStep + 1);
    }
  };

  const prevStep = () => {
    if (currentStep > 0) {
      setCurrentStep(currentStep - 1);
    }
  };

  const handleSubmitProduct = async () => {
    setIsProcessing(true);
    // Simulate API call for product creation
    console.log("Submitting product data:", productData);

    // Simulate background processing
    // In a real app, this would call an API endpoint that starts a background job
    // e.g., await fetch('/api/process-product', { method: 'POST', body: JSON.stringify(productData) });
    
    // For now, simulate with a timeout
    await new Promise(resolve => setTimeout(resolve, 3000));

    setIsProcessing(false);
    toast({
      title: "Producto en Proceso",
      description: "El producto se está creando en segundo plano. Recibirás una notificación al finalizar.",
      variant: "default",
    });
    // Reset wizard or redirect
    setCurrentStep(0);
    setProductData(INITIAL_PRODUCT_DATA);
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
          <Button onClick={nextStep} disabled={isProcessing}>Siguiente</Button>
        ) : (
          <Button onClick={handleSubmitProduct} disabled={isProcessing}>
            {isProcessing ? "Procesando..." : "Confirmar y Crear Producto"}
          </Button>
        )}
      </div>
    </div>
  );
}
