

"use client";

import React from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { BrainCircuit, CheckCircle, XCircle, Image as ImageIcon, Heading1, ListTree, Edit, History, Printer, RefreshCw } from "lucide-react";
import { Button } from '@/components/ui/button';
import type { ContentItem } from '@/app/(app)/seo-optimizer/page';
import type { SeoAnalysisRecord } from '@/lib/types';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import Link from 'next/link';
import { cn } from '@/lib/utils';

export interface AnalysisResult {
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

interface AnalysisViewProps {
  analysis: AnalysisResult;
  item: ContentItem;
  history: SeoAnalysisRecord[];
  onEdit: (item: ContentItem) => void;
  onReanalyze: () => void;
  onSelectHistoryItem: (record: SeoAnalysisRecord) => void;
}

export function AnalysisView({ analysis, item, history, onEdit, onReanalyze, onSelectHistoryItem }: AnalysisViewProps) {
  const imagesWithoutAlt = analysis.images.filter(img => !img.alt).length;
  const totalImages = analysis.images.length;
  const scoreColor = analysis.aiAnalysis.score >= 80 ? 'text-green-500' : analysis.aiAnalysis.score >= 50 ? 'text-amber-500' : 'text-destructive';

  const latestAnalysisId = history[0]?.id;

  // Find the currently displayed record in the history list to highlight it.
  const currentRecord = history.find(record => 
      record.analysis.aiAnalysis.score === analysis.aiAnalysis.score &&
      record.analysis.aiAnalysis.summary === analysis.aiAnalysis.summary &&
      record.analysis.title === analysis.title
  );

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
      <div className="lg:col-span-2 space-y-6">
        <Card>
          <CardHeader className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
            <div className="flex items-center gap-2">
                <BrainCircuit className="h-6 w-6 text-primary" /> 
                <CardTitle>Análisis con IA</CardTitle>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button onClick={onReanalyze} variant="secondary">
                <RefreshCw className="mr-2 h-4 w-4" />
                Volver a Analizar
              </Button>
              <Button onClick={() => onEdit(item)}>
                  <Edit className="mr-2 h-4 w-4" />
                  Editar y Optimizar
              </Button>
               {latestAnalysisId && (
                <Button asChild variant="outline">
                    <Link href={`/seo-optimizer/report?analysisId=${latestAnalysisId}`} target="_blank">
                        <Printer className="mr-2 h-4 w-4" />
                        Generar Informe
                    </Link>
                </Button>
              )}
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="text-center">
                <p className="text-sm text-muted-foreground">Puntuación SEO Estimada</p>
                <p className={`text-6xl font-bold ${scoreColor}`}>{analysis.aiAnalysis.score}/100</p>
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
        
        <Card>
            <CardHeader>
                <CardTitle className="flex items-center gap-2"><History className="h-5 w-5 text-primary"/> Historial de Análisis</CardTitle>
                <CardDescription>Selecciona un análisis anterior para ver sus detalles.</CardDescription>
            </CardHeader>
            <CardContent>
                {history.length > 0 ? (
                    <ul className="space-y-2">
                        {history.map(record => (
                            <li key={record.id}>
                                <button
                                    onClick={() => onSelectHistoryItem(record)}
                                    className={cn(
                                        "flex justify-between items-center text-sm p-2 bg-muted rounded-md w-full text-left hover:bg-accent transition-colors",
                                        currentRecord?.id === record.id && "ring-2 ring-primary bg-primary/10"
                                    )}
                                    aria-current={currentRecord?.id === record.id}
                                >
                                    <span className="text-muted-foreground">
                                        {format(new Date(record.createdAt), "d 'de' LLLL, yyyy 'a las' HH:mm", { locale: es })}
                                    </span>
                                    <Badge className={
                                        record.score >= 80 ? 'bg-green-500' : 
                                        record.score >= 50 ? 'bg-amber-500' : 'bg-destructive'
                                    }>
                                        {record.score}
                                    </Badge>
                                </button>
                            </li>
                        ))}
                    </ul>
                ) : (
                    <p className="text-sm text-muted-foreground text-center py-4">No hay análisis anteriores para esta URL.</p>
                )}
            </CardContent>
        </Card>
      </div>
    </div>
  );
}
    
