
'use client';

import React from 'react';
import { pdf, Document, Page, Text, View, StyleSheet, Font, Image as PdfImage } from '@react-pdf/renderer';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import type { CreateAdPlanOutput, Strategy } from './schema';
import { DollarSign, Printer, RotateCcw, Target, TrendingUp, Calendar, Zap, ClipboardCheck, Users, Megaphone, Lightbulb, MapPin, BarChart, Loader2, ListOrdered, Save, ClipboardPen, Info } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import Image from 'next/image';
import { useToast } from '@/hooks/use-toast';
import { StrategyDetailDialog } from './StrategyDetailDialog';
import { CreativeStudioDialog } from './CreativeStudioDialog';
import { formatCurrency } from '@/lib/utils';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { saveAdPlanAction } from './actions';
import { auth } from '@/lib/firebase';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { Textarea } from '@/components/ui/textarea';


// Register fonts for PDF rendering
Font.register({
    family: 'Helvetica',
    fonts: [
        { src: 'https://fonts.gstatic.com/s/ptsans/v17/jizaRExUiTo99u79D0-ExdGM.ttf', fontWeight: 'normal' },
        { src: 'https://fonts.gstatic.com/s/ptsans/v17/jizfRExUiTo99u79B_mh0OOtLQ.ttf', fontWeight: 'bold' },
        { src: 'https://fonts.gstatic.com/s/ptsans/v17/jizcRExUiTo99u79D0eEwMOpbA.ttf', fontStyle: 'italic' },
    ]
});


// Styles for the PDF document
const styles = StyleSheet.create({
  page: { fontFamily: 'Helvetica', fontSize: 10, paddingTop: 35, paddingBottom: 65, paddingHorizontal: 35, lineHeight: 1.5, color: '#333333' },
  header: { textAlign: 'center', marginBottom: 20, borderBottomWidth: 2, borderBottomColor: '#E6E6FA', paddingBottom: 10 },
  logo: { width: 60, height: 60, marginLeft: 'auto', marginRight: 'auto', marginBottom: 10 },
  reportTitle: { fontFamily: 'Helvetica-Bold', fontSize: 24, color: '#20B2AA', marginBottom: 4 },
  reportSubtitle: { fontSize: 10, color: '#888888' },
  section: { marginBottom: 15 },
  sectionTitle: { fontFamily: 'Helvetica-Bold', fontSize: 16, color: '#20B2AA', marginBottom: 8, borderBottomWidth: 1, borderBottomColor: '#E6E6FA', paddingBottom: 4, textTransform: 'uppercase' },
  bodyText: { fontSize: 10, textAlign: 'justify' },
  preformattedText: { fontSize: 10, fontFamily: 'Helvetica', backgroundColor: '#F5F5F5', padding: 10, borderRadius: 4 },
  strategyCard: { borderWidth: 1, borderColor: '#E6E6FA', borderRadius: 5, padding: 12, marginBottom: 10, backgroundColor: '#FFFFFF' },
  strategyHeader: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 5 },
  platformTitle: { fontFamily: 'Helvetica-Bold', fontSize: 14, color: '#20B2AA' },
  monthlyBudget: { fontFamily: 'Helvetica-Bold', fontSize: 14 },
  strategyRationale: { fontFamily: 'Helvetica-Oblique', fontSize: 9, color: '#555555', marginBottom: 8 },
  badgeContainer: { flexDirection: 'row', flexWrap: 'wrap', gap: 4, marginTop: 5 },
  badge: { backgroundColor: '#E6E6FA', color: '#240a5e', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 8, fontSize: 9 },
  twoColumnLayout: { flexDirection: 'row', gap: 20 },
  column: { flex: 1 },
  kpiList: { paddingLeft: 10 },
  kpiItem: { marginBottom: 2 },
  calendarItem: { marginBottom: 8 },
  calendarFocus: { fontFamily: 'Helvetica-Bold' },
  feeProposalCard: { backgroundColor: 'rgba(32, 178, 170, 0.1)', borderWidth: 1, borderColor: 'rgba(32, 178, 170, 0.3)', borderRadius: 5, padding: 12 },
  feeContainer: { flexDirection: 'row', justifyContent: 'space-around', marginTop: 10, paddingTop: 10, borderTopWidth: 1, borderTopColor: '#E6E6FA' },
  feeItem: { textAlign: 'center' },
  pageNumber: { position: 'absolute', fontSize: 8, bottom: 30, left: 0, right: 0, textAlign: 'center', color: 'grey' },
});


