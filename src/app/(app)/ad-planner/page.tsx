
'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import React, { useState, useEffect, useCallback } from 'react';
import { CreateAdPlanInputSchema, type CreateAdPlanInput, type CreateAdPlanOutput } from './schema';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage, FormDescription } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Loader2, Sparkles, Megaphone } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { generateAdPlanAction } from './actions';
import { AdPlanView } from './ad-plan-view';
import { auth, onAuthStateChanged, type FirebaseUser } from '@/lib/firebase';
import { Checkbox } from '@/components/ui/checkbox';
import { AdPlanHistory } from './history-list';
import { Textarea } from '@/components/ui/textarea';
import type { Company } from '@/lib/types';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';


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
                            <CardTitle>Planificador de Publicidad con IA</CardTitle>
                            <CardDescription>Genera planes de publicidad digital profesionales para cualquier web.</CardDescription>
                        </div>
                    </div>
                </CardHeader>
            </Card>

            {!adPlan && (
                <Card>
                    <CardHeader>
                        <CardTitle>Crear Nuevo Plan</CardTitle>
                        <CardDescription>Introduce la URL y los objetivos. Para un plan más preciso, despliega las opciones adicionales.</CardDescription>
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
                                    <AccordionItem value="item-1">
                                        <AccordionTrigger>
                                            <h3 className="text-lg font-semibold">1. Información de la Empresa y Propuesta de Valor</h3>
                                        </AccordionTrigger>
                                        <AccordionContent className="space-y-6 pt-4">
                                             <FormField
                                                control={form.control} name="companyInfo" render={({ field }) => (
                                                    <FormItem>
                                                        <FormLabel>Información General de la Empresa</FormLabel>
                                                        <FormDescription>Misión, visión, valores, historia, etc.</FormDescription>
                                                        <FormControl><Textarea placeholder="Somos una empresa familiar con 50 años de historia..." {...field} rows={6} /></FormControl>
                                                        <FormMessage />
                                                    </FormItem>
                                                )}
                                            />
                                            <FormField
                                                control={form.control} name="valueProposition" render={({ field }) => (
                                                    <FormItem>
                                                        <FormLabel>Propuesta de Valor y Diferenciación</FormLabel>
                                                         <FormDescription>¿Qué os hace únicos y diferentes de la competencia?</FormDescription>
                                                        <FormControl><Textarea placeholder="Nuestra propuesta de valor es..." {...field} rows={4} /></FormControl>
                                                        <FormMessage />
                                                    </FormItem>
                                                )}
                                            />
                                        </AccordionContent>
                                    </AccordionItem>
                                    
                                     <AccordionItem value="item-2">
                                        <AccordionTrigger>
                                            <h3 className="text-lg font-semibold">2. Público Objetivo y Competencia</h3>
                                        </AccordionTrigger>
                                        <AccordionContent className="space-y-6 pt-4">
                                            <FormField
                                                control={form.control} name="targetAudience" render={({ field }) => (
                                                    <FormItem>
                                                        <FormLabel>Público Objetivo</FormLabel>
                                                        <FormDescription>Describe a tu cliente ideal, sus problemas y necesidades.</FormDescription>
                                                        <FormControl><Textarea placeholder="Nuestro cliente ideal es una mujer de 30-45 años..." {...field} rows={6} /></FormControl>
                                                        <FormMessage />
                                                    </FormItem>
                                                )}
                                            />
                                             <FormField
                                                control={form.control} name="competitors" render={({ field }) => (
                                                    <FormItem>
                                                        <FormLabel>Competencia y Mercado</FormLabel>
                                                         <FormDescription>Describe a tus principales competidores y cómo percibes el mercado.</FormDescription>
                                                        <FormControl><Textarea placeholder="Nuestros principales competidores son X e Y..." {...field} rows={4} /></FormControl>
                                                        <FormMessage />
                                                    </FormItem>
                                                )}
                                            />
                                        </AccordionContent>
                                    </AccordionItem>

                                    <AccordionItem value="item-3">
                                        <AccordionTrigger>
                                            <h3 className="text-lg font-semibold">3. Objetivos y Personalidad</h3>
                                        </AccordionTrigger>
                                        <AccordionContent className="space-y-6 pt-4">
                                             <FormField
                                                control={form.control}
                                                name="objectives"
                                                render={() => (
                                                    <FormItem>
                                                        <FormLabel>Objetivos Generales de la Campaña</FormLabel>
                                                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
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
                                            <FormField
                                                control={form.control} name="priorityObjective" render={({ field }) => (
                                                    <FormItem>
                                                        <FormLabel>Objetivo Principal Prioritario</FormLabel>
                                                        <FormControl><Input placeholder="Ej: Generar 10 leads cualificados este mes" {...field} /></FormControl>
                                                        <FormMessage />
                                                    </FormItem>
                                                )}
                                            />
                                            <FormField
                                                control={form.control} name="monthlyBudget" render={({ field }) => (
                                                    <FormItem>
                                                        <FormLabel>Presupuesto Mensual Máximo Indicado</FormLabel>
                                                        <Select onValueChange={field.onChange} defaultValue={field.value}>
                                                            <FormControl>
                                                                <SelectTrigger><SelectValue placeholder="Selecciona un rango de presupuesto..." /></SelectTrigger>
                                                            </FormControl>
                                                            <SelectContent>
                                                                <SelectItem value="<500€">&lt; 500€</SelectItem>
                                                                <SelectItem value="500€-1500€">500€ - 1.500€</SelectItem>
                                                                <SelectItem value="1500€-3000€">1.500€ - 3.000€</SelectItem>
                                                                <SelectItem value=">3000€">&gt; 3.000€</SelectItem>
                                                            </SelectContent>
                                                        </Select>
                                                        <FormMessage />
                                                    </FormItem>
                                                )}
                                            />
                                            <FormField
                                                control={form.control} name="brandPersonality" render={() => (
                                                    <FormItem>
                                                        <FormLabel>Personalidad de Marca (Adjetivos Clave)</FormLabel>
                                                        <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
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
                                        </AccordionContent>
                                    </AccordionItem>
                                    
                                     <AccordionItem value="item-4">
                                        <AccordionTrigger>
                                            <h3 className="text-lg font-semibold">4. Contexto Adicional (Catch-all)</h3>
                                        </AccordionTrigger>
                                        <AccordionContent className="space-y-6 pt-4">
                                             <FormField
                                                control={form.control} name="additionalContext" render={({ field }) => (
                                                    <FormItem>
                                                        <FormLabel>Otros Detalles Importantes</FormLabel>
                                                        <FormDescription>Añade aquí cualquier otra información que la IA deba conocer y que no encaje en las secciones anteriores.</FormDescription>
                                                        <FormControl><Textarea placeholder="Ej: Queremos evitar un tono demasiado informal..." {...field} rows={6} /></FormControl>
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
