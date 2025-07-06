
'use client';

import React from 'react';
import { pdf, Document, Page, Text, View, StyleSheet, Font, Image as PdfImage } from '@react-pdf/renderer';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import type { CreateAdPlanOutput } from './schema';
import { Target, TrendingUp, Calendar, Zap, ClipboardCheck, Users, Megaphone, Lightbulb, BarChart, Loader2, Save, Info, Swords, Tool, ChevronRight, Briefcase, Handshake } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import Image from 'next/image';
import { useToast } from '@/hooks/use-toast';
import { saveAdPlanAction } from './actions';
import { auth } from '@/lib/firebase';
import { CompetitorAnalysisDialog } from './CompetitorAnalysisDialog';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';


// Register fonts for PDF rendering
Font.register({
    family: 'Helvetica',
    fonts: [
        { src: 'https://fonts.gstatic.com/s/ptsans/v17/jizaRExUiTo99u79D0-ExdGM.ttf', fontWeight: 'normal' },
        { src: 'https://fonts.gstatic.com/s/ptsans/v17/jizfRExUiTo99u79B_mh0OOtLQ.ttf', fontWeight: 'bold' },
    ]
});

// Styles for the PDF document
const styles = StyleSheet.create({
  page: { fontFamily: 'Helvetica', fontSize: 10, paddingTop: 35, paddingBottom: 65, paddingHorizontal: 35, lineHeight: 1.5, color: '#333333' },
  header: { textAlign: 'center', marginBottom: 20, borderBottomWidth: 2, borderBottomColor: '#E6E6FA', paddingBottom: 10 },
  logo: { width: 60, height: 60, marginLeft: 'auto', marginRight: 'auto', marginBottom: 10 },
  reportTitle: { fontFamily: 'Helvetica-Bold', fontSize: 24, color: '#20B2AA', marginBottom: 4 },
  reportSubtitle: { fontSize: 10, color: '#888888' },
  section: { marginBottom: 15, pageBreakInside: 'avoid' },
  sectionTitle: { fontFamily: 'Helvetica-Bold', fontSize: 16, color: '#20B2AA', marginBottom: 8, borderBottomWidth: 1, borderBottomColor: '#E6E6FA', paddingBottom: 4, textTransform: 'uppercase' },
  subsectionTitle: { fontFamily: 'Helvetica-Bold', fontSize: 12, color: '#333333', marginTop: 10, marginBottom: 5 },
  bodyText: { fontSize: 10, textAlign: 'justify' },
  listItem: { flexDirection: 'row', marginBottom: 2 },
  bullet: { width: 10, fontSize: 10, marginRight: 5 },
  twoColumnLayout: { flexDirection: 'row', gap: 20 },
  column: { flex: 1 },
  badgeContainer: { flexDirection: 'row', flexWrap: 'wrap', gap: 4, marginTop: 5 },
  badge: { backgroundColor: '#E6E6FA', color: '#240a5e', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 8, fontSize: 9 },
  pageNumber: { position: 'absolute', fontSize: 8, bottom: 30, left: 0, right: 0, textAlign: 'center', color: 'grey' },
});


