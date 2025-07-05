
'use client';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import type { CreateAdPlanOutput } from '@/ai/flows/create-ad-plan-flow';
import { DollarSign, Printer, RotateCcw, Target, TrendingUp, Calendar, Zap, ClipboardCheck, Users, Megaphone } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';

interface AdPlanViewProps {
    plan: CreateAdPlanOutput;
    onReset: () => void;
}

const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR' }).format(value);
};

export function AdPlanView({ plan, onReset }: AdPlanViewProps) {
    
    const handlePrint = () => {
        window.print();
    };

    return (
        <div className="space-y-6 report-view">
             <div className="flex flex-wrap gap-2 justify-end print-hide">
                <Button variant="outline" onClick={onReset}><RotateCcw className="mr-2" /> Crear Nuevo Plan</Button>
                <Button onClick={handlePrint}><Printer className="mr-2" /> Imprimir Plan</Button>
            </div>
            
            <Card>
                <CardHeader>
                    <CardTitle className="flex items-center gap-2"><ClipboardCheck /> Resumen Ejecutivo</CardTitle>
                </CardHeader>
                <CardContent>
                    <p className="text-muted-foreground">{plan.executive_summary}</p>
                </CardContent>
            </Card>

            <Card>
                <CardHeader>
                    <CardTitle className="flex items-center gap-2"><Target /> Público Objetivo</CardTitle>
                </CardHeader>
                <CardContent>
                    <p className="text-muted-foreground">{plan.target_audience}</p>
                </CardContent>
            </Card>
            
            <Card>
                <CardHeader>
                    <CardTitle className="flex items-center gap-2"><Megaphone /> Estrategias y Presupuesto</CardTitle>
                    <CardDescription>Total mensual recomendado: <span className="font-bold text-primary">{formatCurrency(plan.total_monthly_budget)}</span></CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                    {plan.strategies.map((strategy, index) => (
                        <div key={index} className="p-4 border rounded-lg">
                            <h3 className="font-semibold text-lg text-primary">{strategy.platform}</h3>
                             <p className="font-semibold">{formatCurrency(strategy.monthly_budget)} / mes</p>
                            <p className="text-sm text-muted-foreground mt-1">{strategy.strategy}</p>
                            <div className="flex flex-wrap gap-2 mt-3">
                                {strategy.ad_formats.map(format => <Badge key={format} variant="secondary">{format}</Badge>)}
                            </div>
                        </div>
                    ))}
                </CardContent>
            </Card>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                 <Card>
                    <CardHeader>
                        <CardTitle className="flex items-center gap-2"><TrendingUp /> KPIs de Seguimiento</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <ul className="list-disc list-inside text-muted-foreground space-y-1">
                            {plan.kpis.map((kpi, index) => <li key={index}>{kpi}</li>)}
                        </ul>
                    </CardContent>
                </Card>
                <Card>
                    <CardHeader>
                        <CardTitle className="flex items-center gap-2"><Calendar /> Calendario (Primeros 3 meses)</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-4">
                         {plan.calendar.map((milestone, index) => (
                            <div key={index} className="relative pl-6">
                                <div className="absolute left-0 top-1 h-full w-px bg-border"></div>
                                <div className="absolute left-[-5px] top-1.5 h-3 w-3 rounded-full bg-primary"></div>
                                <h4 className="font-semibold">{milestone.month}: {milestone.focus}</h4>
                                <ul className="list-disc list-inside text-sm text-muted-foreground pl-2">
                                    {milestone.actions.map((action, i) => <li key={i}>{action}</li>)}
                                </ul>
                            </div>
                         ))}
                    </CardContent>
                </Card>
            </div>
            
            <Card className="bg-accent/50 border-primary/20">
                 <CardHeader>
                    <CardTitle className="flex items-center gap-2"><Zap /> Propuesta de Gestión</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                    <p className="text-muted-foreground">{plan.fee_proposal.fee_description}</p>
                    <Separator />
                    <div className="flex flex-col sm:flex-row sm:justify-around text-center gap-4">
                        <div>
                            <p className="text-sm text-muted-foreground">Cuota de Configuración</p>
                            <p className="text-2xl font-bold">{formatCurrency(plan.fee_proposal.setup_fee)}</p>
                        </div>
                        <div>
                            <p className="text-sm text-muted-foreground">Cuota de Gestión Mensual</p>
                            <p className="text-2xl font-bold">{formatCurrency(plan.fee_proposal.management_fee)}</p>
                        </div>
                    </div>
                </CardContent>
            </Card>

        </div>
    );
}
