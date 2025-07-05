
'use client';

import React, { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Loader2, Swords } from 'lucide-react';
import type { CompetitorAnalysisOutput } from './schema';
import { useToast } from '@/hooks/use-toast';
import { competitorAnalysisAction } from './actions';
import { auth } from '@/lib/firebase';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { formatCurrency } from '@/lib/utils';
import { ScrollArea } from '@/components/ui/scroll-area';

interface CompetitorAnalysisDialogProps {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  url: string;
}

export function CompetitorAnalysisDialog({ isOpen, onOpenChange, url }: CompetitorAnalysisDialogProps) {
  const [analysis, setAnalysis] = useState<CompetitorAnalysisOutput | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const { toast } = useToast();

  useEffect(() => {
    if (isOpen) {
      const fetchAnalysis = async () => {
        setIsLoading(true);
        setAnalysis(null);
        const user = auth.currentUser;
        if (!user) {
          toast({ title: 'Error de autenticación', variant: 'destructive' });
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
        } catch (error: any) {
          toast({ title: 'Error al Analizar Competencia', description: error.message, variant: 'destructive' });
        } finally {
          setIsLoading(false);
        }
      };
      fetchAnalysis();
    }
  }, [isOpen, url, toast]);

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
          {isLoading ? (
            <div className="flex-1 flex flex-col items-center justify-center h-full">
              <Loader2 className="h-8 w-8 animate-spin" />
              <p className="mt-2 text-muted-foreground">Investigando el mercado... dame un minuto.</p>
            </div>
          ) : analysis?.competitors?.length ? (
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
          ) : (
            <div className="flex-1 flex flex-col items-center justify-center h-full">
              <p className="text-muted-foreground">No se pudo generar el análisis de competencia.</p>
            </div>
          )}
        </div>
        
        <DialogFooter>
          <Button type="button" variant="secondary" onClick={() => onOpenChange(false)}>Cerrar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
