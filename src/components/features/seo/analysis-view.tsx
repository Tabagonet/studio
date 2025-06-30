

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
  canonicalUrl: string;
  h1: string;
  headings: { tag: string; text: string }[];
  images: { src: string; alt: string }[];
  aiAnalysis: {
    score: number;
    checks: {
        titleContainsKeyword: boolean;
        titleIsGoodLength: boolean;
        metaDescriptionContainsKeyword: boolean;
        metaDescriptionIsGoodLength: boolean;
        keywordInFirstParagraph: boolean;
        contentHasImages: boolean;
        allImagesHaveAltText: boolean;
        h1Exists: boolean;
        canonicalUrlExists: boolean;
    };
    suggested: {
      title: string;
      metaDescription: string;
      focusKeyword: string;
    };
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

export function AnalysisView({ analysis, item, history, onEdit, onReanalyze, onSelectHistoryItem }: AnalysisViewProps) {
  const scoreColor = analysis.aiAnalysis.score >= 80 ? 'text-green-500' : analysis.aiAnalysis.score >= 50 ? 'text-amber-500' : 'text-destructive';
  const latestAnalysisId = history[0]?.id;
  const currentRecord = history.find(record => record.analysis.title === analysis.title && record.analysis.aiAnalysis.score === analysis.aiAnalysis.score);

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
      <div className="lg:col-span-2 space-y-6">
        <Card>
          <CardHeader className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
            <div className="flex items-center gap-2">
                <BrainCircuit className="h-6 w-6 text-primary" /> 
                <CardTitle>Análisis SEO</CardTitle>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button onClick={onReanalyze} variant="secondary"><RefreshCw className="mr-2 h-4 w-4" /> Volver a Analizar</Button>
              <Button onClick={() => onEdit(item)}><Edit className="mr-2 h-4 w-4" /> Editar y Optimizar</Button>
               {latestAnalysisId && (
                <Button asChild variant="outline"><Link href={`/seo-optimizer/report?analysisId=${latestAnalysisId}`} target="_blank"><Printer className="mr-2 h-4 w-4" /> Generar Informe</Link></Button>
              )}
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="text-center">
                <p className="text-sm text-muted-foreground">Puntuación SEO Determinista</p>
                <p className={`text-6xl font-bold ${scoreColor}`}>{analysis.aiAnalysis.score}/100</p>
            </div>
             <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-4 pt-4 border-t">
                {Object.entries(analysis.aiAnalysis.checks).map(([key, passed]) => (
                    <div key={key} className="flex items-center gap-2 text-sm">
                        {passed ? <CheckCircle className="h-4 w-4 text-green-500 flex-shrink-0" /> : <XCircle className="h-4 w-4 text-amber-500 flex-shrink-0" />}
                        <span className="text-muted-foreground">{checkLabels[key as keyof typeof checkLabels]}</span>
                    </div>
                ))}
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
                                  className={cn( "flex justify-between items-center text-sm p-2 bg-muted rounded-md w-full text-left hover:bg-accent transition-colors", currentRecord?.id === record.id && "ring-2 ring-primary bg-primary/10" )}
                                  aria-current={currentRecord?.id === record.id}
                              >
                                  <span className="text-muted-foreground">
                                      {format(new Date(record.createdAt), "d/LLL/yy HH:mm", { locale: es })}
                                  </span>
                                  <Badge className={ cn(record.score >= 80 ? 'bg-green-500' : record.score >= 50 ? 'bg-amber-500' : 'bg-destructive') }>
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
