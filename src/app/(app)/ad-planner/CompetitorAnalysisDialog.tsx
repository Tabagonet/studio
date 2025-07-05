
'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Loader2, Swords, RefreshCw, AlertTriangle } from 'lucide-react';
import type { CompetitorAnalysisOutput } from './schema';
import { useToast } from '@/hooks/use-toast';
import { competitorAnalysisAction } from './actions';
import { auth } from '@/lib/firebase';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { formatCurrency } from '@/lib/utils';
import { ScrollArea } from '@/components/ui/scroll-area';
import { format, parseISO } from 'date-fns';
import { es } from 'date-fns/locale';

interface CompetitorAnalysisDialogProps {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  url: string;
}

export function CompetitorAnalysisDialog({ isOpen, onOpenChange, url }: CompetitorAnalysisDialogProps) {
  const [analysis, setAnalysis] = useState<CompetitorAnalysisOutput | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { toast } = useToast();

  const generateNewAnalysis = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    const user = auth.currentUser;
    if (!user) {
      setError('Error de autenticación.');
      setIsLoading(false);
      return;
    }

    try {
      const token = await user.getIdToken();
      const result = await competitorAnalysisAction({ url }, token);

      if (result.error || !result.data) {
        throw new Error(result.error || 'La IA no pudo generar el análisis de competencia.');
      }
      setAnalysis(result.data);
      toast({ title: 'Análisis actualizado', description: 'Se ha generado un nuevo informe de competencia.' });

    } catch (err: any) {
      setError(err.message);
      toast({ title: 'Error al Generar Análisis', description: err.message, variant: 'destructive' });
    } finally {
      setIsLoading(false);
    }
  }, [url, toast]);
  
  useEffect(() => {
    if (!isOpen) {
      setAnalysis(null);
      setError(null);
      return;
    }

    const fetchOrGenerate = async () => {
      setIsLoading(true);
      setError(null);
      const user = auth.currentUser;
      if (!user) {
        setError("Error de autenticación.");
        setIsLoading(false);
        return;
      }

      try {
        const token = await user.getIdToken();
        const response = await fetch(`/api/ad-planner/competitor-analysis?url=${encodeURIComponent(url)}`, {
          headers: { 'Authorization': `Bearer ${token}` }
        });

        if (response.ok) {
          const data = await response.json();
          // The API returns the full record: { id, createdAt, url, userId, analysis: { competitors: [...] } }
          // We need to flatten it for the state.
          setAnalysis({
            id: data.id,
            createdAt: data.createdAt,
            competitors: data.analysis.competitors
          });
        } else if (response.status === 404) {
          // Not found, generate the first analysis
          await generateNewAnalysis();
        } else {
          const errorData = await response.json();
          throw new Error(errorData.error || `Error ${response.status} al buscar el análisis guardado.`);
        }
      } catch (err: any) {
        setError(err.message);
      } finally {
        setIsLoading(false);
      }
    };

    fetchOrGenerate();
  }, [isOpen, url, generateNewAnalysis]);


  const renderContent = () => {
    if (isLoading) {
      return (
        <div className="flex-1 flex flex-col items-center justify-center h-full">
          <Loader2 className="h-8 w-8 animate-spin" />
          <p className="mt-2 text-muted-foreground">Investigando el mercado... un momento.</p>
        </div>
      );
    }
    if (error) {
        return (
             <div className="flex-1 flex flex-col items-center justify-center h-full text-center p-4">
              <AlertTriangle className="h-8 w-8 text-destructive mb-2" />
              <p className="font-semibold">Error al obtener el análisis</p>
              <p className="text-sm text-muted-foreground">{error}</p>
            </div>
        )
    }
    if (analysis?.competitors?.length) {
      return (
         <ScrollArea className="h-full pr-2">
            <Table>
                <TableHeader>
                    <TableRow>
                        <TableHead className="w-[180px]">Competidor</TableHead>
                        <TableHead>Plataformas Clave</TableHead>
                        <TableHead>Presupuesto Mensual (Est.)</TableHead>
                        <TableHead>Resumen Estrategia</TableHead>
                        <TableHead>Ángulo Creativo</TableHead>
                    </TableRow>
                </TableHeader>
                <TableBody>
                    {analysis.competitors.map((c, index) => (
                        <TableRow key={index}>
                            <TableCell className="font-semibold">{c.competitor_name}</TableCell>
                            <TableCell>{c.key_platforms}</TableCell>
                            <TableCell>{formatCurrency(c.estimated_monthly_budget)}</TableCell>
                            <TableCell className="text-sm text-muted-foreground">{c.strategy_summary}</TableCell>
                            <TableCell className="text-sm text-muted-foreground">{c.creative_angle}</TableCell>
                        </TableRow>
                    ))}
                </TableBody>
            </Table>
        </ScrollArea>
      )
    }
    return (
       <div className="flex-1 flex flex-col items-center justify-center h-full">
          <p className="text-muted-foreground">No se pudo generar el análisis de competencia.</p>
        </div>
    );
  }
  
  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl h-[90vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="text-2xl flex items-center gap-2">
            <Swords className="h-6 w-6 text-primary" /> Análisis de Competencia
          </DialogTitle>
          <DialogDescription>
            Análisis de los competidores más relevantes para <code className="text-sm font-semibold">{url}</code> y sus estrategias publicitarias.
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 min-h-0 py-4">
          {renderContent()}
        </div>
        
        <DialogFooter className="justify-between sm:justify-between">
           <div className="text-xs text-muted-foreground">
             {analysis?.createdAt && (
               <p>Último análisis: {format(parseISO(analysis.createdAt), "d MMM yyyy, HH:mm", { locale: es })}</p>
             )}
           </div>
          <div className="flex gap-2">
             <Button type="button" variant="outline" onClick={generateNewAnalysis} disabled={isLoading}>
                <RefreshCw className="mr-2 h-4 w-4" />
                Volver a Analizar
              </Button>
             <Button type="button" variant="secondary" onClick={() => onOpenChange(false)}>Cerrar</Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