// PDF Document Component
const AdPlanPDF = ({ plan, companyName, logoUrl }: { plan: CreateAdPlanOutput; companyName: string; logoUrl: string | null }) => (
    <Document>
        <Page size="A4" style={styles.page}>
            <View style={styles.header}>
                {logoUrl && <PdfImage style={styles.logo} src={logoUrl} />}
                <Text style={styles.reportTitle}>Plan de Marketing Digital</Text>
                <Text style={styles.reportSubtitle}>Preparado para {companyName} por AutoPress AI el {new Date().toLocaleDateString('es-ES')}</Text>
            </View>

            <View style={styles.section}><Text style={styles.sectionTitle}>Buyer Persona</Text><Text style={styles.bodyText}>{plan.buyer_persona}</Text></View>
            <View style={styles.section}><Text style={styles.sectionTitle}>Propuesta de Valor</Text><Text style={styles.bodyText}>{plan.value_proposition}</Text></View>
            
            <View style={styles.section}>
                <Text style={styles.sectionTitle}>Embudo de Conversión</Text>
                {Object.entries(plan.funnel).map(([stage, details]) => (
                    <View key={stage} style={{ marginBottom: 10, pageBreakInside: 'avoid' }}>
                        <Text style={styles.subsectionTitle}>{stage.charAt(0).toUpperCase() + stage.slice(1)}</Text>
                        <Text style={styles.bodyText}><Text style={{fontFamily: 'Helvetica-Bold'}}>Objetivo:</Text> {details.objective}</Text>
                        <Text style={styles.bodyText}><Text style={{fontFamily: 'Helvetica-Bold'}}>Canales:</Text> {details.channels.join(', ')}</Text>
                        <Text style={styles.bodyText}><Text style={{fontFamily: 'Helvetica-Bold'}}>Contenidos:</Text> {details.content_types.join(', ')}</Text>
                        <Text style={styles.bodyText}><Text style={{fontFamily: 'Helvetica-Bold'}}>KPIs:</Text> {details.kpis.join(', ')}</Text>
                    </View>
                ))}
            </View>
            
            <View style={styles.section}>
                 <Text style={styles.sectionTitle}>Plan de Medios</Text>
                 <Text style={styles.subsectionTitle}>Distribución de Presupuesto</Text>
                 <Text style={styles.bodyText}>{plan.media_plan.budget_distribution}</Text>
                 <Text style={styles.subsectionTitle}>Sugerencias de Campañas</Text>
                 {plan.media_plan.campaign_suggestions.map((item, index) => <View key={index} style={styles.listItem}><Text style={styles.bullet}>•</Text><Text style={styles.bodyText}>{item}</Text></View>)}
            </View>

            <View style={styles.section}>
                <Text style={styles.sectionTitle}>Recomendaciones Estratégicas</Text>
                <Text style={styles.subsectionTitle}>Posicionamiento</Text><Text style={styles.bodyText}>{plan.strategic_recommendations.positioning}</Text>
                <Text style={styles.subsectionTitle}>Tono de Voz</Text><Text style={styles.bodyText}>{plan.strategic_recommendations.tone_of_voice}</Text>
                <Text style={styles.subsectionTitle}>Diferenciación</Text><Text style={styles.bodyText}>{plan.strategic_recommendations.differentiation}</Text>
            </View>
            
            <View style={styles.section}>
                 <Text style={styles.sectionTitle}>KPIs Globales</Text>
                 {plan.key_performance_indicators.map((item, index) => <View key={index} style={styles.listItem}><Text style={styles.bullet}>•</Text><Text style={styles.bodyText}>{item}</Text></View>)}
            </View>

            <View style={styles.section}>
                 <Text style={styles.sectionTitle}>Calendario de Contenidos</Text>
                  {plan.content_calendar.map((item, index) => (
                    <View key={index} style={{ marginBottom: 8, pageBreakInside: 'avoid' }}>
                      <Text style={styles.subsectionTitle}>{item.month}: {item.focus}</Text>
                      {item.actions.map((action, i) => <View key={i} style={styles.listItem}><Text style={styles.bullet}>•</Text><Text style={styles.bodyText}>{action}</Text></View>)}
                    </View>
                  ))}
            </View>

            <Text style={styles.pageNumber} render={({ pageNumber, totalPages }) => `${pageNumber} / ${totalPages}`} fixed />
        </Page>
    </Document>
);


