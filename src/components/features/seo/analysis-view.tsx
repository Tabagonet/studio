
"use client";

import React from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { BrainCircuit, CheckCircle, XCircle, ListTree, Edit, History, Printer, RefreshCw, Lightbulb, Image as ImageIcon } from "lucide-react";
import { Button } from '@/components/ui/button';
import type { ContentItem, AnalysisResult, SeoAnalysisRecord } from '@/lib/types';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import Link from 'next/link';
import { cn } from '@/lib/utils';
import { Loader2 } from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';


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

interface AnalysisViewProps {
  record: SeoAnalysisRecord;
  item: ContentItem;
  history: SeoAnalysisRecord[];
  onEdit: (item: ContentItem) => void;
  onReanalyze: () => void;
  onSelectHistoryItem: (record: SeoAnalysisRecord) => void;
  contentModifiedDate: string;
}


export function AnalysisView({ record, item, history, onEdit, onReanalyze, onSelectHistoryItem, contentModifiedDate }: AnalysisViewProps) {
  const { analysis, interpretation } = record;
  const isStale = new Date(contentModifiedDate) > new Date(record.createdAt);

  const scoreColor = analysis.aiAnalysis.score >= 80 ? 'text-green-500' : analysis.aiAnalysis.score >= 50 ? 'text-amber-500' : 'text-destructive';
  const latestAnalysisId = history[0]?.id;
  const imagesWithoutAlt = analysis.images?.filter(img => !img.alt) ?? [];

  return (
    <div className="space-y-6">
      
       {isStale && (
          <Alert variant="destructive">
              <RefreshCw className="h-4 w-4" />
              <AlertTitle>Informe desactualizado</AlertTitle>
              <AlertDescription>
                  Detectamos que se han guardado cambios en esta página desde el último análisis. 
                  Para obtener los resultados más precisos, te recomendamos volver a analizar.
              </AlertDescription>
          </Alert>
        )}

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
              {analysis.aiAnalysis?.checks && Object.entries(analysis.aiAnalysis.checks).map(([key, passed]) => (
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
              <CardTitle className="flex items-center gap-2"><Lightbulb className="h-6 w-6 text-primary" /> Plan de Acción e Interpretación IA</CardTitle>
              <CardDescription>Sugerencias generadas por IA basadas en el análisis técnico.</CardDescription>
          </CardHeader>
          <CardContent>
              {!interpretation ? (
                  <div className="flex items-center justify-center p-4"><Loader2 className="h-6 w-6 animate-spin mr-2" /> La IA está procesando el resumen...</div>
              ) : (
                  <div className="space-y-6">
                      <div>
                          <h3 className="font-semibold text-lg mb-2">Interpretación General</h3>
                          <p className="text-sm text-muted-foreground italic">"{interpretation.interpretation}"</p>
                      </div>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                          <div className="space-y-2">
                              <h4 className="font-semibold text-green-600">Puntos Fuertes</h4>
                              <ul className="list-disc list-inside text-sm text-muted-foreground space-y-1">
                                  {interpretation.positives.map((item, i) => <li key={i}>{item}</li>)}
                              </ul>
                          </div>
                          <div className="space-y-2">
                              <h4 className="font-semibold text-amber-600">Áreas de Mejora</h4>
                                <ul className="list-disc list-inside text-sm text-muted-foreground space-y-1">
                                  {interpretation.improvements.map((item, i) => <li key={i}>{item}</li>)}
                              </ul>
                          </div>
                      </div>
                      <div className="pt-4 border-t">
                            <h3 className="font-semibold text-lg mb-2">Plan de Acción Sugerido</h3>
                            <ul className="list-decimal list-inside text-sm space-y-2">
                              {interpretation.actionPlan.map((action, i) => (
                                  <li key={i} className="pl-2">{action}</li>
                              ))}
                          </ul>
                      </div>
                  </div>
              )}
          </CardContent>
      </Card>
      
      <Card>
        <CardHeader>
            <CardTitle className="flex items-center gap-2"><ListTree className="h-6 w-6 text-primary" /> Estructura de Encabezados</CardTitle>
            <CardDescription>Una buena jerarquía de encabezados (H1, H2, H3...) ayuda a Google a entender tu contenido.</CardDescription>
        </CardHeader>
        <CardContent>
            <ScrollArea className="max-h-64">
              <div className="space-y-2">
                  {analysis.headings.map((h, i) => (
                      <div key={i} className="flex items-center gap-2">
                          <Badge variant="secondary" className="font-bold">{h.tag.toUpperCase()}</Badge>
                          <p className="text-sm text-muted-foreground">{h.text}</p>
                      </div>
                  ))}
                  {analysis.headings.length === 0 && <p className="text-muted-foreground text-sm text-center">No se encontraron encabezados.</p>}
              </div>
          </ScrollArea>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
            <CardTitle className="flex items-center gap-2"><ImageIcon className="h-6 w-6 text-primary" /> SEO de Imágenes</CardTitle>
            <CardDescription>El texto alternativo (alt text) es crucial para la accesibilidad y el SEO de imágenes.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
            <div className="flex justify-between items-center text-sm">
                <p className="text-muted-foreground">Imágenes encontradas en el contenido:</p>
                <Badge>{analysis.images?.length ?? 0}</Badge>
            </div>
            <div className="flex justify-between items-center text-sm">
                <p className="text-muted-foreground">Imágenes que necesitan 'alt text':</p>
                <Badge variant={imagesWithoutAlt.length > 0 ? "destructive" : "default"}>{imagesWithoutAlt.length}</Badge>
            </div>
            {imagesWithoutAlt.length > 0 && (
                <div className="pt-2 mt-2 border-t">
                    <p className="text-xs font-semibold text-muted-foreground mb-1">Imágenes sin 'alt text' detectadas:</p>
                    <ScrollArea className="max-h-24">
                        <ul className="text-xs text-muted-foreground space-y-1">
                            {imagesWithoutAlt.map((img, i) => (
                                <li key={i} className="truncate">
                                    <a href={img.src} target="_blank" rel="noopener noreferrer" className="hover:underline">
                                        ...{img.src.slice(-60)}
                                    </a>
                                </li>
                            ))}
                        </ul>
                    </ScrollArea>
                </div>
            )}
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
                    {history.map(historyItem => (
                        <li key={historyItem.id}>
                            <button
                                onClick={() => onSelectHistoryItem(historyItem)}
                                className={cn( "flex justify-between items-center text-sm p-2 bg-muted rounded-md w-full text-left hover:bg-accent transition-colors", record.id === historyItem.id && "ring-2 ring-primary bg-primary/10" )}
                                aria-current={record.id === historyItem.id}
                            >
                                <span className="text-muted-foreground">
                                    {format(new Date(historyItem.createdAt), "d/LLL/yy HH:mm", { locale: es })}
                                </span>
                                <Badge className={ cn(historyItem.score >= 80 ? 'bg-green-500' : historyItem.score >= 50 ? 'bg-amber-500' : 'bg-destructive') }>
                                    {historyItem.score}
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
  );
}
