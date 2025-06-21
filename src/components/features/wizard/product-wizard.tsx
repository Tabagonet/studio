
"use client";

import React, { useState } from 'react';
import { Step1DetailsPhotos } from './step-1-details-photos';
// Placeholder for future steps
// import { Step2Preview } from './step-2-preview'; 
// import { Step3Confirm } from './step-3-confirm';
import type { ProductData } from '@/lib/types';
import { INITIAL_PRODUCT_DATA } from '@/lib/constants';
import { Button } from '@/components/ui/button';

export function ProductWizard() {
  const [currentStep, setCurrentStep] = useState(1);
  const [productData, setProductData] = useState<ProductData>(INITIAL_PRODUCT_DATA);

  const updateProductData = (data: Partial<ProductData>) => {
    setProductData(prev => ({ ...prev, ...data }));
  };

  const nextStep = () => setCurrentStep(prev => prev + 1);
  const prevStep = () => setCurrentStep(prev => prev - 1);

  const renderStep = () => {
    switch (currentStep) {
      case 1:
        return <Step1DetailsPhotos productData={productData} updateProductData={updateProductData} />;
      case 2:
        return <div>Paso 2: Vista Previa (WIP)</div>;
      case 3:
        return <div>Paso 3: Confirmación (WIP)</div>;
      default:
        return <Step1DetailsPhotos productData={productData} updateProductData={updateProductData} />;
    }
  };

  return (
    <div className="space-y-8">
      {/* Add a simple step indicator here if needed */}
      {renderStep()}
      <div className="flex justify-between mt-8">
        <Button onClick={prevStep} disabled={currentStep === 1}>Anterior</Button>
        {/* In the future, the last step's button will be "Create Product" */}
        <Button onClick={nextStep} disabled={currentStep === 3}>Siguiente</Button>
      </div>
       <pre className="mt-4 p-4 bg-muted rounded-md text-xs overflow-auto">
        <code>{JSON.stringify(productData, null, 2)}</code>
       </pre>
    </div>
  );
}