export function AdPlanView({ plan, onPlanUpdate, onReset, companyName, logoUrl }: { plan: CreateAdPlanOutput; onPlanUpdate: (plan: CreateAdPlanOutput) => void; onReset: () => void; companyName: string; logoUrl: string | null }) {
    const [isPdfLoading, setIsPdfLoading] = React.useState(false);
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

    const handleDownload = async () => {
        if (!plan) return;
        const proxiedLogoUrl = logoUrl ? `/api/image-proxy?url=${encodeURIComponent(logoUrl)}` : null;
        setIsPdfLoading(true);
        try {
            const blob = await pdf(<AdPlanPDF plan={plan} companyName={companyName} logoUrl={proxiedLogoUrl} />).toBlob();
            const url = URL.createObjectURL(blob);
            const link = document.createElement('a');
            const fileName = `plan_marketing_${(plan.url || 'website').replace(/https?:\/\//, '').split('/')[0]}.pdf`;
            
            link.href = url;
            link.setAttribute('download', fileName);
            document.body.appendChild(link);
            link.click();
            
            link.parentNode?.removeChild(link);
            URL.revokeObjectURL(url);
            
        } catch (error) {
            console.error("Failed to generate PDF:", error);
            toast({ title: "Error al generar PDF", variant: "destructive" });
        } finally {
            setIsPdfLoading(false);
        }
    };
    
    if (!plan) {
        return <Loader2 className="h-8 w-8 animate-spin" />;
    }
    
    return (
        <div className="space-y-6 report-view">
            <CompetitorAnalysisDialog
                isOpen={isCompetitorAnalysisOpen}
                onOpenChange={setIsCompetitorAnalysisOpen}
                url={plan.url}
                initialContext={plan.additional_context}
            />

            <div className="report-header hidden print:block">
                {logoUrl && <Image src={logoUrl} alt="Logo" width={60} height={60} className="mx-auto" data-ai-hint="logo brand" />}
                <h1 className="text-2xl font-bold mt-2">Plan de Marketing Digital</h1>
                <p className="text-sm text-gray-500">Preparado para {companyName} por AutoPress AI el {new Date().toLocaleDateString('es-ES')}</p>
            </div>

             <div className="flex flex-wrap gap-2 justify-end print-hide">
                <Button variant="outline" onClick={onReset}><Zap className="mr-2 h-4 w-4" /> Crear Nuevo Plan</Button>
                <Button variant="outline" onClick={() => setIsCompetitorAnalysisOpen(true)}><Swords className="mr-2 h-4 w-4" /> Analizar Competencia</Button>
                <Button onClick={handleSavePlan} disabled={isSavingPlan}>{isSavingPlan ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />} Guardar Plan</Button>
                <Button onClick={handleDownload} disabled={isPdfLoading}>{isPdfLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <ClipboardCheck className="mr-2 h-4 w-4" />} Descargar Informe</Button>
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
                        {Object.entries(plan.funnel).map(([stage, details]) => (
                             <AccordionItem value={stage} key={stage}>
                                <AccordionTrigger className="text-lg font-semibold capitalize">{stage}</AccordionTrigger>
                                <AccordionContent className="space-y-4 pt-2">
                                    <p className="font-medium text-primary">{details.objective}</p>
                                    <div className="flex flex-wrap gap-2"><span className="text-sm font-semibold">Canales:</span>{details.channels.map(item => <Badge key={item} variant="secondary">{item}</Badge>)}</div>
                                    <div className="flex flex-wrap gap-2"><span className="text-sm font-semibold">Contenidos:</span>{details.content_types.map(item => <Badge key={item} variant="outline">{item}</Badge>)}</div>
                                    <div className="flex flex-wrap gap-2"><span className="text-sm font-semibold">KPIs:</span>{details.kpis.map(item => <Badge key={item} variant="secondary">{item}</Badge>)}</div>
                                </AccordionContent>
                             </AccordionItem>
                        ))}
                    </Accordion>
                </CardContent>
            </Card>
            
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <Card>
                    <CardHeader><CardTitle className="flex items-center gap-2"><BarChart className="h-6 w-6 text-primary" /> Plan de Medios</CardTitle></CardHeader>
                    <CardContent className="space-y-4">
                        <div><h4 className="font-semibold mb-1">Distribución de Presupuesto</h4><p className="text-sm text-muted-foreground">{plan.media_plan.budget_distribution}</p></div>
                        <Separator />
                        <div><h4 className="font-semibold mb-1">Sugerencias de Campañas</h4><ul className="list-disc list-inside text-sm text-muted-foreground space-y-1">{plan.media_plan.campaign_suggestions.map((item, i) => <li key={i}>{item}</li>)}</ul></div>
                    </CardContent>
                </Card>
                <Card>
                    <CardHeader><CardTitle className="flex items-center gap-2"><Tool className="h-6 w-6 text-primary" /> Herramientas Recomendadas</CardTitle></CardHeader>
                    <CardContent className="space-y-3">{plan.recommended_tools.map((item, i) => <div key={i}><p className="font-semibold text-sm">{item.category}</p><p className="text-sm text-muted-foreground">{item.tools}</p></div>)}</CardContent>
                </Card>
            </div>
            
            <Card>
                 <CardHeader><CardTitle className="flex items-center gap-3"><Zap className="h-6 w-6 text-primary" /> Recomendaciones Estratégicas</CardTitle></CardHeader>
                 <CardContent className="space-y-4">
                    <Accordion type="multiple" className="w-full">
                        <AccordionItem value="pos"><AccordionTrigger>Posicionamiento</AccordionTrigger><AccordionContent><p className="text-muted-foreground">{plan.strategic_recommendations.positioning}</p></AccordionContent></AccordionItem>
                        <AccordionItem value="tone"><AccordionTrigger>Tono de Voz</AccordionTrigger><AccordionContent><p className="text-muted-foreground">{plan.strategic_recommendations.tone_of_voice}</p></AccordionContent></AccordionItem>
                        <AccordionItem value="diff"><AccordionTrigger>Diferenciación</AccordionTrigger><AccordionContent><p className="text-muted-foreground">{plan.strategic_recommendations.differentiation}</p></AccordionContent></AccordionItem>
                    </Accordion>
                 </CardContent>
            </Card>
            
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                 <Card>
                    <CardHeader><CardTitle className="flex items-center gap-2"><TrendingUp className="h-5 w-5 text-primary" /> KPIs Globales</CardTitle></CardHeader>
                    <CardContent><ul className="list-disc list-inside text-muted-foreground space-y-1">{plan.key_performance_indicators.map((kpi, index) => <li key={index}>{kpi}</li>)}</ul></CardContent>
                </Card>
                <Card>
                    <CardHeader><CardTitle className="flex items-center gap-2"><Calendar className="h-5 w-5 text-primary" /> Calendario de Acciones</CardTitle></CardHeader>
                    <CardContent className="space-y-4">
                         {plan.content_calendar.map((milestone, index) => (
                            <div key={index} className="relative pl-6">
                                <div className="absolute left-0 top-1 h-full w-px bg-border"></div>
                                <div className="absolute left-[-5px] top-1.5 h-3 w-3 rounded-full bg-primary"></div>
                                <h4 className="font-semibold">{milestone.month}: {milestone.focus}</h4>
                                <ul className="list-disc list-inside text-sm text-muted-foreground pl-2 mt-1 space-y-0.5">{milestone.actions.map((action, i) => <li key={i}>{action}</li>)}</ul>
                            </div>
                         ))}
                    </CardContent>
                </Card>
            </div>

        </div>
    );
}
