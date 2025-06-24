
"use client";

import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { SearchCheck, Loader2, LinkIcon, BrainCircuit, CheckCircle, XCircle, Image as ImageIcon, Heading1, ListTree } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { auth } from "@/lib/firebase";
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Skeleton } from '@/components/ui/skeleton';


interface AnalysisResult {
  title: string;
  metaDescription: string;
  h1: string;
  headings: { tag: string; text: string }[];
  images: { src: string; alt: string }[];
  aiAnalysis: {
    score: number;
    summary: string;
    positives: string[];
    improvements: string[];
  };
}

export default function SeoOptimizerPage() {
  const [url, setUrl] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isPreloading, setIsPreloading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [analysis, setAnalysis] = useState<AnalysisResult | null>(null);
  const { toast } = useToast();
  
  useEffect(() => {
    const fetchActiveUrl = async () => {
        const user = auth.currentUser;
        if (!user) {
            setIsPreloading(false);
            return;
        };
        try {
            const token = await user.getIdToken();
            const response = await fetch('/api/check-config', {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            if (response.ok) {
                const data = await response.json();
                if (data.activeStoreUrl) {
                    setUrl(data.activeStoreUrl);
                }
            }
        } catch (err) {
            console.error("Failed to fetch active URL", err);
        } finally {
            setIsPreloading(false);
        }
    };
    fetchActiveUrl();
  }, []);


  const handleAnalyze = async () => {
    if (!url) {
      toast({ title: "URL Requerida", description: "Por favor, introduce una URL para analizar.", variant: "destructive" });
      return;
    }
    
    let fullUrl = url.trim();
    if (!/^https?:\/\//i.test(fullUrl)) {
        fullUrl = 'https://' + fullUrl;
    }

    setIsLoading(true);
    setError(null);
    setAnalysis(null);

    const user = auth.currentUser;
    if (!user) {
      toast({ title: "Autenticación Requerida", variant: "destructive" });
      setIsLoading(false);
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
      setIsLoading(false);
    }
  };
  
  const imagesWithoutAlt = analysis ? analysis.images.filter(img => !img.alt).length : 0;
  const totalImages = analysis ? analysis.images.length : 0;

  return (
    <div className="container mx-auto py-8 space-y-6">
      <Card>
        <CardHeader>
          <div className="flex items-center space-x-3">
            <SearchCheck className="h-8 w-8 text-primary" />
            <div>
              <CardTitle>Optimizador SEO de Páginas</CardTitle>
              <CardDescription>Analiza cualquier URL de tu sitio para obtener un informe técnico y sugerencias de mejora con IA.</CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="flex flex-col sm:flex-row items-end gap-2">
          <div className="flex-grow w-full">
            <Label htmlFor="url-input">URL de la página a analizar</Label>
            {isPreloading ? (
                 <Skeleton className="h-10 w-full" />
            ) : (
                <Input 
                  id="url-input"
                  type="url"
                  placeholder="https://tu-sitio-web.com/tu-pagina-o-entrada/"
                  value={url}
                  onChange={(e) => setUrl(e.target.value)}
                  disabled={isLoading}
                  onKeyDown={(e) => { if (e.key === 'Enter') handleAnalyze(); }}
                />
            )}
          </div>
          <Button onClick={handleAnalyze} disabled={isLoading || isPreloading || !url} className="w-full sm:w-auto">
            {isLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <LinkIcon className="mr-2 h-4 w-4" />}
            {isLoading ? "Analizando..." : "Analizar URL"}
          </Button>
        </CardContent>
      </Card>
      
      {isLoading && (
          <div className="flex flex-col items-center justify-center text-center p-12 border border-dashed rounded-lg">
            <Loader2 className="h-12 w-12 animate-spin text-primary mb-4" />
            <p className="text-lg font-semibold text-muted-foreground">Analizando la página, esto puede tardar un momento...</p>
            <p className="text-sm text-muted-foreground">Estamos leyendo el contenido y consultando a la IA.</p>
        </div>
      )}
      
      {error && !isLoading && (
        <Alert variant="destructive">
          <AlertTitle>Error en el Análisis</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {analysis && !isLoading && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Columna Izquierda: Análisis IA */}
          <div className="lg:col-span-2 space-y-6">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2"><BrainCircuit className="h-6 w-6 text-primary" /> Análisis con IA</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="text-center">
                    <p className="text-sm text-muted-foreground">Puntuación SEO Estimada</p>
                    <p className="text-6xl font-bold text-primary">{analysis.aiAnalysis.score}/100</p>
                </div>
                 <div>
                    <h4 className="font-semibold mb-2">Resumen:</h4>
                    <p className="text-sm text-muted-foreground">{analysis.aiAnalysis.summary}</p>
                </div>
                 <div>
                    <h4 className="font-semibold mb-2 text-green-600">Puntos Fuertes:</h4>
                    <ul className="list-disc list-inside space-y-1 text-sm text-muted-foreground">
                        {analysis.aiAnalysis.positives.map((item, i) => <li key={i}>{item}</li>)}
                    </ul>
                </div>
                <div>
                    <h4 className="font-semibold mb-2 text-amber-600">Áreas de Mejora:</h4>
                     <ul className="list-disc list-inside space-y-1 text-sm text-muted-foreground">
                        {analysis.aiAnalysis.improvements.map((item, i) => <li key={i}>{item}</li>)}
                    </ul>
                </div>
              </CardContent>
            </Card>
            
             <Card>
              <CardHeader>
                 <CardTitle className="flex items-center gap-2"><ListTree className="h-6 w-6 text-primary" /> Estructura de Encabezados</CardTitle>
                 <CardDescription>Una buena jerarquía de encabezados (H1, H2, H3...) ayuda a Google a entender tu contenido.</CardDescription>
              </CardHeader>
              <CardContent>
                 <ScrollArea className="h-64">
                    <div className="space-y-2">
                        {analysis.headings.map((h, i) => (
                            <div key={i} className="flex items-center gap-2">
                                <Badge variant="secondary" className="font-bold">{h.tag.toUpperCase()}</Badge>
                                <p className="text-sm text-muted-foreground">{h.text}</p>
                            </div>
                        ))}
                    </div>
                </ScrollArea>
              </CardContent>
            </Card>

          </div>

          {/* Columna Derecha: SEO Técnico */}
          <div className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>SEO Técnico Básico</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-start gap-3">
                  {analysis.title ? <CheckCircle className="h-5 w-5 text-green-500 mt-0.5 flex-shrink-0" /> : <XCircle className="h-5 w-5 text-destructive mt-0.5 flex-shrink-0" />}
                  <div>
                    <p className="font-semibold">Título de la Página</p>
                    <p className="text-sm text-muted-foreground">{analysis.title || "No encontrado"}</p>
                  </div>
                </div>
                 <div className="flex items-start gap-3">
                  {analysis.metaDescription ? <CheckCircle className="h-5 w-5 text-green-500 mt-0.5 flex-shrink-0" /> : <XCircle className="h-5 w-5 text-destructive mt-0.5 flex-shrink-0" />}
                  <div>
                    <p className="font-semibold">Meta Descripción</p>
                    <p className="text-sm text-muted-foreground">{analysis.metaDescription || "No encontrada"}</p>
                  </div>
                </div>
                 <div className="flex items-start gap-3">
                  {analysis.h1 ? <CheckCircle className="h-5 w-5 text-green-500 mt-0.5 flex-shrink-0" /> : <XCircle className="h-5 w-5 text-destructive mt-0.5 flex-shrink-0" />}
                  <div>
                    <p className="font-semibold">Encabezado H1</p>
                    <p className="text-sm text-muted-foreground">{analysis.h1 || "No encontrado"}</p>
                  </div>
                </div>
              </CardContent>
            </Card>

             <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2"><ImageIcon className="h-5 w-5 text-primary" /> SEO de Imágenes</CardTitle>
                <CardDescription>El texto alternativo (alt) es crucial para la accesibilidad y el SEO.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-2">
                 <div className="flex items-center justify-between p-3 rounded-md bg-muted">
                    <p className="font-semibold">Imágenes encontradas:</p>
                    <Badge>{totalImages}</Badge>
                 </div>
                 <div className="flex items-center justify-between p-3 rounded-md bg-muted">
                    <p className="font-semibold">Imágenes sin 'alt':</p>
                    <Badge variant={imagesWithoutAlt > 0 ? "destructive" : "default"}>{imagesWithoutAlt}</Badge>
                 </div>
              </CardContent>
            </Card>
          </div>

        </div>
      )}
    </div>
  );
}
