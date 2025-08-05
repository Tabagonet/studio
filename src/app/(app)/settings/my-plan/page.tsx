
"use client";

import React, { useState, useEffect, useCallback } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Loader2, Sparkles, AlertCircle, CheckCircle, Mail, ArrowRight } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { auth, onAuthStateChanged, type FirebaseUser } from '@/lib/firebase';
import { type Plan, type PlanUsage } from '@/lib/types';
import { Skeleton } from '@/components/ui/skeleton';
import { SUPPORT_EMAIL } from '@/lib/constants';
import Link from 'next/link';
import { cn } from '@/lib/utils';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from '@/components/ui/badge';


const PlanCard = ({ plan, isCurrent }: { plan: Plan; isCurrent: boolean }) => (
    <Card className={cn("flex flex-col", isCurrent ? "border-primary ring-2 ring-primary" : "hover:shadow-lg transition-shadow")}>
        <CardHeader>
            <CardTitle className="flex items-center justify-between">
                <span>{plan.name}</span>
                {isCurrent && <Badge>Plan Actual</Badge>}
            </CardTitle>
            <CardDescription>{plan.price}</CardDescription>
        </CardHeader>
        <CardContent className="flex-grow space-y-3">
            <ul className="space-y-2 text-sm">
                <li className="flex items-center gap-2">
                    <CheckCircle className="h-4 w-4 text-green-500" />
                    <span>Conexiones a Sitios: <strong>{plan.sites >= 999 ? 'Ilimitado' : plan.sites}</strong></span>
                </li>
                <li className="flex items-center gap-2">
                    <CheckCircle className="h-4 w-4 text-green-500" />
                    <span>Usuarios por empresa: <strong>{plan.users >= 999 ? 'Ilimitado' : plan.users}</strong></span>
                </li>
                 <li className="flex items-center gap-2">
                    <CheckCircle className="h-4 w-4 text-green-500" />
                    <span>Créditos de IA / mes: <strong>{plan.aiCredits.toLocaleString('es-ES')}</strong></span>
                </li>
            </ul>
        </CardContent>
        <CardFooter>
            {!isCurrent && (
                 <Button asChild className="w-full">
                    <Link href={`mailto:${SUPPORT_EMAIL}?subject=Solicitud de cambio al plan ${plan.name}`}>
                      <Mail className="mr-2 h-4 w-4" /> Solicitar Cambio
                    </Link>
                </Button>
            )}
        </CardFooter>
    </Card>
);

