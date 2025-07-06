
'use client';

import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import type { CreateAdPlanOutput, Strategy } from './schema';
import { Calendar, Zap, Users, Megaphone, Lightbulb, BarChart3, Loader2, Save, Info, Swords, DollarSign } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { saveAdPlanAction } from './actions';
import { auth } from '@/lib/firebase';
import { CompetitorAnalysisDialog } from './CompetitorAnalysisDialog';
import { StrategiesTable } from './StrategiesTable';
import { StrategyDetailDialog } from './StrategyDetailDialog';
import { CreativeStudioDialog } from './CreativeStudioDialog';
import { formatCurrency } from '@/lib/utils';

interface AdPlanViewProps {
  plan: CreateAdPlanOutput;
  onPlanUpdate: (plan: CreateAdPlanOutput) => void;
  onReset: () => void;
  companyInfo: { name: string; logoUrl: string | null };
}

export function AdPlanView({ plan, onPlanUpdate, onReset, companyInfo }: AdPlanViewProps) {
    const [isSavingPlan, setIsSavingPlan] = useState(false);
    const [isCompetitorAnalysisOpen, setIsCompetitorAnalysisOpen] = useState(false);
    
    // State for managing dialogs
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
                initialContext={plan.additional_context}
            />
            <StrategyDetailDialog
                plan={plan}
                strategy={selectedStrategyForTasks}
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

             <Card>
                <CardHeader>
                    <CardTitle>Resumen Ejecutivo</CardTitle>
                </CardHeader>
                <CardContent>
                    <p className="text-muted-foreground whitespace-pre-line">{plan.executive_summary}</p>
                </CardContent>
             </Card>
            
            {plan.additional_context && (
                 <Card>
                    <CardHeader><CardTitle className="flex items-center gap-3"><Info className="h-6 w-6 text-primary" /> Contexto Adicional</CardTitle></CardHeader>
                    <CardContent><p className="text-muted-foreground whitespace-pre-line">{plan.additional_context}</p></CardContent>
                </Card>
            )}

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <Card><CardHeader><CardTitle className="flex items-center gap-3"><Users className="h-6 w-6 text-primary" /> Público Objetivo</CardTitle></CardHeader><CardContent><p className="text-muted-foreground leading-relaxed whitespace-pre-line">{plan.target_audience}</p></CardContent></Card>
                <Card><CardHeader><CardTitle className="flex items-center gap-3"><DollarSign className="h-6 w-6 text-primary" /> Presupuesto Total Mensual Estimado</CardTitle></CardHeader><CardContent><p className="text-3xl font-bold">{formatCurrency(plan.total_monthly_budget)}</p></CardContent></Card>
            </div>
            
            <Card>
                <CardHeader>
                    <CardTitle className="flex items-center gap-3"><BarChart3 className="h-6 w-6 text-primary" /> Estrategias por Plataforma</CardTitle>
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

            <Card>
                <CardHeader><CardTitle className="flex items-center gap-2"><Megaphone className="h-6 w-6 text-primary" /> Propuesta de Honorarios</CardTitle></CardHeader>
                <CardContent className="space-y-2">
                    <p className="flex justify-between"><span>Cuota de Configuración (Setup):</span> <span className="font-semibold">{formatCurrency(plan.fee_proposal.setup_fee)}</span></p>
                    <p className="flex justify-between"><span>Cuota de Gestión Mensual:</span> <span className="font-semibold">{formatCurrency(plan.fee_proposal.management_fee)}</span></p>
                    <p className="text-sm text-muted-foreground pt-2 border-t">{plan.fee_proposal.fee_description}</p>
                </CardContent>
            </Card>
            
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <Card>
                    <CardHeader><CardTitle className="flex items-center gap-2"><Lightbulb className="h-5 w-5 text-primary" /> KPIs Globales</CardTitle></CardHeader>
                    <CardContent><ul className="list-disc list-inside text-muted-foreground space-y-1">{(plan.kpis ?? []).map((kpi, index) => <li key={index}>{kpi}</li>)}</ul></CardContent>
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
        </div>
    );
}
