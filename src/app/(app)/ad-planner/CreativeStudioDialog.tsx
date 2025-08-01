
'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter, DialogClose } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Loader2, Copy, Wand2, RefreshCw, Download } from 'lucide-react';
import type { CreateAdPlanOutput, Strategy, GenerateAdCreativesOutput } from './schema';
import { useToast } from '@/hooks/use-toast';
import { generateAdCreativesAction } from './actions';
import { auth } from '@/lib/firebase';
import { ScrollArea } from '@/components/ui/scroll-area';

interface CreativeStudioDialogProps {
  plan: CreateAdPlanOutput | null;
  strategy: Strategy | null;
  onOpenChange: (open: boolean) => void;
  onSaveCreatives: (strategyPlatform: string, creatives: GenerateAdCreativesOutput) => void;
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


export function CreativeStudioDialog({ plan, strategy, onOpenChange, onSaveCreatives }: CreativeStudioDialogProps) {
  const [creatives, setCreatives] = useState<GenerateAdCreativesOutput | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [hasFetched, setHasFetched] = useState(false);
  const { toast } = useToast();

  const fetchCreatives = useCallback(async (currentPlan: CreateAdPlanOutput, currentStrategy: Strategy) => {
      setIsLoading(true);
      setHasFetched(true);
      
      const user = auth.currentUser;
      if (!user) {
        toast({ title: 'Error de autenticación', variant: 'destructive' });
        setIsLoading(false);
        return;
      }
      
      if (!currentPlan.buyer_persona) {
          toast({ title: 'Faltan datos', description: 'El "Buyer Persona" es necesario para generar creativos. No se encontró en el plan.', variant: 'destructive'});
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
        onSaveCreatives(currentStrategy.platform, result.data);
        toast({ title: 'Creativos Generados', description: 'Se ha generado una nueva tanda de creativos.' });

      } catch (error: any) {
        toast({ title: 'Error al Generar Creativos', description: error.message, variant: 'destructive' });
        setCreatives(null); 
      } finally {
        setIsLoading(false);
      }
    }, [toast, onSaveCreatives]);

  useEffect(() => {
    // Reset fetch status when strategy changes
    if (strategy) {
        setHasFetched(false);
        setCreatives(null);
    }
  }, [strategy]);

  useEffect(() => {
    if (strategy && plan) {
      if (strategy.creatives && Object.keys(strategy.creatives).length > 0) {
        setCreatives(strategy.creatives);
        setIsLoading(false);
        setHasFetched(true);
      } else if (!isLoading && !hasFetched) {
        fetchCreatives(plan, strategy);
      }
    }
  }, [strategy, plan, isLoading, hasFetched, fetchCreatives]);

  const handleExport = () => {
    if (!creatives || !strategy) return;

    const { headlines, descriptions, cta_suggestions, visual_ideas } = creatives;
    
    let textContent = `Creativos para ${strategy.platform}\n`;
    textContent += `==================================\n\n`;

    textContent += `** Titulares (Headlines) **\n`;
    headlines.forEach(h => textContent += `- ${h}\n`);
    textContent += `\n`;

    textContent += `** Descripciones **\n`;
    descriptions.forEach(d => textContent += `- ${d}\n`);
    textContent += `\n`;

    textContent += `** Llamadas a la Acción (CTAs) **\n`;
    cta_suggestions.forEach(c => textContent += `- ${c}\n`);
    textContent += `\n`;

    textContent += `** Ideas Visuales **\n`;
    visual_ideas.forEach(v => textContent += `- ${v}\n`);

    const blob = new Blob([textContent], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `creativos-${strategy.platform.toLowerCase().replace(/\s/g, '-')}.txt`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    toast({ title: "Creativos exportados" });
  };


  const handleCloseDialog = () => {
    onOpenChange(false);
  };
  
  const handleRegenerate = () => {
    if(plan && strategy) {
        fetchCreatives(plan, strategy);
    }
  }

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
                {creatives.headlines && <CreativeItem title="Titulares (Headlines)" content={creatives.headlines} />}
                {creatives.descriptions && <CreativeItem title="Descripciones" content={creatives.descriptions} />}
                {creatives.cta_suggestions && <CreativeItem title="Llamadas a la Acción (CTAs)" content={creatives.cta_suggestions} />}
                {creatives.visual_ideas && <CreativeItem title="Ideas Visuales" content={creatives.visual_ideas} />}
              </div>
            </ScrollArea>
          ) : (
            <div className="flex-1 flex flex-col items-center justify-center h-full">
              <p className="text-muted-foreground">No se pudieron generar los creativos.</p>
            </div>
          )}
        </div>
        
        <DialogFooter className="justify-between">
           <div className="flex gap-2">
             <Button variant="outline" onClick={handleRegenerate} disabled={isLoading}>
                  <RefreshCw className="mr-2 h-4 w-4" />
                  Volver a Generar
              </Button>
               <Button variant="outline" onClick={handleExport} disabled={!creatives || isLoading}>
                  <Download className="mr-2 h-4 w-4" />
                  Exportar Creativos
              </Button>
           </div>
            <Button type="button" variant="secondary" onClick={handleCloseDialog}>Cerrar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
