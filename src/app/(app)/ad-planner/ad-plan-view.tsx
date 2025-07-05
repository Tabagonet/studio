
'use client';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import type { CreateAdPlanOutput } from './schema';
import { DollarSign, Printer, RotateCcw, Target, TrendingUp, Calendar, Zap, ClipboardCheck, Users, Megaphone, Lightbulb, MapPin, BarChart } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import Image from 'next/image';

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
            <div className="report-header hidden print:block">
                <Image src="/images/logo.png" alt="Logo" width={60} height={60} className="mx-auto" />
                <h1 className="text-2xl font-bold mt-2">Plan de Publicidad Digital</h1>
                <p className="text-sm text-gray-500">Preparado por AutoPress AI el {new Date().toLocaleDateString('es-ES')}</p>
            </div>

             <div className="flex flex-wrap gap-2 justify-end print-hide">
                <Button variant="outline" onClick={onReset}><RotateCcw className="mr-2 h-4 w-4" /> Crear Nuevo Plan</Button>
                <Button onClick={handlePrint}><Printer className="mr-2 h-4 w-4" /> Imprimir Plan</Button>
            </div>
            
            <Card>
                <CardHeader>
                    <CardTitle className="flex items-center gap-3"><ClipboardCheck className="h-6 w-6 text-primary" /> Resumen Ejecutivo</CardTitle>
                </CardHeader>
                <CardContent>
                    <p className="text-muted-foreground leading-relaxed">{plan.executive_summary}</p>
                </CardContent>
            </Card>

            <Card>
                <CardHeader>
                    <CardTitle className="flex items-center gap-3"><Target className="h-6 w-6 text-primary" /> Público Objetivo</CardTitle>
                </CardHeader>
                <CardContent>
                    <p className="text-muted-foreground whitespace-pre-line">{plan.target_audience}</p>
                </CardContent>
            </Card>
            
            <Card>
                <CardHeader>
                    <CardTitle className="flex items-center gap-3"><Megaphone className="h-6 w-6 text-primary" /> Estrategias y Presupuesto</CardTitle>
                    <CardDescription>Total mensual recomendado: <span className="font-bold text-lg text-primary">{formatCurrency(plan.total_monthly_budget)}</span></CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                    {plan.strategies.map((strategy, index) => (
                        <div key={index} className="p-4 border rounded-lg space-y-3 bg-muted/20">
                            <div className="flex flex-col sm:flex-row sm:justify-between">
                                <h3 className="text-xl font-semibold text-secondary">{strategy.platform}</h3>
                                <p className="font-bold text-lg">{formatCurrency(strategy.monthly_budget)} / mes</p>
                            </div>
                            <p className="text-sm text-muted-foreground italic">
                                <Lightbulb className="inline-block mr-2 h-4 w-4" />
                                {strategy.strategy_rationale}
                            </p>
                            <div className="flex flex-wrap items-center gap-4 text-sm pt-2">
                                <div className="flex items-center gap-2">
                                    <MapPin className="h-4 w-4 text-muted-foreground" />
                                    <span>Fase del embudo: <Badge>{strategy.funnel_stage}</Badge></span>
                                </div>
                                <div className="flex items-center gap-2">
                                    <BarChart className="h-4 w-4 text-muted-foreground" />
                                    <span>Tipo de campaña: <Badge>{strategy.campaign_type}</Badge></span>
                                </div>
                            </div>
                            <div className="flex flex-wrap gap-2 pt-2">
                                <span className="text-sm font-medium mr-2">Formatos:</span>
                                {strategy.ad_formats.map(format => <Badge key={format} variant="outline">{format}</Badge>)}
                            </div>
                        </div>
                    ))}
                </CardContent>
            </Card>
            
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                 <Card>
                    <CardHeader>
                        <CardTitle className="flex items-center gap-2"><TrendingUp className="h-5 w-5 text-primary" /> KPIs de Seguimiento</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <ul className="list-disc list-inside text-muted-foreground space-y-1">
                            {plan.kpis.map((kpi, index) => <li key={index}>{kpi}</li>)}
                        </ul>
                    </CardContent>
                </Card>
                <Card>
                    <CardHeader>
                        <CardTitle className="flex items-center gap-2"><Calendar className="h-5 w-5 text-primary" /> Calendario (Primeros 3 meses)</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-4">
                         {plan.calendar.map((milestone, index) => (
                            <div key={index} className="relative pl-6">
                                <div className="absolute left-0 top-1 h-full w-px bg-border"></div>
                                <div className="absolute left-[-5px] top-1.5 h-3 w-3 rounded-full bg-secondary"></div>
                                <h4 className="font-semibold">{milestone.month}: {milestone.focus}</h4>
                                <ul className="list-disc list-inside text-sm text-muted-foreground pl-2 mt-1 space-y-0.5">
                                    {milestone.actions.map((action, i) => <li key={i}>{action}</li>)}
                                </ul>
                            </div>
                         ))}
                    </CardContent>
                </Card>
            </div>
            
            <Card className="bg-accent/50 border-primary/20">
                 <CardHeader>
                    <CardTitle className="flex items-center gap-3"><Zap className="h-6 w-6 text-primary" /> Propuesta de Gestión</CardTitle>
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
