
'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import React, { useState, useEffect } from 'react';
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
import { AdPlanHistory, type AdPlanHistoryItem } from './history-list';


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
    const [companyInfo, setCompanyInfo] = useState<{name: string, logoUrl: string | null} | null>(null);
    const [history, setHistory] = useState<AdPlanHistoryItem[]>([]);
    const [isLoadingHistory, setIsLoadingHistory] = useState(true);
    const { toast } = useToast();

    const form = useForm<CreateAdPlanInput>({
        resolver: zodResolver(CreateAdPlanInputSchema),
        defaultValues: {
            url: '',
            objectives: [],
        },
    });

    useEffect(() => {
        const fetchInitialData = async (user: FirebaseUser) => {
            setIsLoadingHistory(true);
            const token = await user.getIdToken();
            
            // Fetch Company Info
            try {
                const userVerifyResponse = await fetch('/api/user/verify', { headers: { 'Authorization': `Bearer ${token}` }});
                const userData = await userVerifyResponse.json();
                let companyName = "AutoPress AI";
                let logoUrl = null;

                const companyIdToFetch = userData.role === 'super_admin' 
                    ? (await (await fetch('/api/admin/companies', { headers: { 'Authorization': `Bearer ${token}` } })).json()).companies.find((c: any) => c.name === 'Grupo 4 alas S.L.')?.id
                    : userData.companyId;

                if (companyIdToFetch) {
                    const companyResponse = await fetch(`/api/user-settings/company?companyId=${companyIdToFetch}`, { headers: { 'Authorization': `Bearer ${token}` } });
                    if (companyResponse.ok) {
                        const companyData = await companyResponse.json();
                        if (companyData.company) {
                            companyName = companyData.company.name;
                            logoUrl = companyData.company.logoUrl;
                        }
                    }
                }
                setCompanyInfo({ name: companyName, logoUrl: logoUrl });
            } catch (e) {
                console.error("Failed to fetch company info", e);
                setCompanyInfo({ name: "AutoPress AI", logoUrl: null });
            }

            // Fetch History
            try {
                const historyResponse = await fetch('/api/ad-planner/history', { headers: { 'Authorization': `Bearer ${token}` } });
                if (historyResponse.ok) {
                    setHistory((await historyResponse.json()).history);
                }
            } catch (error) {
                toast({ title: "Error al cargar historial", variant: "destructive" });
            } finally {
                setIsLoadingHistory(false);
            }
        };

        const unsubscribe = onAuthStateChanged(auth, (user) => {
            if (user) {
                fetchInitialData(user);
            } else {
                setIsLoadingHistory(false);
                setCompanyInfo(null);
            }
        });
        return () => unsubscribe();
    }, [toast]);


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
                // Refetch history
                const historyResponse = await fetch('/api/ad-planner/history', { headers: { 'Authorization': `Bearer ${token}` } });
                if (historyResponse.ok) {
                    setHistory((await historyResponse.json()).history);
                }
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
                        <Megaphone className="h-8 w-8 text-secondary" />
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
                        <CardDescription>Introduce la URL y el objetivo principal de la campaña.</CardDescription>
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
                                <Button type="submit" disabled={isLoading} className="w-full sm:w-auto">
                                    {isLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Sparkles className="mr-2 h-4 w-4" />}
                                    {isLoading ? 'Generando...' : 'Generar Plan Estratégico'}
                                </Button>
                            </form>
                        </Form>
                    </CardContent>
                </Card>
            )}

            {adPlan && companyInfo && <AdPlanView plan={adPlan} onReset={() => setAdPlan(null)} companyName={companyInfo.name} logoUrl={companyInfo.logoUrl} />}

            {!adPlan && (
                <div className="mt-8">
                    <AdPlanHistory history={history} isLoading={isLoadingHistory} onViewPlan={handleViewHistory} />
                </div>
            )}
        </div>
    );
}
