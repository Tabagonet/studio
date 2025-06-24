
"use client";

import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { SearchCheck, Loader2, BrainCircuit, ArrowLeft } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { auth } from "@/lib/firebase";
import { SeoPageListTable } from '@/components/features/seo/page-list-table';
import { AnalysisView, type AnalysisResult } from '@/components/features/seo/analysis-view';


export interface ContentItem {
  id: number;
  title: string;
  type: 'Post' | 'Page';
  link: string;
}

export default function SeoOptimizerPage() {
  const [contentList, setContentList] = useState<ContentItem[]>([]);
  const [isLoadingList, setIsLoadingList] = useState(true);

  const [isLoadingAnalysis, setIsLoadingAnalysis] = useState(false);
  const [analysis, setAnalysis] = useState<AnalysisResult | null>(null);
  const [selectedPage, setSelectedPage] = useState<ContentItem | null>(null);
  const [error, setError] = useState<string | null>(null);
  
  const { toast } = useToast();
  
  useEffect(() => {
    const fetchContentList = async () => {
        const user = auth.currentUser;
        if (!user) {
            setIsLoadingList(false);
            return;
        };
        try {
            const token = await user.getIdToken();
            const response = await fetch('/api/wordpress/content-list', {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            if (response.ok) {
                const data = await response.json();
                setContentList(data.content);
            } else {
                const errorData = await response.json();
                setError(errorData.error || 'No se pudo cargar el contenido del sitio.');
            }
        } catch (err: any) {
            setError(err.message);
        } finally {
            setIsLoadingList(false);
        }
    };
    fetchContentList();
  }, []);


  const handleAnalyze = async (page: ContentItem) => {
    let fullUrl = page.link.trim();
    if (!/^https?:\/\//i.test(fullUrl)) {
        fullUrl = 'https://' + fullUrl;
    }

    setIsLoadingAnalysis(true);
    setError(null);
    setAnalysis(null);
    setSelectedPage(page);

    const user = auth.currentUser;
    if (!user) {
      toast({ title: "Autenticación Requerida", variant: "destructive" });
      setIsLoadingAnalysis(false);
      return;
    }

    try {
      const token = await user.getIdToken();
      const response = await fetch('/api/seo/analyze-url', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ url: fullUrl })
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || 'Ocurrió un error desconocido');
      }

      setAnalysis(result);
    } catch (err: any) {
      setError(err.message);
      toast({ title: "Error en el Análisis", description: err.message, variant: "destructive" });
    } finally {
      setIsLoadingAnalysis(false);
    }
  };

  const handleBackToList = () => {
      setSelectedPage(null);
      setAnalysis(null);
      setError(null);
  }

  const renderContent = () => {
    if (isLoadingList) {
      return (
        <div className="flex flex-col items-center justify-center text-center p-12 border border-dashed rounded-lg">
          <Loader2 className="h-12 w-12 animate-spin text-primary mb-4" />
          <p className="text-lg font-semibold text-muted-foreground">Cargando páginas y entradas de tu sitio...</p>
        </div>
      );
    }
    
    if (selectedPage) {
        return (
            <div className="space-y-4">
                <Button variant="outline" onClick={handleBackToList}>
                    <ArrowLeft className="mr-2 h-4 w-4" />
                    Volver al listado
                </Button>
                {isLoadingAnalysis && (
                     <div className="flex flex-col items-center justify-center text-center p-12 border border-dashed rounded-lg">
                        <Loader2 className="h-12 w-12 animate-spin text-primary mb-4" />
                        <p className="text-lg font-semibold text-muted-foreground">Analizando {selectedPage.title}...</p>
                        <p className="text-sm text-muted-foreground">Estamos leyendo el contenido y consultando a la IA.</p>
                    </div>
                )}
                {error && !isLoadingAnalysis && (
                    <Alert variant="destructive">
                      <AlertTitle>Error en el Análisis</AlertTitle>
                      <AlertDescription>{error}</AlertDescription>
                    </Alert>
                )}
                {analysis && !isLoadingAnalysis && (
                    <AnalysisView analysis={analysis} />
                )}
            </div>
        )
    }

    return <SeoPageListTable data={contentList} onAnalyze={handleAnalyze} />;
  }

  return (
    <div className="container mx-auto py-8 space-y-6">
      <Card>
        <CardHeader>
          <div className="flex items-center space-x-3">
            <SearchCheck className="h-8 w-8 text-primary" />
            <div>
              <CardTitle>Optimizador SEO</CardTitle>
              <CardDescription>Selecciona una página o entrada de tu sitio para obtener un informe técnico y sugerencias de mejora con IA.</CardDescription>
            </div>
          </div>
        </CardHeader>
      </Card>
      
      {renderContent()}
    </div>
  );
}
