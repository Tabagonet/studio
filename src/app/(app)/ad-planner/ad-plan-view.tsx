
'use client';

import React from 'react';
import { pdf, Document, Page, Text, View, StyleSheet, Font, Image as PdfImage } from '@react-pdf/renderer';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import type { CreateAdPlanOutput } from './schema';
import { DollarSign, Printer, RotateCcw, Target, TrendingUp, Calendar, Zap, ClipboardCheck, Users, Megaphone, Lightbulb, MapPin, BarChart, Loader2 } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import Image from 'next/image';
import { useToast } from '@/hooks/use-toast';


// Register fonts for PDF rendering from Google's reliable font CDN.
Font.register({
  family: 'PT Sans',
  fonts: [
    { src: 'https://fonts.gstatic.com/s/ptsans/v17/jizaRExUiTo99u79D0-ExdGM.ttf' },
    { src: 'https://fonts.gstatic.com/s/ptsans/v17/jizfRExUiTo99u79B_mh0O6tKA.ttf', fontWeight: 'bold' },
    { src: 'https://fonts.gstatic.com/s/ptsans/v17/jizYRExUiTo99u79plgnE8M.ttf', fontStyle: 'italic' },
    { src: 'https://fonts.gstatic.com/s/ptsans/v17/jizdRExUiTo99u79anF5Rm1gGg.ttf', fontWeight: 'bold', fontStyle: 'italic' },
  ],
});


// Styles for the PDF document
const styles = StyleSheet.create({
  page: { fontFamily: 'PT Sans', fontSize: 10, paddingTop: 35, paddingBottom: 65, paddingHorizontal: 35, lineHeight: 1.5, color: '#333333' },
  header: { textAlign: 'center', marginBottom: 20, borderBottomWidth: 2, borderBottomColor: '#E6E6FA', paddingBottom: 10 },
  logo: { width: 60, height: 60, marginLeft: 'auto', marginRight: 'auto', marginBottom: 10 },
  reportTitle: { fontSize: 24, fontWeight: 'bold', color: '#20B2AA', marginBottom: 4 },
  reportSubtitle: { fontSize: 10, color: '#888888' },
  section: { marginBottom: 15 },
  sectionTitle: { fontSize: 16, fontWeight: 'bold', color: '#20B2AA', marginBottom: 8, borderBottomWidth: 1, borderBottomColor: '#E6E6FA', paddingBottom: 4, textTransform: 'uppercase' },
  bodyText: { fontSize: 10, textAlign: 'justify' },
  preformattedText: { fontSize: 10, backgroundColor: '#F5F5F5', padding: 10, borderRadius: 4 },
  strategyCard: { borderWidth: 1, borderColor: '#E6E6FA', borderRadius: 5, padding: 12, marginBottom: 10, backgroundColor: '#FFFFFF' },
  strategyHeader: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 5 },
  platformTitle: { fontSize: 14, fontWeight: 'bold', color: '#20B2AA' },
  monthlyBudget: { fontSize: 14, fontWeight: 'bold' },
  strategyRationale: { fontSize: 9, fontStyle: 'italic', color: '#555555', marginBottom: 8 },
  badgeContainer: { flexDirection: 'row', flexWrap: 'wrap', gap: 4, marginTop: 5 },
  badge: { backgroundColor: '#E6E6FA', color: '#240a5e', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 8, fontSize: 9 },
  twoColumnLayout: { flexDirection: 'row', gap: 20 },
  column: { flex: 1 },
  kpiList: { paddingLeft: 10 },
  kpiItem: { marginBottom: 2 },
  calendarItem: { marginBottom: 8 },
  calendarFocus: { fontWeight: 'bold' },
  feeProposalCard: { backgroundColor: 'rgba(32, 178, 170, 0.1)', borderWidth: 1, borderColor: 'rgba(32, 178, 170, 0.3)', borderRadius: 5, padding: 12 },
  feeContainer: { flexDirection: 'row', justifyContent: 'space-around', marginTop: 10, paddingTop: 10, borderTopWidth: 1, borderTopColor: '#E6E6FA' },
  feeItem: { textAlign: 'center' },
  pageNumber: { position: 'absolute', fontSize: 8, bottom: 30, left: 0, right: 0, textAlign: 'center', color: 'grey' },
});