export default function MyPlanPage() {
    const [currentPlan, setCurrentPlan] = useState<Plan | null>(null);
    const [allPlans, setAllPlans] = useState<Plan[]>([]);
    const [usage, setUsage] = useState<PlanUsage | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const { toast } = useToast();

    const fetchMyPlanData = useCallback(async (user: FirebaseUser) => {
        setIsLoading(true);
        try {
            const token = await user.getIdToken();
            const response = await fetch('/api/user-settings/my-plan', { headers: { 'Authorization': `Bearer ${token}` } });
            if (!response.ok) throw new Error((await response.json()).error || 'No se pudo cargar la información del plan.');

            const data = await response.json();
            setCurrentPlan(data.currentPlan);
            setAllPlans(data.allPlans);
            setUsage(data.usage);
        } catch (error: any) {
            toast({ title: "Error al cargar datos", description: error.message, variant: "destructive" });
        } finally {
            setIsLoading(false);
        }
    }, [toast]);

    useEffect(() => {
        const unsubscribe = onAuthStateChanged(auth, (user) => {
            if (user) {
                fetchMyPlanData(user);
            } else {
                setIsLoading(false);
            }
        });
        return () => unsubscribe();
    }, [fetchMyPlanData]);


    if (isLoading) {
        return (
            <div className="container mx-auto py-8 space-y-6">
                <Skeleton className="h-24" />
                <div className="grid md:grid-cols-2 gap-6">
                    <Skeleton className="h-64" />
                    <Skeleton className="h-64" />
                </div>
                <Skeleton className="h-48" />
            </div>
        )
    }
    
    if (!currentPlan) {
        return (
            <div className="container mx-auto py-8">
                 <Card>
                    <CardHeader>
                         <div className="flex items-center space-x-3">
                            <Sparkles className="h-8 w-8 text-primary" />
                            <div>
                                <CardTitle>Mi Plan y Facturación</CardTitle>
                                <CardDescription>Gestiona tu suscripción y consulta tu uso.</CardDescription>
                            </div>
                        </div>
                    </CardHeader>
                    <CardContent>
                        <p className="text-muted-foreground">No tienes un plan de suscripción activo. Contacta con el administrador.</p>
                    </CardContent>
                </Card>
            </div>
        )
    }
    
    return (
        <div className="container mx-auto py-8 space-y-6">
             <Card>
                <CardHeader>
                     <div className="flex items-center space-x-3">
                        <Sparkles className="h-8 w-8 text-primary" />
                        <div>
                            <CardTitle>Mi Plan y Facturación</CardTitle>
                            <CardDescription>Gestiona tu suscripción y consulta tu uso.</CardDescription>
                        </div>
                    </div>
                </CardHeader>
            </Card>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {allPlans.sort((a,b) => a.aiCredits - b.aiCredits).map(plan => (
                    <PlanCard key={plan.id} plan={plan} isCurrent={currentPlan.id === plan.id} />
                ))}
            </div>

            <Card>
                <CardHeader>
                    <CardTitle>Resumen de Uso Actual</CardTitle>
                    <CardDescription>Este es el uso actual de los recursos de tu plan.</CardDescription>
                </CardHeader>
                <CardContent>
                     <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead>Recurso</TableHead>
                                <TableHead className="text-center">Uso Actual</TableHead>
                                <TableHead className="text-center">Límite del Plan</TableHead>
                                <TableHead className="text-right">Progreso</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            <TableRow>
                                <TableCell className="font-medium">Usuarios</TableCell>
                                <TableCell className="text-center">{usage?.users.used ?? 0}</TableCell>
                                <TableCell className="text-center">{usage?.users.limit ?? 0}</TableCell>
                                <TableCell className="text-right">
                                    <progress value={usage?.users.used} max={usage?.users.limit} className="w-24 h-2 [&::-webkit-progress-bar]:rounded-lg [&::-webkit-progress-value]:rounded-lg [&::-webkit-progress-bar]:bg-slate-300 [&::-webkit-progress-value]:bg-primary [&::-moz-progress-bar]:bg-primary"/>
                                </TableCell>
                            </TableRow>
                            <TableRow>
                                <TableCell className="font-medium">Conexiones a Sitios</TableCell>
                                <TableCell className="text-center">{usage?.connections.used ?? 0}</TableCell>
                                <TableCell className="text-center">{usage?.connections.limit ?? 0}</TableCell>
                                <TableCell className="text-right">
                                     <progress value={usage?.connections.used} max={usage?.connections.limit} className="w-24 h-2 [&::-webkit-progress-bar]:rounded-lg [&::-webkit-progress-value]:rounded-lg [&::-webkit-progress-bar]:bg-slate-300 [&::-webkit-progress-value]:bg-primary [&::-moz-progress-bar]:bg-primary"/>
                                </TableCell>
                            </TableRow>
                              <TableRow>
                                <TableCell className="font-medium">Créditos de IA (este mes)</TableCell>
                                <TableCell className="text-center">{usage?.aiCredits.used ?? 0}</TableCell>
                                <TableCell className="text-center">{usage?.aiCredits.limit.toLocaleString('es-ES') ?? 0}</TableCell>
                                <TableCell className="text-right">
                                     <progress value={usage?.aiCredits.used} max={usage?.aiCredits.limit} className="w-24 h-2 [&::-webkit-progress-bar]:rounded-lg [&::-webkit-progress-value]:rounded-lg [&::-webkit-progress-bar]:bg-slate-300 [&::-webkit-progress-value]:bg-primary [&::-moz-progress-bar]:bg-primary"/>
                                </TableCell>
                            </TableRow>
                        </TableBody>
                    </Table>
                </CardContent>
            </Card>
        </div>
    );
}
