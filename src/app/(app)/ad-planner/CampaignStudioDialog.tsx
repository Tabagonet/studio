
'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter, DialogClose } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Loader2, RefreshCw, Bot, Copy, Sparkles } from 'lucide-react';
import type { CreateAdPlanOutput, GoogleAdsCampaign } from './schema';
import { useToast } from '@/hooks/use-toast';
import { generateGoogleCampaignAction } from './actions';
import { auth } from '@/lib/firebase';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';

interface CampaignStudioDialogProps {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  plan: CreateAdPlanOutput | null;
}

export function CampaignStudioDialog({ isOpen, onOpenChange, plan }: CampaignStudioDialogProps) {
  const [campaign, setCampaign] = useState<GoogleAdsCampaign | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { toast } = useToast();

  const generateCampaign = useCallback(async () => {
    if (!plan) return;
    
    setIsLoading(true);
    setError(null);
    setCampaign(null);
    const user = auth.currentUser;
    if (!user) {
      setError('Error de autenticación.');
      setIsLoading(false);
      return;
    }

    try {
      const token = await user.getIdToken();
      const result = await generateGoogleCampaignAction({
        url: plan.url,
        objectives: plan.objectives,
        buyer_persona: plan.buyer_persona,
        value_proposition: plan.value_proposition,
      }, token);

      if (result.error || !result.data) {
        throw new Error(result.error || 'La IA no pudo generar la campaña.');
      }
      
      setCampaign(result.data);
      toast({ title: 'Campaña de Google Ads Generada', description: 'Se ha creado una estructura de campaña completa.' });

    } catch (err: any) {
      setError(err.message);
      toast({ title: 'Error al Generar Campaña', description: err.message, variant: 'destructive' });
    } finally {
      setIsLoading(false);
    }
  }, [plan, toast]);
  
  useEffect(() => {
    if (isOpen && !campaign && plan) {
      generateCampaign();
    }
  }, [isOpen, campaign, plan, generateCampaign]);

  const handleCopyToClipboard = (content: string, title: string) => {
    navigator.clipboard.writeText(content);
    toast({ title: 'Copiado al portapapeles', description: title });
  };
  
  const handleExportFullCampaign = () => {
    if (!campaign) return;
    let fullText = `Campaña de Google Ads: ${campaign.campaignName}\n`;
    fullText += `==================================\n\n`;
    
    campaign.adGroups.forEach((group, index) => {
        fullText += `Grupo de Anuncios ${index + 1}: ${group.adGroupName}\n`;
        fullText += `----------------------------------\n`;
        fullText += `** Palabras Clave Sugeridas **\n`;
        group.keywords.forEach(kw => fullText += `- ${kw}\n`);
        fullText += `\n`;
        
        group.ads.forEach((ad, adIndex) => {
            fullText += `** Anuncio ${adIndex + 1} **\n`;
            fullText += `Titulares:\n`;
            ad.headlines.forEach(h => fullText += `  - ${h}\n`);
            fullText += `Descripciones:\n`;
            ad.descriptions.forEach(d => fullText += `  - ${d}\n`);
            fullText += `\n`;
        });
    });

    const blob = new Blob([fullText], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `google-ads-campaign-${plan?.url.replace(/https?:\/\//, '').replace(/\//g, '_')}.txt`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    toast({ title: "Campaña exportada" });
  };

  const renderContent = () => {
    if (isLoading) {
      return (
        <div className="flex flex-col items-center justify-center h-full">
          <Loader2 className="h-8 w-8 animate-spin" />
          <p className="mt-2 text-muted-foreground">La IA está estructurando tu campaña de Google Ads...</p>
        </div>
      );
    }
    if (error) {
        return (
             <div className="flex flex-col items-center justify-center h-full text-center p-4">
              <p className="font-semibold text-destructive">Error al generar la campaña</p>
              <p className="text-sm text-muted-foreground">{error}</p>
            </div>
        )
    }

    if (campaign) {
      return (
         <ScrollArea className="h-full pr-2">
            <div className="space-y-4">
                 <h3 className="text-xl font-bold text-center">{campaign.campaignName}</h3>
                 <Accordion type="multiple" defaultValue={[campaign.adGroups[0]?.adGroupName]}>
                    {campaign.adGroups.map((group, index) => (
                        <AccordionItem value={group.adGroupName} key={index}>
                            <AccordionTrigger className="text-lg">{group.adGroupName}</AccordionTrigger>
                            <AccordionContent className="space-y-4">
                                <div>
                                    <h4 className="font-semibold flex items-center justify-between">Palabras Clave Sugeridas <Button variant="ghost" size="icon-sm" onClick={() => handleCopyToClipboard(group.keywords.join('\n'), 'Palabras Clave')}><Copy className="h-4 w-4"/></Button></h4>
                                    <div className="p-3 border rounded-md bg-muted/50 text-sm text-muted-foreground">
                                        {group.keywords.join(', ')}
                                    </div>
                                </div>
                                {group.ads.map((ad, adIndex) => (
                                     <div key={adIndex} className="p-4 border rounded-lg">
                                        <h5 className="font-semibold mb-2">Anuncio Sugerido {adIndex + 1}</h5>
                                        <div className="space-y-2">
                                            <p className="text-xs font-medium text-muted-foreground">Titulares:</p>
                                            <ul className="list-disc list-inside pl-2 space-y-1 text-sm">
                                                {ad.headlines.map((h, hIndex) => <li key={hIndex}>{h}</li>)}
                                            </ul>
                                             <p className="text-xs font-medium text-muted-foreground pt-2">Descripciones:</p>
                                            <ul className="list-disc list-inside pl-2 space-y-1 text-sm">
                                                {ad.descriptions.map((d, dIndex) => <li key={dIndex}>{d}</li>)}
                                            </ul>
                                        </div>
                                    </div>
                                ))}
                            </AccordionContent>
                        </AccordionItem>
                    ))}
                 </Accordion>
            </div>
        </ScrollArea>
      )
    }
    return (
       <div className="flex flex-col items-center justify-center h-full">
          <p className="text-muted-foreground">No se pudo generar la estructura de campaña.</p>
        </div>
    );
  }
  
  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl h-[90vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="text-2xl flex items-center gap-2">
            <Bot className="h-6 w-6 text-primary" /> Estudio de Campaña de Google Ads
          </DialogTitle>
          <DialogDescription>
             La IA ha generado una estructura de campaña completa con grupos de anuncios, palabras clave y textos.
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 min-h-0 py-4">
          {renderContent()}
        </div>
        
        <DialogFooter className="justify-between sm:justify-between">
           <div className="flex gap-2">
             <Button variant="outline" onClick={generateCampaign} disabled={isLoading}>
                  <RefreshCw className="mr-2 h-4 w-4" />
                  Volver a Generar
              </Button>
               <Button variant="outline" onClick={handleExportFullCampaign} disabled={!campaign || isLoading}>
                  <Copy className="mr-2 h-4 w-4" />
                  Exportar Campaña Completa
              </Button>
           </div>
            <DialogClose asChild><Button type="button" variant="secondary">Cerrar</Button></DialogClose>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
