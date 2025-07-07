
'use client';

import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import type { CreateAdPlanOutput, Strategy } from './schema';
import { Calendar, Zap, Users, Target, Megaphone, Lightbulb, BarChart3, Loader2, Save, Info, Swords, Wrench, Star, DollarSign, Palette } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { saveAdPlanAction } from './actions';
import { auth } from '@/lib/firebase';
import { CompetitorAnalysisDialog } from './CompetitorAnalysisDialog';
import { StrategiesTable } from './StrategiesTable';
import { StrategyDetailDialog } from './StrategyDetailDialog';
import { CreativeStudioDialog } from './CreativeStudioDialog';
import { formatCurrency } from '@/lib/utils';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import type { Company } from '@/lib/types';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';

interface AdPlanViewProps {
  plan: CreateAdPlanOutput;
  onPlanUpdate: (plan: CreateAdPlanOutput) => void;
  onReset: () => void;
  companyInfo: Company | null;
}

const InfoCard = ({ title, content }: { title: string, content?: string | null }) => {
    if (!content) return null;
    return (
        <Card>
            <CardHeader><CardTitle className="flex items-center gap-3"><Info className="h-6 w-6 text-primary" /> {title}</CardTitle></CardHeader>
            <CardContent>
                <ScrollArea className="h-48 rounded-md border bg-muted/20 p-4">
                    <p className="text-sm text-muted-foreground whitespace-pre-line">{content}</p>
                </ScrollArea>
            </CardContent>
        </Card>
    );
};

const SimpleInfoCard = ({ title, content, icon: Icon }: { title: string, content?: string | string[] | null, icon: React.ElementType }) => {
    if (!content || (Array.isArray(content) && content.length === 0)) return null;
    return (
        <Card>
            <CardHeader className="pb-2">
                <CardTitle className="flex items-center gap-2 text-base font-semibold">
                    <Icon className="h-4 w-4 text-primary" />
                    <span>{title}</span>
                </CardTitle>
            </CardHeader>
            <CardContent>
                {Array.isArray(content) ? (
                    <div className="flex flex-wrap gap-2 pt-2">
                        {content.map((item, index) => <Badge key={index} variant="secondary" className="text-sm">{item}</Badge>)}
                    </div>
                ) : (
                    <p className="text-md text-muted-foreground">{content}</p>
                )}
            </CardContent>
        </Card>
    );
};


