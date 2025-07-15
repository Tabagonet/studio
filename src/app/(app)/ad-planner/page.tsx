
'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import React, { useState, useEffect, useCallback } from 'react';
import { useSearchParams } from 'next/navigation';
import { CreateAdPlanInputSchema, type CreateAdPlanInput, type CreateAdPlanOutput } from './schema';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage, FormDescription } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Loader2, Sparkles, Megaphone, Download } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { generateAdPlanAction } from './actions';
import { AdPlanView } from './ad-plan-view';
import { auth, onAuthStateChanged, type FirebaseUser } from '@/lib/firebase';
import { Checkbox } from '@/components/ui/checkbox';
import { AdPlanHistory } from './history-list';
import { Textarea } from '@/components/ui/textarea';
import type { Company } from '@/lib/types';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';


const objectives = [
    "Aumentar las ventas de un producto/servicio específico",
    "Generar leads cualificados (formularios, suscripciones)",
    "Aumentar el reconocimiento de marca (brand awareness)",
    "Impulsar el tráfico a la web o a una landing page",
    "Incrementar los seguidores y la interacción en redes sociales",
    "Fidelizar clientes existentes y aumentar el LTV",
];

const brandPersonalities = [
    { id: 'profesional', label: 'Profesional y Técnico' },
    { id: 'cercano', label: 'Cercano y Amigable' },
    { id: 'lujoso', label: 'Lujoso y Elegante' },
    { id: 'vibrante', label: 'Vibrante y Moderno' },
    { id: 'eco', label: 'Eco-consciente y Natural' },
    { id: 'divertido', label: 'Divertido y Juvenil' },
];