// PDF Document Component - Now accepts origin as a prop.
const AdPlanPDF = ({ plan, origin, companyName, logoUrl }: { plan: CreateAdPlanOutput; origin: string, companyName: string, logoUrl: string | null }) => (
    <Document>
        <Page size="A4" style={styles.page}>
            <View style={styles.header}>
                <PdfImage style={styles.logo} src={logoUrl || `${origin}/images/logo.png`} />
                <Text style={styles.reportTitle}>Plan de Publicidad Digital</Text>
                <Text style={styles.reportSubtitle}>Preparado para {companyName} por AutoPress AI el {new Date().toLocaleDateString('es-ES')}</Text>
            </View>

            <View style={styles.section}><Text style={styles.sectionTitle}>Resumen Ejecutivo</Text><Text style={styles.bodyText}>{plan.executive_summary}</Text></View>
            <View style={styles.section}><Text style={styles.sectionTitle}>Público Objetivo</Text><Text style={styles.bodyText}>{plan.target_audience.replace(/\\n/g, '\n')}</Text></View>
            
            <View style={styles.section}>
                <Text style={styles.sectionTitle}>Estrategias y Presupuesto ({formatCurrency(plan.total_monthly_budget)}/mes)</Text>
                {plan.strategies.map((strategy, index) => (
                    <View key={index} style={styles.strategyCard} wrap={false}>
                        <View style={styles.strategyHeader}><Text style={styles.platformTitle}>{strategy.platform}</Text><Text style={styles.monthlyBudget}>{formatCurrency(strategy.monthly_budget)} / mes</Text></View>
                        <Text style={styles.strategyRationale}>{strategy.strategy_rationale}</Text>
                        <View style={styles.badgeContainer}><Text style={styles.badge}>Fase: {strategy.funnel_stage}</Text><Text style={styles.badge}>Campaña: {strategy.campaign_type}</Text></View>
                        <View style={[styles.badgeContainer, { marginTop: 8 }]}>{strategy.ad_formats.map(format => <Text key={format} style={styles.badge}>{format}</Text>)}</View>
                    </View>
                ))}
            </View>

            <View style={styles.twoColumnLayout}>
                <View style={styles.column}><Text style={styles.sectionTitle}>KPIs</Text><View style={styles.kpiList}>{plan.kpis.map((kpi, index) => <Text key={index} style={styles.kpiItem}>• {kpi}</Text>)}</View></View>
                <View style={styles.column}>
                    <Text style={styles.sectionTitle}>Calendario (3 meses)</Text>
                    {plan.calendar.map((milestone, index) => (
                        <View key={index} style={styles.calendarItem}><Text style={styles.calendarFocus}>{milestone.month}: {milestone.focus}</Text>{milestone.actions.map((action, i) => <Text key={i} style={{fontSize: 9, paddingLeft: 10}}>• {action}</Text>)}</View>
                    ))}
                </View>
            </View>

            <View style={styles.feeProposalCard}><Text style={styles.sectionTitle}>Propuesta de Gestión</Text><Text style={styles.bodyText}>{plan.fee_proposal.fee_description}</Text>
                <View style={styles.feeContainer}>
                    <View style={styles.feeItem}><Text>Cuota de Configuración</Text><Text style={styles.monthlyBudget}>{formatCurrency(plan.fee_proposal.setup_fee)}</Text></View>
                    <View style={styles.feeItem}><Text>Gestión Mensual</Text><Text style={styles.monthlyBudget}>{formatCurrency(plan.fee_proposal.management_fee)}</Text></View>
                </View>
            </View>

            <Text style={styles.pageNumber} render={({ pageNumber, totalPages }) => `${pageNumber} / ${totalPages}`} fixed />
        </Page>
    </Document>
);


const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR' }).format(value);
};