export function AdPlanView({ plan, onPlanUpdate, onReset, companyInfo }: AdPlanViewProps) {
    const [isSavingPlan, setIsSavingPlan] = useState(false);
    const [isCompetitorAnalysisOpen, setIsCompetitorAnalysisOpen] = useState(false);
    
    const [selectedStrategyForTasks, setSelectedStrategyForTasks] = useState<Strategy | null>(null);
    const [selectedStrategyForCreatives, setSelectedStrategyForCreatives] = useState<Strategy | null>(null);

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
                initialContext={plan.additionalContext}
            />
            <StrategyDetailDialog
                plan={plan}
                strategy={selectedStrategyForTasks}
                companyInfo={companyInfo}
                onOpenChange={(open) => !open && setSelectedStrategyForTasks(null)}
                onPlanUpdate={onPlanUpdate}
            />
             <CreativeStudioDialog
                plan={plan}
                strategy={selectedStrategyForCreatives}
                onOpenChange={(open) => !open && setSelectedStrategyForCreatives(null)}
                onPlanUpdate={onPlanUpdate}
            />
            
             <div className="flex flex-wrap gap-2 justify-end">
                <Button variant="outline" onClick={onReset}><Zap className="mr-2 h-4 w-4" /> Crear Nuevo Plan</Button>
                <Button variant="outline" onClick={() => setIsCompetitorAnalysisOpen(true)}><Swords className="mr-2 h-4 w-4" /> Analizar Competencia</Button>
                <Button onClick={handleSavePlan} disabled={isSavingPlan}>{isSavingPlan ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />} Guardar Plan</Button>
            </div>

            <Accordion type="multiple" defaultValue={['item-1', 'item-2']}>
                <AccordionItem value="item-1">
                    <AccordionTrigger className="text-xl font-bold">Resumen Estratégico</AccordionTrigger>
                    <AccordionContent className="pt-4 space-y-6">
                        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                            <Card>
                                <CardHeader><CardTitle className="flex items-center gap-3"><Users className="h-6 w-6 text-primary" /> Buyer Persona</CardTitle></CardHeader>
                                <CardContent><p className="text-muted-foreground leading-relaxed whitespace-pre-line">{plan.buyer_persona}</p></CardContent>
                            </Card>
                            <Card>
                                <CardHeader><CardTitle className="flex items-center gap-3"><Target className="h-6 w-6 text-primary" /> Propuesta de Valor</CardTitle></CardHeader>
                                <CardContent><p className="text-muted-foreground leading-relaxed whitespace-pre-line">{plan.value_proposition}</p></CardContent>
                            </Card>
                        </div>
                    </AccordionContent>
                </AccordionItem>
                <AccordionItem value="item-2">
                    <AccordionTrigger className="text-xl font-bold">Contexto Proporcionado</AccordionTrigger>
                    <AccordionContent className="pt-4 space-y-6">
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mb-4">
                            <SimpleInfoCard title="Objetivo Prioritario" content={plan.priorityObjective} icon={Star} />
                            <SimpleInfoCard title="Presupuesto Indicado" content={plan.monthlyBudget} icon={DollarSign} />
                            <SimpleInfoCard title="Personalidad de Marca" content={plan.brandPersonality} icon={Palette} />
                        </div>
                        <InfoCard title="Información de la Empresa" content={plan.companyInfo} />
                        <InfoCard title="Propuesta de Valor y Diferenciación" content={plan.valueProposition} />
                        <InfoCard title="Público Objetivo y Problemas" content={plan.targetAudience} />
                        <InfoCard title="Competencia y Mercado" content={plan.competitors} />
                        <InfoCard title="Contexto Adicional (Notas Finales)" content={plan.additionalContext} />
                    </AccordionContent>
                </AccordionItem>
            </Accordion>
            
             <Card>
                <CardHeader>
                    <CardTitle className="flex items-center gap-3"><BarChart3 className="h-6 w-6 text-primary" /> Embudo de Conversión</CardTitle>
                    <CardDescription>Etapas clave del viaje del cliente y cómo interactuar en cada una.</CardDescription>
                </CardHeader>
                <CardContent>
                    <Accordion type="single" collapsible className="w-full" defaultValue={plan.funnel?.[0]?.stage_name}>
                        {(plan.funnel || []).map((stage) => (
                            <AccordionItem value={stage.stage_name} key={stage.stage_name}>
                                <AccordionTrigger className="text-lg font-semibold capitalize">{stage.stage_name}</AccordionTrigger>
                                <AccordionContent className="space-y-4 pt-2">
                                    <p className="text-sm text-muted-foreground italic">{stage.description}</p>
                                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                        <div>
                                            <h4 className="font-semibold mb-2">Canales</h4>
                                            <ul className="list-disc list-inside text-sm text-muted-foreground">{stage.channels.map((c, i) => <li key={i}>{c}</li>)}</ul>
                                        </div>
                                        <div>
                                            <h4 className="font-semibold mb-2">Contenidos</h4>
                                            <ul className="list-disc list-inside text-sm text-muted-foreground">{stage.content_types.map((c, i) => <li key={i}>{c}</li>)}</ul>
                                        </div>
                                         <div>
                                            <h4 className="font-semibold mb-2">KPIs</h4>
                                            <ul className="list-disc list-inside text-sm text-muted-foreground">{stage.kpis.map((k, i) => <li key={i}>{k}</li>)}</ul>
                                        </div>
                                    </div>
                                </AccordionContent>
                            </AccordionItem>
                        ))}
                    </Accordion>
                </CardContent>
            </Card>

            <Card>
                <CardHeader>
                    <CardTitle className="flex items-center gap-3"><Megaphone className="h-6 w-6 text-primary" /> Plan de Medios y Estrategias</CardTitle>
                    <CardDescription>Plan de acción detallado por cada plataforma recomendada. Haz clic en cada una para ver tareas y creatividades.</CardDescription>
                </CardHeader>
                <CardContent>
                   <StrategiesTable 
                     strategies={plan.strategies} 
                     onViewTasks={setSelectedStrategyForTasks}
                     onViewCreatives={setSelectedStrategyForCreatives}
                   />
                </CardContent>
            </Card>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                 <Card>
                    <CardHeader><CardTitle className="flex items-center gap-2"><Wrench className="h-5 w-5 text-primary" /> Herramientas Recomendadas</CardTitle></CardHeader>
                    <CardContent><ul className="list-disc list-inside text-muted-foreground space-y-1">{(plan.recommended_tools ?? []).map((tool, index) => <li key={index}>{tool}</li>)}</ul></CardContent>
                </Card>
                <Card>
                    <CardHeader><CardTitle className="flex items-center gap-2"><Lightbulb className="h-5 w-5 text-primary" /> Recomendaciones Extra</CardTitle></CardHeader>
                    <CardContent><ul className="list-disc list-inside text-muted-foreground space-y-1">{(plan.extra_recommendations ?? []).map((rec, index) => <li key={index}>{rec}</li>)}</ul></CardContent>
                </Card>
            </div>

            <Card>
                <CardHeader><CardTitle className="flex items-center gap-2"><Megaphone className="h-6 w-6 text-primary" /> Propuesta de Honorarios</CardTitle></CardHeader>
                <CardContent className="space-y-2">
                    <p className="flex justify-between"><span>Cuota de Configuración (Setup):</span> <span className="font-semibold">{formatCurrency(plan.fee_proposal.setup_fee)}</span></p>
                    <p className="flex justify-between"><span>Cuota de Gestión Mensual:</span> <span className="font-semibold">{formatCurrency(plan.fee_proposal.management_fee)}</span></p>
                    <p className="text-sm text-muted-foreground pt-2 border-t">{plan.fee_proposal.fee_description}</p>
                </CardContent>
            </Card>
            
            <Card>
                <CardHeader><CardTitle className="flex items-center gap-2"><Calendar className="h-5 w-5 text-primary" /> Calendario de Acciones (3 Meses)</CardTitle></CardHeader>
                <CardContent className="space-y-4">
                     {(plan.calendar ?? []).map((milestone, index) => (
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
    );
}