export default function AdPlannerPage() {
    const [isLoading, setIsLoading] = useState(false);
    const [adPlan, setAdPlan] = useState<CreateAdPlanOutput | null>(null);
    const [companyInfo, setCompanyInfo] = useState<Company | null>(null);
    const [history, setHistory] = useState<CreateAdPlanOutput[]>([]);
    const [isLoadingHistory, setIsLoadingHistory] = useState(true);
    const { toast } = useToast();
    const searchParams = useSearchParams();

    const form = useForm<CreateAdPlanInput>({
        resolver: zodResolver(CreateAdPlanInputSchema),
        defaultValues: {
            url: '',
            objectives: [],
            companyInfo: '',
            valueProposition: '',
            targetAudience: '',
            competitors: '',
            priorityObjective: '',
            brandPersonality: [],
            monthlyBudget: '',
            additionalContext: '',
        },
    });
    
    const fetchHistory = useCallback(async () => {
        setIsLoadingHistory(true);
        const user = auth.currentUser;
        if (!user) {
            setIsLoadingHistory(false);
            setHistory([]);
            return;
        }
        try {
            const token = await user.getIdToken();
            const historyResponse = await fetch('/api/ad-planner/history', { headers: { 'Authorization': `Bearer ${token}` } });
            if (historyResponse.ok) {
                setHistory((await historyResponse.json()).history);
            } else {
                throw new Error((await historyResponse.json()).error || 'Failed to fetch history');
            }
        } catch (error: any) {
            toast({ title: "Error al cargar historial", description: error.message, variant: "destructive" });
        } finally {
            setIsLoadingHistory(false);
        }
    }, [toast]);
    
    useEffect(() => {
        const url = searchParams.get('url');
        if (url) {
            form.setValue('url', url);
            
            // Handle priority objective (text input)
            const priorityObjective = searchParams.get('priorityObjective') || '';
            form.setValue('priorityObjective', priorityObjective);
            
            // If the free-text objective happens to match a predefined one, check the box.
            if (priorityObjective && objectives.includes(priorityObjective)) {
                form.setValue('objectives', [priorityObjective]);
            }

            // Handle other text fields
            form.setValue('companyInfo', searchParams.get('companyInfo') || '');
            form.setValue('valueProposition', searchParams.get('valueProposition') || '');
            form.setValue('targetAudience', searchParams.get('targetAudience') || '');
            form.setValue('competitors', searchParams.get('competitors') || '');
            
            // Handle monthly budget
            const monthlyBudget = searchParams.get('monthlyBudget') || '';
            // Strip non-numeric characters just in case (e.g., "500€")
            form.setValue('monthlyBudget', monthlyBudget.replace(/[^0-9.]/g, ''));


            // Handle brand personality (checkboxes)
            const personality = searchParams.get('brandPersonality');
            if (personality) {
                const personalityKeywords = personality.toLowerCase().split(/, | /).filter(Boolean);
                const matchingLabels = brandPersonalities
                    .filter(bp => personalityKeywords.some(kw => bp.label.toLowerCase().includes(kw)))
                    .map(bp => bp.label);
                
                if (matchingLabels.length > 0) {
                    form.setValue('brandPersonality', matchingLabels);
                }
            }
        }
    }, [searchParams, form]);


    useEffect(() => {
        const fetchInitialCompanyInfo = async (user: FirebaseUser) => {
             const token = await user.getIdToken();
            try {
                const userVerifyResponse = await fetch('/api/user/verify', { headers: { 'Authorization': `Bearer ${token}` }});
                const userData = await userVerifyResponse.json();
                const companyIdToFetch = userData.role === 'super_admin' 
                    ? (await (await fetch('/api/admin/companies', { headers: { 'Authorization': `Bearer ${token}` } })).json()).companies.find((c: any) => c.name === 'Grupo 4 alas S.L.')?.id
                    : userData.companyId;

                if (companyIdToFetch) {
                    const companyResponse = await fetch(`/api/user-settings/company?companyId=${companyIdToFetch}`, { headers: { 'Authorization': `Bearer ${token}` } });
                    if (companyResponse.ok) {
                        const companyData = await companyResponse.json();
                        if (companyData.company) {
                           setCompanyInfo(companyData.company);
                           return;
                        }
                    }
                }
                setCompanyInfo(null);
            } catch (e) {
                console.error("Failed to fetch company info", e);
                setCompanyInfo(null);
            }
        };

        const unsubscribe = onAuthStateChanged(auth, (user) => {
            if (user) {
                fetchInitialCompanyInfo(user);
                fetchHistory();
            } else {
                setCompanyInfo(null);
                setHistory([]);
                setIsLoadingHistory(false);
            }
        });
        return () => unsubscribe();
    }, [toast, fetchHistory]);

    const handleDownloadForm = () => {
        const formText = `
CUESTIONARIO GENERAL PARA EMPRESAS - PLANIFICACIÓN DE ESTRATEGIA DIGITAL
========================================================================

**URL del Sitio Web a Analizar:**


**Objetivos Generales de la Campaña (marcar los que apliquen):**
- [ ] Aumentar las ventas de un producto/servicio específico
- [ ] Generar leads cualificados (formularios, suscripciones)
- [ ] Aumentar el reconocimiento de marca (brand awareness)
- [ ] Impulsar el tráfico a la web o a una landing page
- [ ] Incrementar los seguidores y la interacción en redes sociales
- [ ] Fidelizar clientes existentes y aumentar el LTV

--------------------------------------------------------------
**1. INFORMACIÓN DE LA EMPRESA Y PROPUESTA DE VALOR**
--------------------------------------------------------------

   **Información General de la Empresa:**
   (Misión, visión, valores, historia, etc.)
   


   **Propuesta de Valor y Diferenciación:**
   (¿Qué os hace únicos y diferentes de la competencia?)
   


--------------------------------------------------------------
**2. PÚBLICO OBJETIVO Y COMPETENCIA**
--------------------------------------------------------------

   **Público Objetivo:**
   (Describe a tu cliente ideal, sus problemas y necesidades.)
   


   **Competencia y Mercado:**
   (Describe a tus principales competidores y cómo percibes el mercado.)
   


--------------------------------------------------------------
**3. OBJETIVOS Y PERSONALIDAD**
--------------------------------------------------------------

   **Objetivo Principal Prioritario:**
   (De todos los objetivos, si solo pudieras elegir uno para los próximos 3 meses, ¿cuál sería? Ej: Generar 10 leads cualificados este mes.)
   

   **Presupuesto Mensual Máximo Indicado (Ej: 500€):**
   

   **Personalidad de Marca (Adjetivos Clave - marcar los que apliquen):**
     - [ ] Profesional y Técnico
     - [ ] Cercano y Amigable
     - [ ] Lujoso y Elegante
     - [ ] Vibrante y Moderno
     - [ ] Eco-consciente y Natural
     - [ ] Divertido y Juvenil

--------------------------------------------------------------
**4. CONTEXTO ADICIONAL (Catch-all)**
--------------------------------------------------------------

   **Otros Detalles Importantes:**
   (Añade aquí cualquier otra información que la IA deba conocer y que no encaje en las secciones anteriores. Puedes pegar información de otros cuestionarios aquí.)
   

        `;
        const blob = new Blob([formText.trim()], { type: 'text/plain' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = 'cuestionario-plan-publicidad.txt';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
    };

    async function onSubmit(values: CreateAdPlanInput) {
        setIsLoading(true);
        setAdPlan(null);
        toast({ title: "Generando plan de publicidad...", description: "La IA está analizando la web y preparando tu estrategia. Esto puede tardar un momento." });
        
        const user = auth.currentUser;
        if (!user) {
            toast({ variant: 'destructive', title: "Error de autenticación", description: "Por favor, inicia sesión de nuevo." });
            setIsLoading(false);
            return;
        }

        try {
            const token = await user.getIdToken();
            const result = await generateAdPlanAction(values, token);

            setIsLoading(false);
            if (result.error) {
                toast({ variant: 'destructive', title: "Error al generar el plan", description: result.error });
            } else if (result.data) {
                setAdPlan(result.data);
                toast({ title: "¡Plan generado con éxito!", description: "Revisa la estrategia propuesta a continuación." });
                fetchHistory();
            }
        } catch (error: any) {
            setIsLoading(false);
            toast({ variant: 'destructive', title: "Error de Red", description: error.message });
        }
    }
    
    const handleViewHistory = (plan: CreateAdPlanOutput) => {
        setAdPlan(plan);
        window.scrollTo(0, 0);
    };

    return (
        <div className="container mx-auto py-8 space-y-8">
            <Card>
                <CardHeader>
                    <div className="flex items-center space-x-3">
                        <Megaphone className="h-8 w-8 text-primary" />
                        <div>
                            <CardTitle>
                                {adPlan ? `Plan de Publicidad: ${adPlan.url}` : 'Planificador de Publicidad con IA'}
                            </CardTitle>
                            <CardDescription>
                                {adPlan ? 'Revisa, edita y guarda tu plan estratégico.' : 'Genera planes de publicidad digital profesionales para cualquier web.'}
                            </CardDescription>
                        </div>
                    </div>
                </CardHeader>
            </Card>

            {!adPlan && (
                <Card>
                    <CardHeader>
                         <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                            <div>
                                <CardTitle>Crear Nuevo Plan</CardTitle>
                                <CardDescription>
                                    Introduce la URL y los objetivos. Las secciones opcionales mejorarán la precisión del plan.
                                </CardDescription>
                            </div>
                            <Button variant="outline" onClick={handleDownloadForm}>
                                <Download className="mr-2 h-4 w-4" />
                                Descargar Cuestionario
                            </Button>
                        </div>
                    </CardHeader>
                    <CardContent>
                        <Form {...form}>
                            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
                                <FormField
                                    control={form.control}
                                    name="url"
                                    render={({ field }) => (
                                        <FormItem>
                                            <FormLabel>URL del Sitio Web a Analizar</FormLabel>
                                            <FormControl>
                                                <Input placeholder="https://ejemplo.com" {...field} />
                                            </FormControl>
                                            <FormMessage />
                                        </FormItem>
                                    )}
                                />
                                
                                <Accordion type="multiple" className="w-full pt-4 border-t">
                                     <AccordionItem value="item-main">
                                        <AccordionTrigger>
                                            <h3 className="text-lg font-semibold">Objetivos Principales</h3>
                                        </AccordionTrigger>
                                         <AccordionContent className="space-y-6 pt-4">
                                            <FormField
                                                control={form.control}
                                                name="objectives"
                                                render={() => (
                                                    <FormItem>
                                                        <FormLabel>Objetivos Generales de la Campaña</FormLabel>
                                                        <FormDescription>Selecciona todos los que apliquen.</FormDescription>
                                                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2">
                                                            {objectives.map((item) => (
                                                                <FormField key={item} control={form.control} name="objectives"
                                                                    render={({ field }) => (
                                                                    <FormItem key={item} className="flex flex-row items-start space-x-3 space-y-0">
                                                                        <FormControl>
                                                                        <Checkbox
                                                                            checked={field.value?.includes(item)}
                                                                            onCheckedChange={(checked) => {
                                                                            return checked
                                                                                ? field.onChange([...(field.value || []), item])
                                                                                : field.onChange((field.value || [])?.filter((value) => value !== item))
                                                                            }}
                                                                        />
                                                                        </FormControl>
                                                                        <FormLabel className="font-normal">{item}</FormLabel>
                                                                    </FormItem>
                                                                    )}
                                                                />
                                                            ))}
                                                        </div>
                                                        <FormMessage />
                                                    </FormItem>
                                                )}
                                            />
                                         </AccordionContent>
                                     </AccordionItem>
                                </Accordion>

                                 <Accordion type="multiple" className="w-full pt-4 border-t">
                                    <AccordionItem value="item-1">
                                        <AccordionTrigger>
                                            <h3 className="text-lg font-semibold">Optimización Adicional (Opcional)</h3>
                                        </AccordionTrigger>
                                        <AccordionContent className="space-y-6 pt-4">
                                            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                                <FormField
                                                    control={form.control} name="priorityObjective" render={({ field }) => (
                                                        <FormItem>
                                                            <FormLabel>1. Objetivo Principal Prioritario</FormLabel>
                                                            <FormControl><Input placeholder="Ej: Generar 10 leads cualificados este mes" {...field} /></FormControl>
                                                            <FormMessage />
                                                        </FormItem>
                                                    )}
                                                />
                                                 <FormField
                                                    control={form.control} name="monthlyBudget" render={({ field }) => (
                                                        <FormItem>
                                                            <FormLabel>2. Presupuesto Mensual Máximo (€)</FormLabel>
                                                            <FormControl>
                                                                <Input type="number" placeholder="Ej: 500" {...field} min="50" />
                                                            </FormControl>
                                                            <FormMessage />
                                                        </FormItem>
                                                    )}
                                                />
                                            </div>
                                            <FormField
                                                control={form.control} name="brandPersonality" render={() => (
                                                    <FormItem>
                                                        <FormLabel>3. Personalidad de Marca</FormLabel>
                                                         <FormDescription>Selecciona los adjetivos que mejor describan la marca.</FormDescription>
                                                        <div className="grid grid-cols-2 md:grid-cols-3 gap-4 pt-2">
                                                            {brandPersonalities.map((item) => (
                                                                <FormField key={item.id} control={form.control} name="brandPersonality"
                                                                    render={({ field }) => (
                                                                        <FormItem key={item.id} className="flex flex-row items-start space-x-3 space-y-0">
                                                                            <FormControl>
                                                                                <Checkbox
                                                                                    checked={field.value?.includes(item.label)}
                                                                                    onCheckedChange={(checked) => {
                                                                                        return checked
                                                                                            ? field.onChange([...(field.value || []), item.label])
                                                                                            : field.onChange((field.value || [])?.filter((value) => value !== item.label))
                                                                                    }}
                                                                                />
                                                                            </FormControl>
                                                                            <FormLabel className="font-normal">{item.label}</FormLabel>
                                                                        </FormItem>
                                                                    )}
                                                                />
                                                            ))}
                                                        </div>
                                                        <FormMessage />
                                                    </FormItem>
                                                )}
                                            />
                                             <FormField
                                                control={form.control} name="companyInfo" render={({ field }) => (
                                                    <FormItem>
                                                        <FormLabel>4. Información General de la Empresa</FormLabel>
                                                        <FormControl><Textarea placeholder="Misión, visión, valores, historia, etc." {...field} rows={4} /></FormControl>
                                                        <FormMessage />
                                                    </FormItem>
                                                )}
                                            />
                                            <FormField
                                                control={form.control} name="valueProposition" render={({ field }) => (
                                                    <FormItem>
                                                        <FormLabel>5. Propuesta de Valor y Diferenciación</FormLabel>
                                                        <FormControl><Textarea placeholder="¿Qué os hace únicos y diferentes de la competencia?" {...field} rows={4} /></FormControl>
                                                        <FormMessage />
                                                    </FormItem>
                                                )}
                                            />
                                            <FormField
                                                control={form.control} name="targetAudience" render={({ field }) => (
                                                    <FormItem>
                                                        <FormLabel>6. Público Objetivo y sus Problemas</FormLabel>
                                                        <FormControl><Textarea placeholder="Describe a tu cliente ideal, sus problemas y necesidades." {...field} rows={4} /></FormControl>
                                                        <FormMessage />
                                                    </FormItem>
                                                )}
                                            />
                                             <FormField
                                                control={form.control} name="competitors" render={({ field }) => (
                                                    <FormItem>
                                                        <FormLabel>7. Competencia y Mercado</FormLabel>
                                                        <FormControl><Textarea placeholder="Describe a tus principales competidores y cómo percibes el mercado." {...field} rows={4} /></FormControl>
                                                        <FormMessage />
                                                    </FormItem>
                                                )}
                                            />
                                             <FormField
                                                control={form.control} name="additionalContext" render={({ field }) => (
                                                    <FormItem>
                                                        <FormLabel>8. Contexto Adicional (Notas Finales)</FormLabel>
                                                        <FormControl><Textarea placeholder="Pega aquí la información de tu cuestionario o añade cualquier otra cosa que la IA deba conocer." {...field} rows={6} /></FormControl>
                                                        <FormMessage />
                                                    </FormItem>
                                                )}
                                            />
                                        </AccordionContent>
                                    </AccordionItem>
                                </Accordion>

                                <Button type="submit" disabled={isLoading} className="w-full sm:w-auto">
                                    {isLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Sparkles className="mr-2 h-4 w-4" />}
                                    {isLoading ? 'Generando...' : 'Generar Plan Estratégico'}
                                </Button>
                            </form>
                        </Form>
                    </CardContent>
                </Card>
            )}

            {adPlan && <AdPlanView plan={adPlan} onPlanUpdate={setAdPlan} onReset={() => setAdPlan(null)} companyInfo={companyInfo} />}

            {!adPlan && (
                <div className="mt-8">
                    <AdPlanHistory history={history} isLoading={isLoadingHistory} onViewPlan={handleViewHistory} onHistoryUpdate={fetchHistory} />
                </div>
            )}
        </div>
    );
}
