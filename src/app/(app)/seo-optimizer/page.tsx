

"use client";

import React, { useState, useEffect, useCallback } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { SearchCheck, Loader2, BrainCircuit, ArrowLeft, Package, Newspaper, FileText, FileCheck2, Edit, AlertTriangle, Printer, RefreshCw } from "lucide-react";
import { useToast } from '@/hooks/use-toast';
import { auth, onAuthStateChanged } from "@/lib/firebase";
import { SeoPageListTable } from '@/components/features/seo/page-list-table';
import { AnalysisView } from '@/components/features/seo/analysis-view';
import Link from 'next/link';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import type { ContentStats, SeoAnalysisRecord, ContentItem } from '@/lib/types';


export default function SeoOptimizerPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { toast } = useToast();

  const [contentList, setContentList] = useState<ContentItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const [stats, setStats] = useState<ContentStats | null>(null);
  const [isLoadingStats, setIsLoadingStats] = useState(true);

  const [isLoadingAnalysis, setIsLoadingAnalysis] = useState(false);
  const [analysisRecord, setAnalysisRecord] = useState<SeoAnalysisRecord | null>(null);
  const [analysisHistory, setAnalysisHistory] = useState<SeoAnalysisRecord[]>([]);
  const [selectedPage, setSelectedPage] = useState<ContentItem | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loadingMessage, setLoadingMessage] = useState('');
  
  const [manualUrl, setManualUrl] = useState('');
  const [activeConnectionUrl, setActiveConnectionUrl] = useState('');

  const [scores, setScores] = useState<Record<number, number>>({});
  
  const [pagination, setPagination] = useState({ pageIndex: 0, pageSize: 20 });
  const [pageCount, setPageCount] = useState(0);

  const viewingId = searchParams.get('id');
  const viewingType = searchParams.get('type') || 'Page';

  const runAnalysis = useCallback(async (page: ContentItem, token: string) => {
    setIsLoadingAnalysis(true);
    setError(null);
    setAnalysisRecord(null);
    setSelectedPage(page);
    setLoadingMessage(`Analizando: ${page.title}...`);

    try {
        toast({ title: "Analizando con IA...", description: "Estamos leyendo la página y generando el informe SEO."});
        const response = await fetch('/api/seo/analyze-url', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
            body: JSON.stringify({ url: page.link, postId: page.id, postType: page.type }),
            cache: 'no-store', // Force re-fetching from the server, bypassing cache
        });
        const result: SeoAnalysisRecord = await response.json();
        if (!response.ok) throw new Error((result as any).error || 'Ocurrió un error desconocido');
        
        setAnalysisRecord(result);
        setScores(prev => ({...prev, [page.id]: result.score}));

        const historyResponse = await fetch(`/api/seo/history?url=${encodeURIComponent(page.link)}`, { 
            headers: { 'Authorization': `Bearer ${token}` },
            cache: 'no-store',
        });
        if (historyResponse.ok) setAnalysisHistory((await historyResponse.json()).history);
    } catch (err: any) {
        setError(err.message);
        toast({ title: "Error en el Análisis", description: err.message, variant: "destructive" });
    } finally {
        setIsLoadingAnalysis(false);
    }
  }, [toast]);

  const fetchReport = useCallback(async (page: ContentItem, token: string) => {
    setIsLoadingAnalysis(true);
    setLoadingMessage(`Cargando informe para ${page.title}...`);
    setError(null);
    setAnalysisRecord(null);
    setSelectedPage(page);

    try {
      const historyResponse = await fetch(`/api/seo/history?url=${encodeURIComponent(page.link)}`, { 
          headers: { 'Authorization': `Bearer ${token}` },
          cache: 'no-store',
      });
      if (!historyResponse.ok) throw new Error("No se pudo cargar el historial de análisis.");
      
      const historyData: { history: SeoAnalysisRecord[] } = await historyResponse.json();
      if (historyData.history && historyData.history.length > 0) {
        setAnalysisRecord(historyData.history[0]);
        setAnalysisHistory(historyData.history);
      } else {
        await runAnalysis(page, token);
      }
    } catch (err: any) {
      setError(err.message);
      toast({ title: "Error al cargar informe", description: err.message, variant: "destructive" });
    } finally {
      setIsLoadingAnalysis(false);
    }
  }, [toast, runAnalysis]);

  const fetchContentData = useCallback(async () => {
    setIsLoading(true);
    setIsLoadingStats(true);
    setError(null);
    const user = auth.currentUser;
    if (!user) {
        setError("Debes iniciar sesión para usar esta función.");
        setIsLoading(false);
        setIsLoadingStats(false);
        return;
    };
    try {
        const token = await user.getIdToken();
        const params = new URLSearchParams({
            page: (pagination.pageIndex + 1).toString(),
            per_page: pagination.pageSize.toString(),
        });
        
        const listPromise = fetch(`/api/wordpress/content-list?${params.toString()}`, { headers: { 'Authorization': `Bearer ${token}` } });
        const statsPromise = fetch('/api/wordpress/content-stats', { headers: { 'Authorization': `Bearer ${token}` } });
        const configPromise = fetch('/api/check-config', { headers: { 'Authorization': `Bearer ${token}` } });
        const scoresPromise = fetch('/api/seo/latest-scores', { headers: { 'Authorization': `Bearer ${token}` } });
        
        const [listResponse, statsResponse, configResponse, scoresResponse] = await Promise.all([listPromise, statsPromise, configPromise, scoresPromise]);

        let localContentList: ContentItem[] = [];
        if (listResponse.ok) {
            const listData = await listResponse.json();
            localContentList = listData.content;
            setContentList(localContentList);
            setPageCount(listData.totalPages);
        } else {
            const errorData = await listResponse.json();
            setError(errorData.error || 'No se pudo cargar el contenido del sitio.');
            setContentList([]);
        }
        
        if (statsResponse.ok) setStats(await statsResponse.json()); else setStats(null);
        if (configResponse.ok) setActiveConnectionUrl((await configResponse.json()).activeStoreUrl || '');

        if (scoresResponse.ok && localContentList.length > 0) {
            const scoresData = await scoresResponse.json();
            const scoresByUrl: Record<string, number> = scoresData.scores || {};
            const scoresById: Record<number, number> = {};

            const normalizeUrl = (url: string) => {
                try {
                    const parsed = new URL(url);
                    return `${parsed.protocol}//${parsed.hostname}${parsed.pathname.replace(/\/$/, '')}`;
                } catch { return url; }
            };
            
            const normalizedScoresMap = new Map<string, number>();
            for (const [url, score] of Object.entries(scoresByUrl)) {
                normalizedScoresMap.set(normalizeUrl(url), score);
            }

            localContentList.forEach(item => {
                const normalizedItemLink = normalizeUrl(item.link);
                if (normalizedScoresMap.has(normalizedItemLink)) {
                    scoresById[item.id] = normalizedScoresMap.get(normalizedItemLink)!;
                }
            });
            setScores(scoresById);
        } else {
            setScores({});
        }

    } catch (err: any) {
        setError(err.message);
        setContentList([]);
        setStats(null);
        setScores({});
    } finally {
        setIsLoading(false);
        setIsLoadingStats(false);
    }
  }, [pagination]);
  
  useEffect(() => {
    const handleAuth = (user: import('firebase/auth').User | null) => {
        if (user) {
            fetchContentData();
        } else {
            setIsLoading(false);
            setIsLoadingStats(false);
            setError("Debes iniciar sesión para usar esta función.");
        }
    };
    
    const unsubscribe = onAuthStateChanged(auth, handleAuth);
    
    const handleConnectionsUpdate = () => { if (auth.currentUser) fetchContentData() };
    window.addEventListener('connections-updated', handleConnectionsUpdate);
    
    return () => {
        unsubscribe();
        window.removeEventListener('connections-updated', handleConnectionsUpdate);
    };
  }, [fetchContentData]);
  
  useEffect(() => {
    const id = viewingId ? Number(viewingId) : null;
    const user = auth.currentUser;

    if (id && contentList.length > 0 && user) {
        if (!selectedPage || selectedPage.id !== id) {
            const pageToView = contentList.find(p => p.id === id && p.type === viewingType);
            if (pageToView) {
                user.getIdToken().then(token => fetchReport(pageToView, token));
            } else if (!isLoading) {
                 toast({ title: "Contenido no encontrado", description: "El contenido no se encontró en la conexión activa.", variant: "destructive" });
                 router.push('/seo-optimizer');
            }
        }
    } else if (!viewingId) {
        setSelectedPage(null);
        setAnalysisRecord(null);
    }
  }, [viewingId, viewingType, contentList, selectedPage, fetchReport, isLoading, router, toast]);

  const handleAnalyzePage = useCallback(async (page: ContentItem) => {
    const user = auth.currentUser;
    if (!user) {
        toast({ title: "Authentication Required", variant: "destructive" });
        return;
    }
    const token = await user.getIdToken();
    runAnalysis(page, token);
  }, [runAnalysis, toast]);

  const handleViewReport = useCallback((page: ContentItem) => {
    router.push(`/seo-optimizer?id=${page.id}&type=${page.type}`);
  }, [router]);

  const handleManualAnalyze = () => {
      let urlToUse = manualUrl || activeConnectionUrl;
      if (!urlToUse) {
          toast({ title: "Introduce una URL para analizar", description: "O conecta un sitio en los ajustes.", variant: "destructive" });
          return;
      }
      
      const fullUrl = urlToUse.startsWith('http') ? urlToUse : `https://${urlToUse}`;
      const dummyItem: ContentItem = {
          id: Date.now(),
          title: fullUrl,
          type: 'Page',
          link: fullUrl,
          status: 'publish',
          parent: 0,
          modified: new Date().toISOString(),
      };
      
      const user = auth.currentUser;
      if (!user) {
        toast({ title: "Autenticación Requerida", variant: "destructive" });
        return;
      }
      
      user.getIdToken().then(token => runAnalysis(dummyItem, token));
  };

  const handleBackToList = () => {
      router.push('/seo-optimizer');
  }
  
  const handleEditContent = (item: ContentItem) => {
    const url = `/seo-optimizer/edit/${item.id}?type=${item.type}`;
    router.push(url);
  };
  
  const handleSelectHistoryItem = (record: SeoAnalysisRecord) => {
    setAnalysisRecord(record);
    toast({
      title: "Informe Histórico Cargado",
      description: `Mostrando el análisis del ${new Date(record.createdAt).toLocaleDateString('es-ES', { day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' })}.`,
    });
  };

  const renderStats = () => {
      return (
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
              <Card>
                  <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2"><CardTitle className="text-sm font-medium">Contenido Total</CardTitle><Package className="h-4 w-4 text-muted-foreground" /></CardHeader>
                  <CardContent>{isLoadingStats ? <Skeleton className="h-8 w-16" /> : <div className="text-2xl font-bold">{stats?.totalContent ?? 'N/A'}</div>}</CardContent>
              </Card>
              <Card>
                  <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2"><CardTitle className="text-sm font-medium">Entradas (Posts)</CardTitle><Newspaper className="h-4 w-4 text-muted-foreground" /></CardHeader>
                  <CardContent>{isLoadingStats ? <Skeleton className="h-8 w-16" /> : <div className="text-2xl font-bold">{stats?.totalPosts ?? 'N/A'}</div>}</CardContent>
              </Card>
               <Card>
                  <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2"><CardTitle className="text-sm font-medium">Páginas</CardTitle><FileText className="h-4 w-4 text-muted-foreground" /></CardHeader>
                  <CardContent>{isLoadingStats ? <Skeleton className="h-8 w-16" /> : <div className="text-2xl font-bold">{stats?.totalPages ?? 'N/A'}</div>}</CardContent>
              </Card>
              <Card>
                  <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2"><CardTitle className="text-sm font-medium">Contenido por Idioma</CardTitle><FileCheck2 className="h-4 w-4 text-muted-foreground" /></CardHeader>
                  <CardContent>
                      {isLoadingStats ? <Skeleton className="h-8 w-24" /> : 
                       (stats && stats.languages && Object.keys(stats.languages).length > 0) ? (
                          <div className="text-sm font-bold flex flex-wrap gap-x-3 gap-y-1">
                             {Object.entries(stats.languages).map(([lang, count]) => (
                                <span key={lang} className="uppercase">{lang}: {count}</span>
                             ))}
                          </div>
                        ) : <div className="text-sm font-bold">N/A</div>
                      }
                  </CardContent>
              </Card>
          </div>
      )
  }

  const renderContent = () => {
    if (!viewingId) {
        return (
            <Card>
                <CardHeader>
                    <CardTitle>Selecciona Contenido para Analizar</CardTitle>
                    <CardDescription>
                        Elige una página o entrada de tu sitio, o introduce una URL externa para analizar.
                    </CardDescription>
                </CardHeader>
                <CardContent>
                    {error && !isLoading && (
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
                            placeholder={activeConnectionUrl ? `Analizar URL externa (por defecto: ${activeConnectionUrl})` : "Introduce cualquier URL pública..."}
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
                        scores={scores}
                        onAnalyzePage={handleAnalyzePage} 
                        onViewReport={handleViewReport}
                        pageCount={pageCount}
                        pagination={pagination}
                        setPagination={setPagination}
                      />
                    )}
                </CardContent>
            </Card>
        );
    }
    
    if (isLoadingAnalysis) {
        return (
            <div className="flex flex-col items-center justify-center text-center p-12 border border-dashed rounded-lg">
                <Loader2 className="h-12 w-12 animate-spin text-primary mb-4" />
                <p className="text-lg font-semibold text-muted-foreground">{loadingMessage}</p>
                <p className="text-sm text-muted-foreground">Por favor, espera un momento.</p>
            </div>
        );
    }
    
    if (analysisRecord && selectedPage) {
        return (
            <div className="space-y-4">
                <Button variant="outline" onClick={handleBackToList}>
                    <ArrowLeft className="mr-2 h-4 w-4" />
                    Volver a la lista
                </Button>
                <AnalysisView 
                    record={analysisRecord} 
                    item={selectedPage} 
                    onEdit={handleEditContent} 
                    onReanalyze={() => handleAnalyzePage(selectedPage)}
                    history={analysisHistory}
                    onSelectHistoryItem={handleSelectHistoryItem}
                    contentModifiedDate={selectedPage.modified}
                />
            </div>
        )
    }

     if (error && !isLoadingAnalysis) {
        return (
            <div className="space-y-4">
                 <Button variant="outline" onClick={handleBackToList}>
                    <ArrowLeft className="mr-2 h-4 w-4" />
                    Volver a la lista
                </Button>
                <Alert variant="destructive">
                    <AlertTitle>Error en el Análisis</AlertTitle>
                    <AlertDescription>{error}</AlertDescription>
                </Alert>
            </div>
        );
    }
    
    return null; // Fallback
  }

  const latestAnalysisId = analysisHistory[0]?.id;

  return (
    <div className="container mx-auto py-8 space-y-6">
      <Card>
        <CardHeader>
          <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
            <div className="flex items-center space-x-3">
              <SearchCheck className="h-8 w-8 text-primary" />
              <div>
                <CardTitle>
                  {selectedPage ? `Análisis de: ${selectedPage.title}` : 'Optimizador SEO'}
                </CardTitle>
                <CardDescription>
                   {selectedPage
                    ? 'Revisa el informe técnico y las sugerencias de la IA para mejorar esta página.'
                    : 'Selecciona una página o entrada de tu sitio para obtener un informe técnico y sugerencias de mejora con IA.'}
                </CardDescription>
              </div>
            </div>
             {latestAnalysisId && !selectedPage && (
                <Button asChild variant="outline">
                    <Link href={`/seo-optimizer/report?analysisId=${latestAnalysisId}`} target="_blank">
                        <Printer className="mr-2 h-4 w-4" />
                        Ver Último Informe
                    </Link>
                </Button>
              )}
          </div>
        </CardHeader>
      </Card>

      {!viewingId && renderStats()}
      
      {isLoading ? (
        <div className="flex flex-col items-center justify-center text-center p-12 border border-dashed rounded-lg">
          <Loader2 className="h-12 w-12 animate-spin text-primary mb-4" />
          <p className="text-lg font-semibold text-muted-foreground">Cargando contenido del sitio...</p>
        </div>
      ) : renderContent() }
    </div>
  );
}