// PDF Document Component
const AdPlanPDF = ({ plan, companyName, logoUrl }: { plan: CreateAdPlanOutput; companyName: string; logoUrl: string | null }) => (
    <Document>
        <Page size="A4" style={styles.page}>
            <View style={styles.header}>
                {logoUrl && <PdfImage style={styles.logo} src={logoUrl} />}
                <Text style={styles.reportTitle}>Plan de Publicidad Digital</Text>
                <Text style={styles.reportSubtitle}>Preparado para {companyName} por AutoPress AI el {new Date().toLocaleDateString('es-ES')}</Text>
            </View>

            <View style={styles.section}><Text style={styles.sectionTitle}>Resumen Ejecutivo</Text><Text style={styles.bodyText}>{plan.executive_summary}</Text></View>
            <View style={styles.section}><Text style={styles.sectionTitle}>Público Objetivo</Text><Text style={styles.bodyText}>{plan.target_audience.replace(/\\n/g, '\n')}</Text></View>
            
            <View style={styles.section}>
                <Text style={styles.sectionTitle}>Estrategias y Presupuesto ({formatCurrency(plan.total_monthly_budget || 0)}/mes)</Text>
                {(plan.strategies || []).map((strategy, index) => (
                    <View key={index} style={styles.strategyCard} wrap={false}>
                        <View style={styles.strategyHeader}><Text style={styles.platformTitle}>{strategy.platform}</Text><Text style={styles.monthlyBudget}>{formatCurrency(strategy.monthly_budget)} / mes</Text></View>
                        <Text style={styles.strategyRationale}>{strategy.strategy_rationale}</Text>
                        <View style={styles.badgeContainer}><Text style={styles.badge}>Fase: {strategy.funnel_stage}</Text><Text style={styles.badge}>Campaña: {strategy.campaign_type}</Text></View>
                        <View style={[styles.badgeContainer, { marginTop: 8 }]}>{(strategy.ad_formats || []).map(format => <Text key={format} style={styles.badge}>{format}</Text>)}</View>
                    </View>
                ))}
            </View>

            <View style={styles.twoColumnLayout}>
                <View style={styles.column}><Text style={styles.sectionTitle}>KPIs</Text><View style={styles.kpiList}>{(plan.kpis || []).map((kpi, index) => <Text key={index} style={styles.kpiItem}>• {kpi}</Text>)}</View></View>
                <View style={styles.column}>
                    <Text style={styles.sectionTitle}>Calendario (3 meses)</Text>
                    {(plan.calendar || []).map((milestone, index) => (
                        <View key={index} style={styles.calendarItem}><Text style={styles.calendarFocus}>{milestone.month}: {milestone.focus}</Text>{(milestone.actions || []).map((action, i) => <Text key={i} style={{fontSize: 9, paddingLeft: 10}}>• {action}</Text>)}</View>
                    ))}
                </View>
            </View>

            <View style={styles.feeProposalCard}><Text style={styles.sectionTitle}>Propuesta de Gestión</Text><Text style={styles.bodyText}>{plan.fee_proposal?.fee_description || 'Descripción no disponible.'}</Text><View style={styles.feeContainer}>
                    <View style={styles.feeItem}><Text>Cuota de Configuración</Text><Text style={styles.monthlyBudget}>{formatCurrency(plan.fee_proposal?.setup_fee || 0)}</Text></View>
                    <View style={styles.feeItem}><Text>Gestión Mensual</Text><Text style={styles.monthlyBudget}>{formatCurrency(plan.fee_proposal?.management_fee || 0)}</Text></View>
                </View>
            </View>

            <Text style={styles.pageNumber} render={({ pageNumber, totalPages }) => `${pageNumber} / ${totalPages}`} fixed />
        </Page>
    </Document>
);


