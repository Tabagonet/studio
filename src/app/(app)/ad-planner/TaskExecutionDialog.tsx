

'use client';

import React, { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  DialogClose,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { auth } from '@/lib/firebase';
import type { Task, CreateAdPlanOutput, KeywordResearchResult, GenerateAdCreativesOutput } from './schema';
import { Loader2, Sparkles, Clipboard, Table as TableIcon } from 'lucide-react';
import { executeTaskAction } from './actions';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';

interface TaskExecutionDialogProps {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  task: Task | null;
  plan: CreateAdPlanOutput | null;
  onTaskUpdate: (taskId: string, result: any) => void;
}

export function TaskExecutionDialog({ isOpen, onOpenChange, task, plan, onTaskUpdate }: TaskExecutionDialogProps) {
  const { toast } = useToast();
  const [isLoading, setIsLoading] = useState(false);
  const [result, setResult] = useState<KeywordResearchResult | GenerateAdCreativesOutput | null>(null);

  const handleExecute = async () => {
    if (!task || !plan) return;

    setIsLoading(true);
    setResult(null);

    const user = auth.currentUser;
    if (!user) {
      toast({ title: 'No autenticado', variant: 'destructive' });
      setIsLoading(false);
      return;
    }

    try {
      const token = await user.getIdToken();
      const response = await executeTaskAction(
        {
          taskName: task.name,
          url: plan.url,
          buyerPersona: plan.buyer_persona,
          valueProposition: plan.value_proposition,
        },
        token
      );

      if (response.error || !response.data) {
        throw new Error(response.error || 'La IA no pudo ejecutar la tarea.');
      }
      
      const taskResult = response.data;
      setResult(taskResult);
      onTaskUpdate(task.id, taskResult); // Pass the result back up to the parent
      toast({ title: 'Tarea Ejecutada', description: 'La IA ha completado la tarea.' });
    } catch (err: any) {
      toast({ title: 'Error en la Ejecución', description: err.message, variant: 'destructive' });
    } finally {
      setIsLoading(false);
    }
  };

  const copyToClipboard = () => {
    if (!result) return;
    let text = '';
    if ('keywords' in result) {
      text = result.keywords.map(kw => `${kw.keyword}\t${kw.intent}\t${kw.cpc_suggestion}`).join('\n');
    } else if ('headlines' in result) {
        text += '** Titulares **\n' + result.headlines.join('\n') + '\n\n';
        text += '** Descripciones **\n' + result.descriptions.join('\n');
    }
    navigator.clipboard.writeText(text);
    toast({ title: 'Copiado', description: 'Resultados copiados al portapapeles.' });
  };

  const renderResult = () => {
    const displayResult = result || (task?.result as any | null);
    if (!displayResult) return null;

    if (displayResult.keywords) {
      const keywordResult = displayResult as KeywordResearchResult;
      return (
        <div className="mt-4 space-y-2">
            <div className="flex justify-between items-center">
                <h4 className="font-semibold">Resultados de la Investigación</h4>
                <Button variant="outline" size="sm" onClick={copyToClipboard}><Clipboard className="mr-2 h-4 w-4" /> Copiar</Button>
            </div>
            <Table>
                <TableHeader>
                    <TableRow>
                    <TableHead>Palabra Clave</TableHead>
                    <TableHead>Intención</TableHead>
                    <TableHead>CPC Sugerido</TableHead>
                    </TableRow>
                </TableHeader>
                <TableBody>
                    {keywordResult.keywords.map((kw, index) => (
                    <TableRow key={index}>
                        <TableCell>{kw.keyword}</TableCell>
                        <TableCell>{kw.intent}</TableCell>
                        <TableCell>{kw.cpc_suggestion}</TableCell>
                    </TableRow>
                    ))}
                </TableBody>
            </Table>
        </div>
      );
    }
    
    if (displayResult.headlines) {
        const creativeResult = displayResult as GenerateAdCreativesOutput;
        return (
             <div className="mt-4 space-y-4">
                <div className="flex justify-between items-center">
                    <h4 className="font-semibold">Creativos Publicitarios Sugeridos</h4>
                    <Button variant="outline" size="sm" onClick={copyToClipboard}><Clipboard className="mr-2 h-4 w-4" /> Copiar</Button>
                </div>
                 <div>
                    <h5 className="font-medium">Titulares</h5>
                    <ul className="list-disc list-inside text-sm text-muted-foreground mt-1 space-y-1">
                        {creativeResult.headlines.map((h, i) => <li key={i}>{h}</li>)}
                    </ul>
                 </div>
                 <div>
                    <h5 className="font-medium">Descripciones</h5>
                     <ul className="list-disc list-inside text-sm text-muted-foreground mt-1 space-y-1">
                        {creativeResult.descriptions.map((d, i) => <li key={i}>{d}</li>)}
                    </ul>
                 </div>
             </div>
        )
    }

    return <p>La tarea no ha devuelto un resultado esperado.</p>;
  };

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><Sparkles className="h-5 w-5 text-primary" /> Ejecutar Tarea con IA</DialogTitle>
          <DialogDescription>
            Ejecutando: <strong>{task?.name}</strong>
          </DialogDescription>
        </DialogHeader>
        <div className="py-4">
          {isLoading ? (
            <div className="flex flex-col items-center justify-center h-40">
              <Loader2 className="h-8 w-8 animate-spin" />
              <p className="mt-2 text-muted-foreground">La IA está trabajando en tu tarea...</p>
            </div>
          ) : (task?.result || result) ? (
             <ScrollArea className="max-h-[50vh]">
                {renderResult()}
            </ScrollArea>
          ) : (
            <div className="text-center p-6 border border-dashed rounded-md">
                <p className="text-muted-foreground">
                    Haz clic en "Generar" para que la IA realice la tarea. Los resultados se guardarán.
                </p>
            </div>
          )}
        </div>
        <DialogFooter>
          <DialogClose asChild>
            <Button type="button" variant="secondary">Cerrar</Button>
          </DialogClose>
          <Button onClick={handleExecute} disabled={isLoading}>
            {isLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Sparkles className="mr-2 h-4 w-4" />}
            {task?.result || result ? 'Volver a Generar' : 'Generar'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