export function AdPlanView({ plan, onReset, companyName, logoUrl }: { plan: CreateAdPlanOutput; onReset: () => void; companyName: string; logoUrl: string | null }) {
    const [isPdfLoading, setIsPdfLoading] = React.useState(false);
    const { toast } = useToast();
    const [origin, setOrigin] = React.useState('');

    React.useEffect(() => {
        if (typeof window !== 'undefined') {
            setOrigin(window.location.origin);
        }
    }, []);

    const handleDownload = async () => {
        if (!origin) {
            toast({
                title: 'Error',
                description: 'No se pudo determinar el origen de la aplicación. Por favor, recarga la página.',
                variant: 'destructive',
            });
            return;
        }

        setIsPdfLoading(true);
        try {
            const blob = await pdf(<AdPlanPDF plan={plan} origin={origin} companyName={companyName} logoUrl={logoUrl} />).toBlob();
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
    
    return (
        <div className="space-y-6 report-view">
            <div className="report-header hidden print:block">
                <Image src={logoUrl || "/images/logo.png"} alt="Logo" width={60} height={60} className="mx-auto" data-ai-hint="logo brand" />
                <h1 className="text-2xl font-bold mt-2">Plan de Publicidad Digital</h1>
                <p className="text-sm text-gray-500">Preparado para {companyName} por AutoPress AI el {new Date().toLocaleDateString('es-ES')}</p>
            </div>

             <div className="flex flex-wrap gap-2 justify-end print-hide">
                <Button variant="outline" onClick={onReset}><RotateCcw className="mr-2 h-4 w-4" /> Crear Nuevo Plan</Button>
                 <Button onClick={handleDownload} disabled={isPdfLoading}>
                    {isPdfLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Printer className="mr-2 h-4 w-4" />}
                    {isPdfLoading ? 'Generando PDF...' : 'Descargar PDF'}
                </Button>
            </div>
            
            <Card>
                <CardHeader><CardTitle className="flex items-center gap-3"><ClipboardCheck className="h-6 w-6 text-primary" /> Resumen Ejecutivo</CardTitle></CardHeader>
                <CardContent><p className="text-muted-foreground leading-relaxed">{plan.executive_summary}</p></CardContent>
            </Card>

            <Card>
                <CardHeader><CardTitle className="flex items-center gap-3"><Target className="h-6 w-6 text-primary" /> Público Objetivo</CardTitle></CardHeader>
                <CardContent><p className="text-muted-foreground whitespace-pre-line">{plan.target_audience}</p></CardContent>
            </Card>
            
            <Card>
                <CardHeader><CardTitle className="flex items-center gap-3"><Megaphone className="h-6 w-6 text-primary" /> Estrategias y Presupuesto</CardTitle><CardDescription>Total mensual recomendado: <span className="font-bold text-lg text-primary">{formatCurrency(plan.total_monthly_budget)}</span></CardDescription></CardHeader>
                <CardContent className="space-y-4">
                    {plan.strategies.map((strategy, index) => (
                        <div key={index} className="p-4 border rounded-lg space-y-3 bg-muted/20">
                            <div className="flex flex-col sm:flex-row sm:justify-between"><h3 className="text-xl font-semibold text-secondary">{strategy.platform}</h3><p className="font-bold text-lg">{formatCurrency(strategy.monthly_budget)} / mes</p></div>
                            <p className="text-sm text-muted-foreground italic"><Lightbulb className="inline-block mr-2 h-4 w-4" />{strategy.strategy_rationale}</p>
                            <div className="flex flex-wrap items-center gap-4 text-sm pt-2">
                                <div className="flex items-center gap-2"><MapPin className="h-4 w-4 text-muted-foreground" /><span>Fase del embudo: <Badge>{strategy.funnel_stage}</Badge></span></div>
                                <div className="flex items-center gap-2"><BarChart className="h-4 w-4 text-muted-foreground" /><span>Tipo de campaña: <Badge>{strategy.campaign_type}</Badge></span></div>
                            </div>
                            <div className="flex flex-wrap gap-2 pt-2"><span className="text-sm font-medium mr-2">Formatos:</span>{strategy.ad_formats.map(format => <Badge key={format} variant="outline">{format}</Badge>)}</div>
                        </div>
                    ))}
                </CardContent>
            </Card>
            
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                 <Card>
                    <CardHeader><CardTitle className="flex items-center gap-2"><TrendingUp className="h-5 w-5 text-primary" /> KPIs de Seguimiento</CardTitle></CardHeader>
                    <CardContent><ul className="list-disc list-inside text-muted-foreground space-y-1">{plan.kpis.map((kpi, index) => <li key={index}>{kpi}</li>)}</ul></CardContent>
                </Card>
                <Card>
                    <CardHeader><CardTitle className="flex items-center gap-2"><Calendar className="h-5 w-5 text-primary" /> Calendario (Primeros 3 meses)</CardTitle></CardHeader>
                    <CardContent className="space-y-4">
                         {plan.calendar.map((milestone, index) => (
                            <div key={index} className="relative pl-6">
                                <div className="absolute left-0 top-1 h-full w-px bg-border"></div>
                                <div className="absolute left-[-5px] top-1.5 h-3 w-3 rounded-full bg-secondary"></div>
                                <h4 className="font-semibold">{milestone.month}: {milestone.focus}</h4>
                                <ul className="list-disc list-inside text-sm text-muted-foreground pl-2 mt-1 space-y-0.5">{milestone.actions.map((action, i) => <li key={i}>{action}</li>)}</ul>
                            </div>
                         ))}
                    </CardContent>
                </Card>
            </div>
            
            <Card className="bg-accent/50 border-primary/20">
                 <CardHeader><CardTitle className="flex items-center gap-3"><Zap className="h-6 w-6 text-primary" /> Propuesta de Gestión</CardTitle></CardHeader>
                <CardContent className="space-y-4">
                    <p className="text-muted-foreground">{plan.fee_proposal.fee_description}</p>
                    <Separator />
                    <div className="flex flex-col sm:flex-row sm:justify-around text-center gap-4">
                        <div><p className="text-sm text-muted-foreground">Cuota de Configuración</p><p className="text-2xl font-bold">{formatCurrency(plan.fee_proposal.setup_fee)}</p></div>
                        <div><p className="text-sm text-muted-foreground">Cuota de Gestión Mensual</p><p className="text-2xl font-bold">{formatCurrency(plan.fee_proposal.management_fee)}</p></div>
                    </div>
                </CardContent>
            </Card>
        </div>
    );
}
