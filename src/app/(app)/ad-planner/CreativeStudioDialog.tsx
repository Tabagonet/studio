
'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter, DialogClose } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Loader2, Copy, Wand2, RefreshCw } from 'lucide-react';
import type { CreateAdPlanOutput, Strategy, GenerateAdCreativesOutput } from './schema';
import { useToast } from '@/hooks/use-toast';
import { generateAdCreativesAction } from './actions';
import { auth } from '@/lib/firebase';
import { ScrollArea } from '@/components/ui/scroll-area';

interface CreativeStudioDialogProps {
  plan: CreateAdPlanOutput | null;
  strategy: Strategy | null;
  onOpenChange: (open: boolean) => void;
  onPlanUpdate: (updatedPlan: CreateAdPlanOutput) => void;
}

const CreativeItem = ({ title, content }: { title: string, content: string | string[] }) => {
  const { toast } = useToast();

  const handleCopy = (text: string) => {
    navigator.clipboard.writeText(text);
    toast({ title: 'Copiado al portapapeles' });
  };

  const contentArray = Array.isArray(content) ? content : [content];

  return (
    <div className="space-y-2">
      <h4 className="font-semibold">{title}</h4>
      <div className="space-y-2">
        {contentArray.map((item, index) => (
          <div key={index} className="flex items-start gap-2 p-3 border rounded-md bg-muted/50">
            <p className="flex-1 text-sm">{item}</p>
            <Button variant="ghost" size="icon-sm" onClick={() => handleCopy(item)}>
              <Copy className="h-4 w-4" />
            </Button>
          </div>
        ))}
      </div>
    </div>
  );
};


export function CreativeStudioDialog({ plan, strategy, onOpenChange, onPlanUpdate }: CreativeStudioDialogProps) {
  const [creatives, setCreatives] = useState<GenerateAdCreativesOutput | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const { toast } = useToast();

  const fetchCreatives = useCallback(async (currentPlan: CreateAdPlanOutput, currentStrategy: Strategy, forceRegenerate = false) => {
      setIsLoading(true);
      if(forceRegenerate) {
        setCreatives(null);
      }

      const user = auth.currentUser;
      if (!user) {
        toast({ title: 'Error de autenticación', variant: 'destructive' });
        setIsLoading(false);
        return;
      }

      try {
        const token = await user.getIdToken();
        const result = await generateAdCreativesAction({
          url: currentPlan.url,
          objectives: currentPlan.objectives,
          platform: currentStrategy.platform,
          campaign_type: currentStrategy.campaign_type,
          funnel_stage: currentStrategy.funnel_stage,
          target_audience: currentPlan.buyer_persona,
        }, token);

        if (result.error || !result.data) {
          throw new Error(result.error || 'La IA no pudo generar los creativos.');
        }

        setCreatives(result.data);
        
        const updatedPlan = {
          ...currentPlan,
          strategies: currentPlan.strategies.map(s => 
            s.platform === currentStrategy.platform ? { ...s, creatives: result.data } : s
          )
        };
        onPlanUpdate(updatedPlan);
        if(forceRegenerate) {
             toast({ title: 'Creativos Regenerados', description: 'Se ha generado una nueva tanda de creativos.' });
        }

      } catch (error: any) {
        toast({ title: 'Error al Generar Creativos', description: error.message, variant: 'destructive' });
      } finally {
        setIsLoading(false);
      }
    }, [toast, onPlanUpdate]);

  useEffect(() => {
    if (strategy && plan) {
      if (strategy.creatives) {
        setCreatives(strategy.creatives);
        setIsLoading(false);
      } else {
        fetchCreatives(plan, strategy);
      }
    }
  }, [strategy, plan, fetchCreatives]);

  if (!strategy || !plan) return null;

  return (
    <Dialog open={!!strategy} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl h-[90vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="text-2xl flex items-center gap-2">
            <Wand2 className="h-6 w-6 text-primary"/> Estudio de Creativos para {strategy.platform}
          </DialogTitle>
          <DialogDescription>
            La IA ha generado los siguientes textos y conceptos visuales para tu campaña.
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 min-h-0 py-4">
          {isLoading ? (
            <div className="flex-1 flex flex-col items-center justify-center h-full">
              <Loader2 className="h-8 w-8 animate-spin" />
              <p className="mt-2 text-muted-foreground">La IA está creando... dame un segundo.</p>
            </div>
          ) : creatives ? (
            <ScrollArea className="h-full pr-4 -mr-4">
              <div className="space-y-6">
                <CreativeItem title="Titulares (Headlines)" content={creatives.headlines} />
                <CreativeItem title="Descripciones" content={creatives.descriptions} />
                <CreativeItem title="Llamadas a la Acción (CTAs)" content={creatives.cta_suggestions} />
                <CreativeItem title="Ideas Visuales" content={creatives.visual_ideas} />
              </div>
            </ScrollArea>
          ) : (
            <div className="flex-1 flex flex-col items-center justify-center h-full">
              <p className="text-muted-foreground">No se pudieron generar los creativos.</p>
            </div>
          )}
        </div>
        
        <DialogFooter className="justify-between">
           <Button variant="outline" onClick={() => fetchCreatives(plan, strategy, true)} disabled={isLoading}>
                <RefreshCw className="mr-2 h-4 w-4" />
                Volver a Generar con IA
            </Button>
            <DialogClose asChild>
                <Button type="button" variant="secondary">Cerrar</Button>
            </DialogClose>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
