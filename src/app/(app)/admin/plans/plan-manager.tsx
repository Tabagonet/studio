
      
"use client";

import React, { useState, useEffect, useCallback } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { NAV_GROUPS } from "@/lib/constants";
import { useToast } from '@/hooks/use-toast';
import { auth, onAuthStateChanged } from '@/lib/firebase';
import { Loader2, Save, Users, Globe, BrainCircuit } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

type PlanId = 'lite' | 'pro' | 'agency';

interface Plan {
    id: PlanId;
    name: string;
    price: string;
    sites: number;
    users: number;
    aiCredits: number;
    features: Record<string, boolean>;
}

const allTools = NAV_GROUPS.flatMap(group => 
    group.items.filter(item => typeof item.requiredPlan !== 'undefined')
).map(item => ({
    id: item.href,
    title: item.title,
    icon: item.icon,
}));

export function PlanManager() {
    const [plans, setPlans] = useState<Plan[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [isSaving, setIsSaving] = useState(false);
    const { toast } = useToast();

    const fetchPlans = useCallback(async () => {
        setIsLoading(true);
        const user = auth.currentUser;
        if (!user) {
            toast({ title: "No autenticado", variant: "destructive" });
            setIsLoading(false);
            return;
        }

        try {
            const token = await user.getIdToken();
            const response = await fetch('/api/settings/plans', {
                headers: { 'Authorization': `Bearer ${token}` },
            });
            if (!response.ok) throw new Error("No se pudo cargar la configuración de planes.");
            const data = await response.json();
            setPlans(data.plans);
        } catch (error: any) {
            toast({ title: "Error", description: error.message, variant: "destructive" });
        } finally {
            setIsLoading(false);
        }
    }, [toast]);

    useEffect(() => {
        onAuthStateChanged(auth, user => {
            if (user) {
                fetchPlans();
            } else {
                setIsLoading(false);
            }
        });
    }, [fetchPlans]);

    const handleToggleFeature = (planId: PlanId, featureId: string, isEnabled: boolean) => {
        setPlans(currentPlans =>
            currentPlans.map(plan =>
                plan.id === planId
                    ? { ...plan, features: { ...plan.features, [featureId]: isEnabled } }
                    : plan
            )
        );
    };
    
    const handleFieldChange = (planId: PlanId, field: 'price' | 'sites' | 'users' | 'aiCredits', value: string) => {
        setPlans(currentPlans =>
             currentPlans.map(plan => {
                if (plan.id === planId) {
                    if (field === 'price') {
                        return { ...plan, price: value };
                    } else {
                        const numericValue = parseInt(value, 10);
                        return { ...plan, [field]: isNaN(numericValue) ? 0 : numericValue };
                    }
                }
                return plan;
            })
        )
    };


    const handleSaveChanges = async () => {
        setIsSaving(true);
        const user = auth.currentUser;
        if (!user) {
            toast({ title: "No autenticado", variant: "destructive" });
            setIsSaving(false);
            return;
        }

        try {
            const token = await user.getIdToken();
            const response = await fetch('/api/settings/plans', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`,
                },
                body: JSON.stringify({ plans }),
            });
            if (!response.ok) throw new Error("No se pudieron guardar los cambios.");
            toast({ title: "¡Éxito!", description: "La configuración de planes ha sido guardada." });
            fetchPlans();
        } catch (error: any) {
            toast({ title: "Error al Guardar", description: error.message, variant: "destructive" });
        } finally {
            setIsSaving(false);
        }
    };


    return (
        <div className="space-y-6">
            <div className="flex justify-end">
                <Button onClick={handleSaveChanges} disabled={isLoading || isSaving}>
                    {isSaving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
                    Guardar Cambios
                </Button>
            </div>
             {isLoading ? (
                 <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                    <Card><CardHeader><CardTitle><Loader2 className="animate-spin h-5 w-5" /></CardTitle></CardHeader><CardContent className="space-y-2"><div className="h-8 bg-muted rounded-md"/><div className="h-8 bg-muted rounded-md"/></CardContent></Card>
                    <Card><CardHeader><CardTitle><Loader2 className="animate-spin h-5 w-5" /></CardTitle></CardHeader><CardContent className="space-y-2"><div className="h-8 bg-muted rounded-md"/><div className="h-8 bg-muted rounded-md"/></CardContent></Card>
                    <Card><CardHeader><CardTitle><Loader2 className="animate-spin h-5 w-5" /></CardTitle></CardHeader><CardContent className="space-y-2"><div className="h-8 bg-muted rounded-md"/><div className="h-8 bg-muted rounded-md"/></CardContent></Card>
                 </div>
            ) : (
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                {plans.map(plan => (
                    <Card key={plan.id}>
                    <CardHeader>
                        <div className="flex items-center justify-between">
                            <CardTitle className="flex items-center gap-2 capitalize">
                                {plan.name}
                            </CardTitle>
                             <div className="w-32">
                                <Input 
                                    value={plan.price} 
                                    onChange={(e) => handleFieldChange(plan.id, 'price', e.target.value)}
                                    className="text-right font-semibold"
                                />
                             </div>
                        </div>
                        <CardDescription>
                         Activa o desactiva las herramientas y define los límites para este plan.
                        </CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        <div className="space-y-3 p-3 rounded-md border bg-muted/30">
                            <h4 className="text-sm font-semibold mb-2">Límites del Plan</h4>
                            <div className="flex items-center gap-2">
                                <Label htmlFor={`sites-${plan.id}`} className="w-24 flex items-center gap-1.5"><Globe className="h-4 w-4 text-muted-foreground"/> Sitios</Label>
                                <Input id={`sites-${plan.id}`} type="number" value={plan.sites} onChange={(e) => handleFieldChange(plan.id, 'sites', e.target.value)} />
                            </div>
                            <div className="flex items-center gap-2">
                                <Label htmlFor={`users-${plan.id}`} className="w-24 flex items-center gap-1.5"><Users className="h-4 w-4 text-muted-foreground"/> Usuarios</Label>
                                <Input id={`users-${plan.id}`} type="number" value={plan.users} onChange={(e) => handleFieldChange(plan.id, 'users', e.target.value)} />
                            </div>
                            <div className="flex items-center gap-2">
                                <Label htmlFor={`aiCredits-${plan.id}`} className="w-24 flex items-center gap-1.5"><BrainCircuit className="h-4 w-4 text-muted-foreground"/> Créditos IA</Label>
                                <Input id={`aiCredits-${plan.id}`} type="number" value={plan.aiCredits} onChange={(e) => handleFieldChange(plan.id, 'aiCredits', e.target.value)} />
                            </div>
                        </div>

                        <div className="space-y-3 pt-4 border-t">
                            <h4 className="text-sm font-semibold mb-2">Herramientas Incluidas</h4>
                            {allTools.map(tool => {
                            const isEnabled = plan.features[tool.id] ?? false;
                            const ToolIcon = tool.icon;
                            return (
                                <div key={tool.id} className="flex items-center justify-between">
                                <Label htmlFor={`${plan.id}-${tool.id}`} className="flex items-center gap-3 cursor-pointer">
                                    <ToolIcon className="h-5 w-5 text-muted-foreground" />
                                    <span className="text-sm">{tool.title}</span>
                                </Label>
                                <Switch
                                    id={`${plan.id}-${tool.id}`}
                                    checked={isEnabled}
                                    onCheckedChange={(checked) => handleToggleFeature(plan.id, tool.id, checked)}
                                    disabled={isSaving}
                                />
                                </div>
                            );
                            })}
                        </div>
                    </CardContent>
                    </Card>
                ))}
                </div>
            )}
        </div>
    );
}