export function AdPlanView({ plan, onPlanUpdate, onReset, companyName, logoUrl }: { plan: CreateAdPlanOutput; onPlanUpdate: (plan: CreateAdPlanOutput) => void; onReset: () => void; companyName: string; logoUrl: string | null }) {
    const [isPdfLoading, setIsPdfLoading] = React.useState(false);
    const [isSavingPlan, setIsSavingPlan] = React.useState(false);
    const [detailedStrategy, setDetailedStrategy] = React.useState<Strategy | null>(null);
    const [creativeStrategy, setCreativeStrategy] = React.useState<Strategy | null>(null);
    const { toast } = useToast();

    const handleBudgetChange = (platform: string, newBudgetString: string) => {
        const newBudget = parseFloat(newBudgetString) || 0;
        
        if (!plan) return;

        const updatedStrategies = (plan.strategies || []).map(s => 
            s.platform === platform ? { ...s, monthly_budget: newBudget } : s
        );
        const newTotalBudget = updatedStrategies.reduce((sum, s) => sum + s.monthly_budget, 0);

        onPlanUpdate({
            ...plan,
            strategies: updatedStrategies,
            total_monthly_budget: newTotalBudget,
        });
    };

    const handleFeeChange = (field: 'setup_fee' | 'management_fee' | 'fee_description', value: string) => {
        if (!plan) return;
        const feeProposal = plan.fee_proposal || { setup_fee: 0, management_fee: 0, fee_description: '' };
        
        const updatedValue = field === 'fee_description' ? value : parseFloat(value) || 0;

        onPlanUpdate({
            ...plan,
            fee_proposal: {
                ...feeProposal,
                [field]: updatedValue,
            }
        });
    };


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

    const handleDownload = async () => {
        if (!plan) return;
        // Use an image proxy for the PDF to avoid CORS issues.
        const proxiedLogoUrl = logoUrl ? `/api/image-proxy?url=${encodeURIComponent(logoUrl)}` : null;

        setIsPdfLoading(true);
        try {
            const blob = await pdf(<AdPlanPDF plan={plan} companyName={companyName} logoUrl={proxiedLogoUrl} />).toBlob();
            const url = URL.createObjectURL(blob);
            const link = document.createElement('a');
            const fileName = `plan_publicidad_${plan.executive_summary.substring(0, 20).replace(/\s/g, '_') || 'AutoPress'}.pdf`;
            
            link.href = url;
            link.setAttribute('download', fileName);
            document.body.appendChild(link);
            link.click();
            
            link.parentNode?.removeChild(link);
            URL.revokeObjectURL(url);
            
        } catch (error) {
            console.error("Failed to generate PDF:", error);
            toast({
                title: "Error al generar PDF",
                description: "No se pudo crear el documento. Revisa la consola para más detalles.",
                variant: "destructive",
            });
        } finally {
            setIsPdfLoading(false);
        }
    };

    const handleDialogPlanUpdate = React.useCallback((updatedPlan: CreateAdPlanOutput) => {
        onPlanUpdate(updatedPlan);
        
        // This logic ensures the dialogs reflect the updated plan state correctly
        if (detailedStrategy) {
            const newStrategy = updatedPlan.strategies.find(s => s.platform === detailedStrategy.platform);
            setDetailedStrategy(newStrategy || null);
        }
        if (creativeStrategy) {
            const newStrategy = updatedPlan.strategies.find(s => s.platform === creativeStrategy.platform);
            setCreativeStrategy(newStrategy || null);
        }
    }, [detailedStrategy, creativeStrategy, onPlanUpdate]); 
    
    if (!plan) {
        return <Loader2 className="h-8 w-8 animate-spin" />;
    }
    
    return (
        <div className="space-y-6 report-view">
             <StrategyDetailDialog 
                plan={plan}
                strategy={detailedStrategy} 
                onOpenChange={(open) => !open && setDetailedStrategy(null)}
                onPlanUpdate={handleDialogPlanUpdate}
            />
            <CreativeStudioDialog 
                plan={plan}
                strategy={creativeStrategy}
                onOpenChange={(open) => !open && setCreativeStrategy(null)}
                onPlanUpdate={handleDialogPlanUpdate}
            />


            <div className="report-header hidden print:block">
                {logoUrl && <Image src={logoUrl} alt="Logo" width={60} height={60} className="mx-auto" data-ai-hint="logo brand" />}
                <h1 className="text-2xl font-bold mt-2">Plan de Publicidad Digital</h1>
                <p className="text-sm text-gray-500">Preparado para {companyName} por AutoPress AI el {new Date().toLocaleDateString('es-ES')}</p>
            </div>

             <div className="flex flex-wrap gap-2 justify-end print-hide">
                <Button variant="outline" onClick={onReset}><RotateCcw className="mr-2 h-4 w-4" /> Crear Nuevo Plan</Button>
                 <Button onClick={handleSavePlan} disabled={isSavingPlan}>
                    {isSavingPlan ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
                    {isSavingPlan ? 'Guardando...' : 'Guardar Plan'}
                </Button>
                 <Button onClick={handleDownload} disabled={isPdfLoading}>
                    {isPdfLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Printer className="mr-2 h-4 w-4" />}
                    {isPdfLoading ? 'Generando PDF...' : 'Descargar PDF'}
                </Button>
            </div>
            
            <Card>
                <CardHeader><CardTitle className="flex items-center gap-3"><ClipboardCheck className="h-6 w-6 text-primary" /> Resumen Ejecutivo</CardTitle></CardHeader>
                <CardContent><p className="text-muted-foreground leading-relaxed">{plan.executive_summary}</p></CardContent>
            </Card>

            {plan.additional_context && (
                 <Card>
                    <CardHeader><CardTitle className="flex items-center gap-3"><Info className="h-6 w-6 text-primary" /> Contexto Adicional</CardTitle></CardHeader>
                    <CardContent><p className="text-muted-foreground whitespace-pre-line">{plan.additional_context}</p></CardContent>
                </Card>
            )}

            <Card>
                <CardHeader><CardTitle className="flex items-center gap-3"><Target className="h-6 w-6 text-primary" /> Público Objetivo</CardTitle></CardHeader>
                <CardContent><p className="text-muted-foreground whitespace-pre-line">{plan.target_audience}</p></CardContent>
            </Card>
            
            <Card>
                <CardHeader>
                    <CardTitle className="flex items-center gap-3"><Megaphone className="h-6 w-6 text-primary" /> Estrategias y Presupuesto</CardTitle>
                    <CardDescription>Total mensual recomendado: <span className="font-bold text-lg text-primary">{formatCurrency(plan.total_monthly_budget || 0)}</span></CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                    {(plan.strategies || []).map((strategy, index) => (
                        <div key={index} className="p-4 border rounded-lg space-y-3 bg-muted/20">
                           <div className="flex flex-col sm:flex-row sm:justify-between items-start gap-3">
                                <div>
                                    <h3 className="text-xl font-semibold text-primary">{strategy.platform}</h3>
                                    <div className="flex items-center gap-2 mt-2">
                                        <Label htmlFor={`budget-${strategy.platform}`} className="sr-only">Presupuesto mensual</Label>
                                        <Input
                                            id={`budget-${strategy.platform}`}
                                            type="number"
                                            value={strategy.monthly_budget}
                                            onChange={(e) => handleBudgetChange(strategy.platform, e.target.value)}
                                            className="w-32 font-bold text-lg"
                                            min="0"
                                            step="10"
                                        />
                                        <span className="font-bold text-lg text-muted-foreground">/ mes</span>
                                    </div>
                                </div>
                                <div className="flex flex-wrap gap-2">
                                    <Button variant="outline" size="sm" onClick={() => setCreativeStrategy(strategy)}>
                                        <ClipboardPen className="mr-2 h-4 w-4" />
                                        Generar Creativos
                                    </Button>
                                    <Button variant="outline" size="sm" onClick={() => setDetailedStrategy(strategy)}>
                                        <ListOrdered className="mr-2 h-4 w-4" />
                                        Planificar Tareas
                                    </Button>
                                </div>
                            </div>
                            <p className="text-sm text-muted-foreground italic"><Lightbulb className="inline-block mr-2 h-4 w-4" />{strategy.strategy_rationale}</p>
                            <div className="flex flex-wrap items-center gap-4 text-sm pt-2">
                                <div className="flex items-center gap-2"><MapPin className="h-4 w-4 text-muted-foreground" /><span>Fase del embudo: <Badge>{strategy.funnel_stage}</Badge></span></div>
                                <div className="flex items-center gap-2"><BarChart className="h-4 w-4 text-muted-foreground" /><span>Tipo de campaña: <Badge>{strategy.campaign_type}</Badge></span></div>
                            </div>
                            <div className="flex flex-wrap gap-2 pt-2"><span className="text-sm font-medium mr-2">Formatos:</span>{(strategy.ad_formats || []).map(format => <Badge key={format} variant="outline">{format}</Badge>)}</div>
                        </div>
                    ))}
                </CardContent>
            </Card>
            
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                 <Card>
                    <CardHeader><CardTitle className="flex items-center gap-2"><TrendingUp className="h-5 w-5 text-primary" /> KPIs de Seguimiento</CardTitle></CardHeader>
                    <CardContent><ul className="list-disc list-inside text-muted-foreground space-y-1">{(plan.kpis || []).map((kpi, index) => <li key={index}>{kpi}</li>)}</ul></CardContent>
                </Card>
                <Card>
                    <CardHeader><CardTitle className="flex items-center gap-2"><Calendar className="h-5 w-5 text-primary" /> Calendario (Primeros 3 meses)</CardTitle></CardHeader>
                    <CardContent className="space-y-4">
                         {(plan.calendar || []).map((milestone, index) => (
                            <div key={index} className="relative pl-6">
                                <div className="absolute left-0 top-1 h-full w-px bg-border"></div>
                                <div className="absolute left-[-5px] top-1.5 h-3 w-3 rounded-full bg-primary"></div>
                                <h4 className="font-semibold">{milestone.month}: {milestone.focus}</h4>
                                <ul className="list-disc list-inside text-sm text-muted-foreground pl-2 mt-1 space-y-0.5">{(milestone.actions || []).map((action, i) => <li key={i}>{action}</li>)}</ul>
                            </div>
                         ))}
                    </CardContent>
                </Card>
            </div>
            
            <Card className="bg-accent/50 border-primary/20">
                 <CardHeader><CardTitle className="flex items-center gap-3"><Zap className="h-6 w-6 text-primary" /> Propuesta de Gestión</CardTitle></CardHeader>
                <CardContent className="space-y-4">
                    <div>
                        <Label htmlFor="fee_description">Descripción de los servicios incluidos:</Label>
                        <Textarea 
                            id="fee_description"
                            value={plan.fee_proposal?.fee_description || ''}
                            onChange={(e) => handleFeeChange('fee_description', e.target.value)}
                            className="mt-1 bg-background/70"
                            rows={3}
                            placeholder="Describe qué servicios incluye tu cuota de gestión (ej. optimización semanal, informes mensuales, etc.)"
                        />
                    </div>
                    <Separator />
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-center">
                        <div className="space-y-1">
                            <Label htmlFor="setup_fee">Cuota de Configuración (€)</Label>
                            <Input
                                id="setup_fee"
                                type="number"
                                value={plan.fee_proposal?.setup_fee || 0}
                                onChange={(e) => handleFeeChange('setup_fee', e.target.value)}
                                className="text-2xl font-bold h-auto py-2 text-center"
                            />
                        </div>
                        <div className="space-y-1">
                            <Label htmlFor="management_fee">Cuota de Gestión Mensual (€)</Label>
                            <Input
                                id="management_fee"
                                type="number"
                                value={plan.fee_proposal?.management_fee || 0}
                                onChange={(e) => handleFeeChange('management_fee', e.target.value)}
                                className="text-2xl font-bold h-auto py-2 text-center"
                            />
                        </div>
                    </div>
                </CardContent>
            </Card>
        </div>
    );
}
