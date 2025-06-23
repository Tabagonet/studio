
"use client";

import React, { useState, useCallback } from 'react';
import type { BlogPostData } from '@/lib/types';
import { INITIAL_BLOG_DATA } from '@/lib/constants';
import { useToast } from '@/hooks/use-toast';
import { auth } from '@/lib/firebase';
import { ArrowLeft, ArrowRight, Rocket } from 'lucide-react';
import { Button } from '@/components/ui/button';

import { Step1Content } from './step-1-content';
import { Step2Preview } from './step-2-preview';
import { Step3Results } from './step-3-results';
import { Card } from '@/components/ui/card';

export function BlogCreator() {
  const [currentStep, setCurrentStep] = useState(1);
  const [postData, setPostData] = useState<BlogPostData>(INITIAL_BLOG_DATA);
  const [createdPosts, setCreatedPosts] = useState<{ url: string; title: string }[]>([]);
  const [isCreating, setIsCreating] = useState(false);
  const { toast } = useToast();

  const updatePostData = useCallback((data: Partial<BlogPostData>) => {
    setPostData(prev => ({ ...prev, ...data }));
  }, []);

  const handleCreatePost = async () => {
    if (!postData.title || !postData.content) {
        toast({ title: "Faltan datos", description: "El título y el contenido son obligatorios.", variant: "destructive" });
        return;
    }
    setIsCreating(true);
    setCreatedPosts([]);
    
    try {
        const user = auth.currentUser;
        if (!user) throw new Error("No autenticado.");
        const token = await user.getIdToken();

        const response = await fetch('/api/wordpress/posts', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
            body: JSON.stringify(postData)
        });

        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.error || "No se pudo crear la entrada.");
        }

        const result = await response.json();
        setCreatedPosts(result.createdPosts);
    } catch (error: any) {
        toast({ title: "Error al Crear", description: error.message, variant: "destructive" });
    } finally {
        setIsCreating(false);
    }
  };

  const nextStep = () => setCurrentStep(prev => Math.min(prev + 1, 2));
  const prevStep = () => setCurrentStep(prev => Math.max(prev - 1, 1));
  const startOver = () => {
      setPostData(INITIAL_BLOG_DATA);
      setCreatedPosts([]);
      setIsCreating(false);
      setCurrentStep(1);
  };
  
  if (isCreating || createdPosts.length > 0) {
      return <Step3Results isCreating={isCreating} createdPosts={createdPosts} onStartOver={startOver} />;
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
