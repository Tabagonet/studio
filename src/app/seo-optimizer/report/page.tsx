
"use client";

import React, { useEffect, useState, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Loader2, Printer, BrainCircuit, Lightbulb, FileText, ListTree, Image as ImageIcon, CheckCircle, XCircle } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { auth } from '@/lib/firebase';
import type { SeoAnalysisRecord, SeoInterpretationOutput, AnalysisResult } from '@/lib/types';
import { APP_NAME } from '@/lib/constants';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { cn } from '@/lib/utils';

const checkLabels: Record<keyof AnalysisResult['aiAnalysis']['checks'], string> = {
    titleContainsKeyword: "Título SEO contiene palabra clave",
    titleIsGoodLength: "Longitud del título SEO (30-65)",
    metaDescriptionContainsKeyword: "Meta descripción contiene palabra clave",
    metaDescriptionIsGoodLength: "Longitud de meta descripción (50-160)",
    keywordInFirstParagraph: "Palabra clave en la introducción",
    contentHasImages: "Contenido tiene imágenes",
    allImagesHaveAltText: "Todas las imágenes tienen 'alt text'",
    h1Exists: "Existe un único encabezado H1",
    canonicalUrlExists: "Existe una URL canónica",
};

function ReportContent() {
  const searchParams = useSearchParams();
  const analysisId = searchParams.get('analysisId');
  const [analysisRecord, setAnalysisRecord] = useState<SeoAnalysisRecord | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const { toast } = useToast();

  useEffect(() => {
    if (!analysisId) {
      setError('No se proporcionó un ID de análisis.');
      setIsLoading(false);
      return;
    }

    const fetchAnalysis = async () => {
      setIsLoading(true);
      setError(null);
      setAnalysisRecord(null);
      
      const user = auth.currentUser;
      if (!user) {
        setError('Autenticación requerida.');
        setIsLoading(false);
        return;
      }
      try {
        const token = await user.getIdToken();
        const response = await fetch(`/api/seo/analysis/${analysisId}`, {
          headers: { 'Authorization': `Bearer ${token}` },
        });

        if (!response.ok) {
          const errorData = await response.json();
          throw new Error(errorData.error || 'No se pudo cargar el análisis.');
        }
        
        const record: SeoAnalysisRecord = await response.json();
        if (!record.analysis || !record.interpretation) {
             throw new Error("El informe está incompleto o corrupto.");
        }
        setAnalysisRecord(record);

      } catch (e: any) {
        setError(e.message);
        toast({ title: 'Error', description: e.message, variant: 'destructive' });
      } finally {
        setIsLoading(false);
      }
    };

    fetchAnalysis();
  }, [analysisId, toast]);

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh]">
        <Loader2 className="h-12 w-12 animate-spin text-primary mb-4" />
        <p className="text-lg text-muted-foreground">Cargando informe SEO avanzado...</p>
      </div>
    );
  }

  if (error) {
    return <Alert variant="destructive"><AlertTitle>Error al cargar el informe</AlertTitle><AlertDescription>{error}</AlertDescription></Alert>;
  }

  if (!analysisRecord) {
    return <Alert>No se encontraron datos de análisis válidos para generar el informe.</Alert>;
  }

  const { analysis, interpretation } = analysisRecord;
  const scoreColor = analysis.aiAnalysis.score >= 80 ? 'text-green-500' : analysis.aiAnalysis.score >= 50 ? 'text-amber-500' : 'text-destructive';
  const imagesWithoutAlt = analysis.images?.filter(img => !img.alt).length ?? 0;

  return (
    <div className="report-container bg-background text-foreground font-sans">
      <header className="report-header text-center py-8 border-b-2 border-primary">
        <h1 className="text-4xl font-bold text-primary">{APP_NAME}</h1>
        <p className="text-lg text-muted-foreground">Informe de Optimización SEO On-Page</p>
      </header>

      <main className="report-main p-8 space-y-10">
        <section className="page-break-after">
          <Card className="shadow-none border-none">
            <CardHeader className="text-center">
              <CardTitle className="text-3xl">Análisis de la Página</CardTitle>
              <CardDescription className="text-lg text-primary hover:underline break-all">
                <a href={analysisRecord.url} target="_blank" rel="noopener noreferrer">{analysisRecord.url}</a>
              </CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col md:flex-row items-center justify-around gap-8 pt-8">
              <div className="text-center">
                <p className="text-xl text-muted-foreground font-semibold">Puntuación Global</p>
                <p className={`text-8xl font-bold ${scoreColor}`}>{analysis.aiAnalysis.score}<span className="text-4xl">/100</span></p>
              </div>
              <div className="max-w-xl">
                 <h3 className="text-xl font-semibold mb-2 flex items-center gap-2"><BrainCircuit className="h-6 w-6 text-primary" /> Interpretación del Experto IA</h3>
                 <p className="text-base text-muted-foreground italic">"{interpretation.interpretation}"</p>
              </div>
            </CardContent>
          </Card>
           <Separator className="my-12"/>
           <Card className="shadow-none border-none">
             <CardHeader>
                <CardTitle className="text-2xl flex items-center gap-2"><Lightbulb className="h-6 w-6 text-primary" /> Plan de Acción Prioritario</CardTitle>
                <CardDescription>Estos son los pasos más importantes para mejorar el SEO de esta página.</CardDescription>
             </CardHeader>
             <CardContent>
                <ul className="list-decimal list-inside space-y-4 text-lg">
                    {interpretation.actionPlan.map((action, i) => (
                        <li key={i} className="pl-2">{action}</li>
                    ))}
                </ul>
             </CardContent>
           </Card>
        </section>

        <section className="page-break-after">
          <CardTitle className="text-2xl mb-6 flex items-center gap-2"><FileText className="h-6 w-6 text-primary" />Análisis Técnico Detallado</CardTitle>
          <div className="space-y-6">
             <Card>
                <CardHeader>
                    <CardTitle className="text-lg">Checklist SEO</CardTitle>
                </CardHeader>
                 <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-4">
                    {analysis.aiAnalysis?.checks && Object.entries(analysis.aiAnalysis.checks).map(([key, passed]) => (
                        <div key={key} className="flex items-center gap-2 text-sm">
                            {passed ? <CheckCircle className="h-4 w-4 text-green-500 flex-shrink-0" /> : <XCircle className="h-4 w-4 text-amber-500 flex-shrink-0" />}
                            <span className="text-muted-foreground">{checkLabels[key as keyof typeof checkLabels]}</span>
                        </div>
                    ))}
                </CardContent>
            </Card>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <Card>
                    <CardHeader><CardTitle className="text-lg">SEO Básico</CardTitle></CardHeader>
                    <CardContent className="space-y-3 text-sm">
                        <p><strong className="font-semibold">Título:</strong> {analysis.title || <span className="text-destructive">No encontrado</span>}</p>
                        <p><strong className="font-semibold">Meta Desc:</strong> {analysis.metaDescription || <span className="text-destructive">No encontrada</span>}</p>
                        <p><strong className="font-semibold">Encabezado H1:</strong> {analysis.h1 || <span className="text-destructive">No encontrado</span>}</p>
                    </CardContent>
                </Card>
                <Card>
                    <CardHeader><CardTitle className="text-lg flex items-center gap-2"><ImageIcon className="h-5 w-5"/> SEO de Imágenes</CardTitle></CardHeader>
                    <CardContent className="space-y-3 text-sm">
                        <div className="flex justify-between items-center"><p>Imágenes encontradas:</p><Badge>{analysis.images?.length ?? 0}</Badge></div>
                        <div className="flex justify-between items-center"><p>Imágenes sin 'alt':</p><Badge variant={imagesWithoutAlt > 0 ? "destructive" : "default"}>{imagesWithoutAlt}</Badge></div>
                    </CardContent>
                </Card>
            </div>
             <Card>
                <CardHeader><CardTitle className="text-lg flex items-center gap-2"><ListTree className="h-5 w-5" /> Estructura de Encabezados</CardTitle></CardHeader>
                <CardContent>
                    <div className="columns-1 md:columns-2 gap-x-8 max-h-96 overflow-y-auto">
                    {analysis.headings?.length > 0 ? analysis.headings.map((h, i) => (
                        <div key={i} className="flex items-start gap-2 mb-2 break-inside-avoid-column">
                            <Badge variant="secondary" className="font-bold">{h.tag.toUpperCase()}</Badge>
                            <p className="text-sm">{h.text}</p>
                        </div>
                    )) : <p className="text-sm text-muted-foreground">No se encontraron encabezados.</p>}
                    </div>
                </CardContent>
            </Card>
          </div>
        </section>

        <section>
          <CardTitle className="text-2xl mb-6 flex items-center gap-2"><BrainCircuit className="h-6 w-6 text-primary" />Resumen del Experto IA</CardTitle>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <Card className="border-green-500/50">
                  <CardHeader><CardTitle className="text-lg text-green-600">Puntos Fuertes</CardTitle></CardHeader>
                   <CardContent>
                        <ul className="list-disc list-inside space-y-2">{interpretation.positives.map((item, i) => <li key={i}>{item}</li>)}</ul>
                  </CardContent>
              </Card>
               <Card className="border-amber-500/50">
                  <CardHeader><CardTitle className="text-lg text-amber-600">Áreas de Mejora</CardTitle></CardHeader>
                  <CardContent>
                        <ul className="list-disc list-inside space-y-2">{interpretation.improvements.map((item, i) => <li key={i}>{item}</li>)}</ul>
                  </CardContent>
              </Card>
          </div>
        </section>
      </main>
      
      <footer className="report-footer text-center text-sm text-muted-foreground py-4 border-t">
        <p>Informe generado por {APP_NAME} el {new Date().toLocaleDateString('es-ES', { year: 'numeric', month: 'long', day: 'numeric' })}</p>
        <div className="page-number"></div>
      </footer>
    </div>
  );
}

export default function ReportPage() {
    return (
        <>
            <div className="print-hide container mx-auto py-4 flex justify-end gap-2">
                <Button onClick={() => window.print()}>
                    <Printer className="mr-2 h-4 w-4"/>
                    Imprimir o Guardar como PDF
                </Button>
            </div>
            <Suspense fallback={<div className="flex items-center justify-center min-h-[60vh]"><Loader2 className="h-12 w-12 animate-spin"/></div>}>
                <ReportContent />
            </Suspense>
        </>
    );
}
