
"use client";

import React, { useState, useEffect, useCallback } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { SearchCheck, Loader2, BrainCircuit, ArrowLeft } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { auth, onAuthStateChanged } from "@/lib/firebase";
import { SeoPageListTable } from '@/components/features/seo/page-list-table';
import { AnalysisView, type AnalysisResult } from '@/components/features/seo/analysis-view';
import Link from 'next/link';
import { Input } from '@/components/ui/input';

export interface ContentItem {
  id: number;
  title: string;
  type: 'Post' | 'Page';
  link: string;
  status: 'publish' | 'draft' | 'pending' | 'private' | 'future';
}

export default function SeoOptimizerPage() {
  const [contentList, setContentList] = useState<ContentItem[]>([]);
  const [isLoadingList, setIsLoadingList] = useState(true);

  const [isLoadingAnalysis, setIsLoadingAnalysis] = useState(false);
  const [analysis, setAnalysis] = useState<AnalysisResult | null>(null);
  const [selectedPage, setSelectedPage] = useState<ContentItem | null>(null);
  const [error, setError] = useState<string | null>(null);
  
  const [manualUrl, setManualUrl] = useState('');

  // New filter states
  const [typeFilter, setTypeFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  
  const { toast } = useToast();
  
  const fetchContentList = useCallback(async () => {
    setIsLoadingList(true);
    setError(null);
    const user = auth.currentUser;
    if (!user) {
        setError("Debes iniciar sesión para usar esta función.");
        setIsLoadingList(false);
        return;
    };
    try {
        const token = await user.getIdToken();
        
        const params = new URLSearchParams({
            type: typeFilter,
            status: statusFilter,
        });
        
        const response = await fetch(`/api/wordpress/content-list?${params.toString()}`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });

        if (response.ok) {
            const data = await response.json();
            setContentList(data.content);
        } else {
            const errorData = await response.json();
            setError(errorData.error || 'No se pudo cargar el contenido del sitio.');
            setContentList([]); // Clear list on error
        }
    } catch (err: any) {
        setError(err.message);
        setContentList([]); // Clear list on error
    } finally {
        setIsLoadingList(false);
    }
  }, [typeFilter, statusFilter]);

  useEffect(() => {
    const handleAuth = (user: import('firebase/auth').User | null) => {
        if (user) {
            fetchContentList();
        } else {
            setIsLoadingList(false);
            setError("Debes iniciar sesión para usar esta función.");
        }
    };
    
    const unsubscribe = onAuthStateChanged(auth, handleAuth);
    // Listen for connection changes and refetch
    window.addEventListener('connections-updated', fetchContentList);
    
    return () => {
        unsubscribe();
        window.removeEventListener('connections-updated', fetchContentList);
    }
  }, [fetchContentList]);


  const handleAnalyze = async (page: ContentItem) => {
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
        body: JSON.stringify({ url: page.link })
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
  
  const handleManualAnalyze = () => {
      if (!manualUrl) {
          toast({ title: "Introduce una URL para analizar", variant: "destructive" });
          return;
      }
      // Add https if missing
      const fullUrl = manualUrl.startsWith('http') ? manualUrl : `https://${manualUrl}`;
      const dummyItem: ContentItem = {
          id: Date.now(),
          title: fullUrl,
          type: 'Page',
          link: fullUrl,
          status: 'publish',
      };
      handleAnalyze(dummyItem);
  };

  const handleBackToList = () => {
      setSelectedPage(null);
      setAnalysis(null);
      setError(null); // Clear analysis-specific errors
      fetchContentList(); // Re-fetch the list
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
                    Volver a la lista
                </Button>
                {isLoadingAnalysis && (
                     <div className="flex flex-col items-center justify-center text-center p-12 border border-dashed rounded-lg">
                        <Loader2 className="h-12 w-12 animate-spin text-primary mb-4" />
                        <p className="text-lg font-semibold text-muted-foreground">Analizando {selectedPage.title}...</p>
                        <p className="text-sm text-muted-foreground">Estamos leyendo el contenido y consultando a la IA.</p>
                    </div>
                )}
                {analysis && !isLoadingAnalysis && (
                    <AnalysisView analysis={analysis} />
                )}
                {error && !isLoadingAnalysis && (
                    <Alert variant="destructive">
                      <AlertTitle>Error en el Análisis</AlertTitle>
                      <AlertDescription>{error}</AlertDescription>
                    </Alert>
                )}
            </div>
        )
    }

    return (
      <Card>
        <CardHeader>
          <CardTitle>Selecciona Contenido para Analizar</CardTitle>
          <CardDescription>
            Usa los filtros para encontrar una página o entrada específica de tu sitio, o introduce una URL manualmente.
          </CardDescription>
        </CardHeader>
        <CardContent>
            {error && !isLoadingList && (
                 <Alert variant="destructive" className="mb-4">
                    <AlertTitle>No se pudo cargar la lista de contenido</AlertTitle>
                    <AlertDescription>
                        {error} Revisa que la API de WordPress esté configurada en <Link href="/settings/connections" className="underline font-semibold">Ajustes</Link>.
                    </AlertDescription>
                </Alert>
            )}
             <div className="flex flex-col sm:flex-row gap-2 items-center mb-6">
                <Input 
                    type="url"
                    placeholder="O introduce cualquier URL pública..."
                    value={manualUrl}
                    onChange={(e) => setManualUrl(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && handleManualAnalyze()}
                    className="flex-grow"
                />
                <Button onClick={handleManualAnalyze} disabled={isLoadingAnalysis} className="w-full sm:w-auto">
                    {isLoadingAnalysis ? <Loader2 className="mr-2 h-4 w-4 animate-spin"/> : <SearchCheck className="mr-2 h-4 w-4" />}
                    Analizar URL
                </Button>
            </div>
            {!error && (
              <SeoPageListTable 
                data={contentList} 
                onAnalyze={handleAnalyze} 
                typeFilter={typeFilter}
                onTypeFilterChange={setTypeFilter}
                statusFilter={statusFilter}
                onStatusFilterChange={setStatusFilter}
              />
            )}
        </CardContent>
      </Card>
    );
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
