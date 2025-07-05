
'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import React, { useState } from 'react';
import { CreateAdPlanInputSchema, type CreateAdPlanInput, type CreateAdPlanOutput } from '@/ai/flows/create-ad-plan-flow';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Loader2, Sparkles, Megaphone } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { generateAdPlanAction } from './actions';
import { AdPlanView } from './ad-plan-view';

const objectives = [
    "Aumentar las ventas de un producto/servicio específico",
    "Generar leads cualificados (formularios, suscripciones)",
    "Aumentar el reconocimiento de marca (brand awareness)",
    "Impulsar el tráfico a la web o a una landing page",
    "Incrementar los seguidores y la interacción en redes sociales",
];

export default function AdPlannerPage() {
    const [isLoading, setIsLoading] = useState(false);
    const [adPlan, setAdPlan] = useState<CreateAdPlanOutput | null>(null);
    const { toast } = useToast();

    const form = useForm<CreateAdPlanInput>({
        resolver: zodResolver(CreateAdPlanInputSchema),
        defaultValues: {
            url: '',
            objective: '',
        },
    });

    async function onSubmit(values: CreateAdPlanInput) {
        setIsLoading(true);
        setAdPlan(null);
        toast({ title: "Generando plan de publicidad...", description: "La IA está analizando la web y preparando tu estrategia. Esto puede tardar un momento." });

        const result = await generateAdPlanAction(values);

        setIsLoading(false);
        if (result.error) {
            toast({ variant: 'destructive', title: "Error al generar el plan", description: result.error });
        } else if (result.data) {
            setAdPlan(result.data);
            toast({ title: "¡Plan generado con éxito!", description: "Revisa la estrategia propuesta a continuación." });
        }
    }

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
                                    name="objective"
                                    render={({ field }) => (
                                        <FormItem>
                                            <FormLabel>Objetivo Principal</FormLabel>
                                            <Select onValueChange={field.onChange} defaultValue={field.value}>
                                                <FormControl>
                                                    <SelectTrigger>
                                                        <SelectValue placeholder="Selecciona un objetivo..." />
                                                    </SelectTrigger>
                                                </FormControl>
                                                <SelectContent>
                                                    {objectives.map((obj) => (
                                                        <SelectItem key={obj} value={obj}>{obj}</SelectItem>
                                                    ))}
                                                </SelectContent>
                                            </Select>
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

            {adPlan && <AdPlanView plan={adPlan} onReset={() => setAdPlan(null)} />}
        </div>
    );
}
