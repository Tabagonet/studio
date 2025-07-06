
'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import React, { useState, useEffect, useCallback } from 'react';
import { CreateAdPlanInputSchema, type CreateAdPlanInput, type CreateAdPlanOutput } from './schema';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
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


const objectives = [
    "Aumentar las ventas de un producto/servicio específico",
    "Generar leads cualificados (formularios, suscripciones)",
    "Aumentar el reconocimiento de marca (brand awareness)",
    "Impulsar el tráfico a la web o a una landing page",
    "Incrementar los seguidores y la interacción en redes sociales",
    "Fidelizar clientes existentes y aumentar el LTV",
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
            additional_context: '',
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

                // For super admins, we try to find a specific default company.
                // For regular admins, we use their assigned companyId.
                const companyIdToFetch = userData.role === 'super_admin' 
                    ? (await (await fetch('/api/admin/companies', { headers: { 'Authorization': `Bearer ${token}` } })).json()).companies.find((c: any) => c.name === 'Grupo 4 alas S.L.')?.id
                    : userData.companyId;

                if (companyIdToFetch) {
                    const companyResponse = await fetch(`/api/user-settings/company?companyId=${companyIdToFetch}`, { headers: { 'Authorization': `Bearer ${token}` } });
                    if (companyResponse.ok) {
                        const companyData = await companyResponse.json();
                        if (companyData.company) {
                           setCompanyInfo(companyData.company);
                           return; // Exit after setting company info
                        }
                    }
                }
                
                // Fallback if no company info is fetched
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
                        <CardDescription>Introduce la URL y los objetivos. Añade contexto para un plan más preciso.</CardDescription>
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
                                <FormField
                                    control={form.control}
                                    name="objectives"
                                    render={() => (
                                        <FormItem>
                                             <FormLabel>Objetivos de la Campaña</FormLabel>
                                             <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                                {objectives.map((item) => (
                                                    <FormField
                                                    key={item}
                                                    control={form.control}
                                                    name="objectives"
                                                    render={({ field }) => {
                                                        return (
                                                        <FormItem
                                                            key={item}
                                                            className="flex flex-row items-start space-x-3 space-y-0"
                                                        >
                                                            <FormControl>
                                                            <Checkbox
                                                                checked={field.value?.includes(item)}
                                                                onCheckedChange={(checked) => {
                                                                return checked
                                                                    ? field.onChange([...field.value, item])
                                                                    : field.onChange(
                                                                        field.value?.filter(
                                                                        (value) => value !== item
                                                                        )
                                                                    )
                                                                }}
                                                            />
                                                            </FormControl>
                                                            <FormLabel className="font-normal">
                                                            {item}
                                                            </FormLabel>
                                                        </FormItem>
                                                        )
                                                    }}
                                                    />
                                                ))}
                                            </div>
                                            <FormMessage />
                                        </FormItem>
                                    )}
                                />
                                 <FormField
                                    control={form.control}
                                    name="additional_context"
                                    render={({ field }) => (
                                        <FormItem>
                                            <FormLabel>Contexto Adicional (Opcional)</FormLabel>
                                            <FormControl>
                                                <Textarea 
                                                    placeholder="Añade aquí cualquier información que la IA deba conocer y que no esté en la web. Por ejemplo: 'Somos una empresa familiar con 50 años de historia' o 'Queremos promocionar nuestro nuevo producto XYZ que es eco-friendly'." 
                                                    {...field}
                                                    rows={4}
                                                />
                                            </FormControl>
                                            <FormMessage />
                                        </FormItem>
                                    )}
                                />
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
