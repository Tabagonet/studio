
'use client';

import React from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import type { CreateAdPlanOutput } from './schema';
import { TrendingUp, Calendar, Zap, Users, Megaphone, Lightbulb, BarChart3, Loader2, Save, Info, Swords, Wrench } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { useToast } from '@/hooks/use-toast';
import { saveAdPlanAction } from './actions';
import { auth } from '@/lib/firebase';
import { CompetitorAnalysisDialog } from './CompetitorAnalysisDialog';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';


export function AdPlanView({ plan, onPlanUpdate, onReset }: { plan: CreateAdPlanOutput; onPlanUpdate: (plan: CreateAdPlanOutput) => void; onReset: () => void; }) {
    const [isSavingPlan, setIsSavingPlan] = React.useState(false);
    const [isCompetitorAnalysisOpen, setIsCompetitorAnalysisOpen] = React.useState(false);
    const { toast } = useToast();

    const handleSavePlan = async () => {
        if (!plan) return;
        setIsSavingPlan(true);
        const user = auth.currentUser;
        if (!user) {
            toast({ title: "No autenticado", variant: "destructive" });
            setIsSavingPlan(false);
            return;
        }
        
        try {
            const token = await user.getIdToken();
            const result = await saveAdPlanAction(plan, token);

            if (result.success) {
                toast({ title: "¡Plan Guardado!", description: "Tus cambios se han guardado correctamente." });
            } else {
                throw new Error(result.error || "No se pudo guardar el plan.");
            }
        } catch (error: any) {
            toast({ title: "Error al Guardar", description: error.message, variant: "destructive" });
        } finally {
            setIsSavingPlan(false);
        }
    };
    
    if (!plan) {
        return <Loader2 className="h-8 w-8 animate-spin" />;
    }
    
    return (
        <div className="space-y-6">
            <CompetitorAnalysisDialog
                isOpen={isCompetitorAnalysisOpen}
                onOpenChange={setIsCompetitorAnalysisOpen}
                url={plan.url}
                initialContext={plan.additional_context}
            />
            
             <div className="flex flex-wrap gap-2 justify-end">
                <Button variant="outline" onClick={onReset}><Zap className="mr-2 h-4 w-4" /> Crear Nuevo Plan</Button>
                <Button variant="outline" onClick={() => setIsCompetitorAnalysisOpen(true)}><Swords className="mr-2 h-4 w-4" /> Analizar Competencia</Button>
                <Button onClick={handleSavePlan} disabled={isSavingPlan}>{isSavingPlan ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />} Guardar Plan</Button>
            </div>
            
            {plan.additional_context && (
                 <Card>
                    <CardHeader><CardTitle className="flex items-center gap-3"><Info className="h-6 w-6 text-primary" /> Contexto Adicional</CardTitle></CardHeader>
                    <CardContent><p className="text-muted-foreground whitespace-pre-line">{plan.additional_context}</p></CardContent>
                </Card>
            )}

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <Card><CardHeader><CardTitle className="flex items-center gap-3"><Users className="h-6 w-6 text-primary" /> Buyer Persona</CardTitle></CardHeader><CardContent><p className="text-muted-foreground leading-relaxed">{plan.buyer_persona}</p></CardContent></Card>
                <Card><CardHeader><CardTitle className="flex items-center gap-3"><Lightbulb className="h-6 w-6 text-primary" /> Propuesta de Valor</CardTitle></CardHeader><CardContent><p className="text-muted-foreground leading-relaxed">{plan.value_proposition}</p></CardContent></Card>
            </div>
            
            <Card>
                <CardHeader><CardTitle className="flex items-center gap-3"><Megaphone className="h-6 w-6 text-primary" /> Embudo de Conversión</CardTitle></CardHeader>
                <CardContent>
                    <Accordion type="single" collapsible className="w-full" defaultValue="awareness">
                        {plan.funnel && Object.entries(plan.funnel).map(([stage, details]) => (
                             <AccordionItem value={stage} key={stage}>
                                <AccordionTrigger className="text-lg font-semibold capitalize">{stage}</AccordionTrigger>
                                <AccordionContent className="space-y-4 pt-2">
                                    <p className="font-medium text-primary">{details.objective}</p>
                                    <div className="flex flex-wrap gap-2"><span className="text-sm font-semibold">Canales:</span>{(details.channels ?? []).map(item => <Badge key={item} variant="secondary">{item}</Badge>)}</div>
                                    <div className="flex flex-wrap gap-2"><span className="text-sm font-semibold">Contenidos:</span>{(details.content_types ?? []).map(item => <Badge key={item} variant="outline">{item}</Badge>)}</div>
                                    <div className="flex flex-wrap gap-2"><span className="text-sm font-semibold">KPIs:</span>{(details.kpis ?? []).map(item => <Badge key={item} variant="secondary">{item}</Badge>)}</div>
                                </AccordionContent>
                             </AccordionItem>
                        ))}
                    </Accordion>
                </CardContent>
            </Card>
            
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <Card>
                    <CardHeader><CardTitle className="flex items-center gap-2"><BarChart3 className="h-6 w-6 text-primary" /> Plan de Medios</CardTitle></CardHeader>
                    <CardContent className="space-y-4">
                        <div><h4 className="font-semibold mb-1">Distribución de Presupuesto</h4><p className="text-sm text-muted-foreground">{plan.media_plan?.budget_distribution}</p></div>
                        <Separator />
                        <div><h4 className="font-semibold mb-1">Sugerencias de Campañas</h4><ul className="list-disc list-inside text-sm text-muted-foreground space-y-1">{(plan.media_plan?.campaign_suggestions ?? []).map((item, i) => <li key={i}>{item}</li>)}</ul></div>
                    </CardContent>
                </Card>
                <Card>
                    <CardHeader><CardTitle className="flex items-center gap-2"><Wrench className="h-6 w-6 text-primary" /> Herramientas Recomendadas</CardTitle></CardHeader>
                    <CardContent className="space-y-3">{(plan.recommended_tools ?? []).map((item, i) => <div key={i}><p className="font-semibold text-sm">{item.category}</p><p className="text-sm text-muted-foreground">{item.tools}</p></div>)}</CardContent>
                </Card>
            </div>
            
            <Card>
                 <CardHeader><CardTitle className="flex items-center gap-3"><Zap className="h-6 w-6 text-primary" /> Recomendaciones Estratégicas</CardTitle></CardHeader>
                 <CardContent className="space-y-4">
                    <Accordion type="multiple" className="w-full">
                        <AccordionItem value="pos"><AccordionTrigger>Posicionamiento</AccordionTrigger><AccordionContent><p className="text-muted-foreground">{plan.strategic_recommendations?.positioning}</p></AccordionContent></AccordionItem>
                        <AccordionItem value="tone"><AccordionTrigger>Tono de Voz</AccordionTrigger><AccordionContent><p className="text-muted-foreground">{plan.strategic_recommendations?.tone_of_voice}</p></AccordionContent></AccordionItem>
                        <AccordionItem value="diff"><AccordionTrigger>Diferenciación</AccordionTrigger><AccordionContent><p className="text-muted-foreground">{plan.strategic_recommendations?.differentiation}</p></AccordionContent></AccordionItem>
                    </Accordion>
                 </CardContent>
            </Card>
            
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                 <Card>
                    <CardHeader><CardTitle className="flex items-center gap-2"><TrendingUp className="h-5 w-5 text-primary" /> KPIs Globales</CardTitle></CardHeader>
                    <CardContent><ul className="list-disc list-inside text-muted-foreground space-y-1">{(plan.key_performance_indicators ?? []).map((kpi, index) => <li key={index}>{kpi}</li>)}</ul></CardContent>
                </Card>
                <Card>
                    <CardHeader><CardTitle className="flex items-center gap-2"><Calendar className="h-5 w-5 text-primary" /> Calendario de Acciones</CardTitle></CardHeader>
                    <CardContent className="space-y-4">
                         {(plan.content_calendar ?? []).map((milestone, index) => (
                            <div key={index} className="relative pl-6">
                                <div className="absolute left-0 top-1 h-full w-px bg-border"></div>
                                <div className="absolute left-[-5px] top-1.5 h-3 w-3 rounded-full bg-primary"></div>
                                <h4 className="font-semibold">{milestone.month}: {milestone.focus}</h4>
                                <ul className="list-disc list-inside text-sm text-muted-foreground pl-2 mt-1 space-y-0.5">{(milestone.actions ?? []).map((action, i) => <li key={i}>{action}</li>)}</ul>
                            </div>
                         ))}
                    </CardContent>
                </Card>
            </div>

        </div>
    );
}
