
"use client";

import { useState, useEffect, useCallback } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Brain, Info, Save, Loader2, RotateCcw, Building, User, Globe } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { auth, onAuthStateChanged, type FirebaseUser } from "@/lib/firebase";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue, SelectGroup, SelectLabel } from "@/components/ui/select";
import { PROMPT_DEFAULTS } from '@/lib/constants';
import type { Company, User as AppUser } from '@/lib/types';


type PromptKey = keyof typeof PROMPT_DEFAULTS;

interface EntityConnection {
    key: string;
    url: string | null;
}
interface SelectableEntity {
    id: string;
    name: string;
    type: 'user' | 'company';
    connections: EntityConnection[];
}


export default function PromptsPage() {
    const [prompt, setPrompt] = useState("");
    const [isSaving, setIsSaving] = useState(false);
    const [isLoading, setIsLoading] = useState(true);
    
    const [entities, setEntities] = useState<SelectableEntity[]>([]);
    const [selectedEntityId, setSelectedEntityId] = useState<string>('');
    const [selectedConnectionKey, setSelectedConnectionKey] = useState<string>('');
    const [selectedPromptKey, setSelectedPromptKey] = useState<PromptKey>('productDescription');
    const { toast } = useToast();

    const fetchEntities = useCallback(async (user: FirebaseUser) => {
        setIsLoading(true);
        try {
            const token = await user.getIdToken();
            const [companiesResponse, usersResponse] = await Promise.all([
                fetch('/api/admin/companies', { headers: { 'Authorization': `Bearer ${token}` } }),
                fetch('/api/admin/users', { headers: { 'Authorization': `Bearer ${token}` } })
            ]);

            const newEntities: SelectableEntity[] = [];

            if (companiesResponse.ok) {
                const { companies } = await companiesResponse.json();
                companies.forEach((c: Company & { connections?: any }) => {
                    newEntities.push({
                        id: c.id,
                        name: c.name,
                        type: 'company',
                        connections: Object.entries(c.connections || {}).map(([key, value]: [string, any]) => ({
                            key,
                            url: value.wooCommerceStoreUrl || value.wordpressApiUrl || value.shopifyStoreUrl || key
                        })).filter(c => c.key !== 'partner_app'),
                    });
                });
            }
            
            // Add Super Admin's personal settings
            const superAdmin = (await usersResponse.json()).users.find((u: AppUser) => u.uid === user.uid);
            if(superAdmin) {
                 newEntities.unshift({
                    id: user.uid,
                    name: 'Mis Conexiones (Super Admin)',
                    type: 'user',
                    connections: Object.entries(superAdmin.connections || {}).map(([key, value]: [string, any]) => ({
                        key,
                        url: value.wooCommerceStoreUrl || value.wordpressApiUrl || value.shopifyStoreUrl || key
                    })).filter(c => c.key !== 'partner_app'),
                });
            }
            
            setEntities(newEntities);
            if (newEntities.length > 0) {
                setSelectedEntityId(newEntities[0].id);
                if (newEntities[0].connections.length > 0) {
                    setSelectedConnectionKey(newEntities[0].connections[0].key);
                } else {
                    setSelectedConnectionKey('');
                }
            }
        } catch (error) {
            console.error("Error fetching entities:", error);
            toast({ title: "Error al cargar entidades", variant: "destructive" });
        } finally {
            setIsLoading(false);
        }
    }, [toast]);
    
    const fetchPrompt = useCallback(async () => {
        if (!selectedEntityId || !selectedConnectionKey) {
            setPrompt(PROMPT_DEFAULTS[selectedPromptKey]?.default || '');
            return;
        }
        setIsLoading(true);
        const user = auth.currentUser;
        if (!user) return;

        try {
            const token = await user.getIdToken();
            const currentEntity = entities.find(e => e.id === selectedEntityId);
            if (!currentEntity) return;

            const params = new URLSearchParams({
                promptKey: selectedPromptKey,
                connectionKey: selectedConnectionKey,
                entityType: currentEntity.type,
                entityId: currentEntity.id,
            });

            const response = await fetch(`/api/user-settings/prompt?${params.toString()}`, {
                headers: { 'Authorization': `Bearer ${token}` }
            });

            if (response.ok) {
                const data = await response.json();
                setPrompt(data.prompt || PROMPT_DEFAULTS[selectedPromptKey]?.default || '');
            } else {
                setPrompt(PROMPT_DEFAULTS[selectedPromptKey]?.default || '');
            }
        } catch (error) {
            console.error("Error fetching custom prompt:", error);
            setPrompt(PROMPT_DEFAULTS[selectedPromptKey]?.default || '');
        } finally {
            setIsLoading(false);
        }
    }, [selectedEntityId, selectedConnectionKey, selectedPromptKey, entities]);

    useEffect(() => {
        const unsubscribe = onAuthStateChanged(auth, (user) => {
            if (user) {
                fetchEntities(user);
            } else {
                setIsLoading(false);
            }
        });
        return () => unsubscribe();
    }, [fetchEntities]);
    
    useEffect(() => {
        fetchPrompt();
    }, [fetchPrompt]);

    const handleSave = async () => {
        if (!selectedEntityId || !selectedConnectionKey) {
            toast({ title: "Selección requerida", description: "Por favor, selecciona una entidad y una conexión.", variant: "destructive" });
            return;
        }
        setIsSaving(true);
        const user = auth.currentUser;
        if (!user) {
            toast({ title: "Error de autenticación", variant: "destructive" });
            setIsSaving(false);
            return;
        }
        const currentEntity = entities.find(e => e.id === selectedEntityId);
        if (!currentEntity) return;

        try {
            const token = await user.getIdToken();
            const response = await fetch('/api/user-settings/prompt', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
                body: JSON.stringify({
                    prompt: prompt,
                    promptKey: selectedPromptKey,
                    entityId: currentEntity.id,
                    entityType: currentEntity.type,
                    connectionKey: selectedConnectionKey,
                })
            });

            const result = await response.json();
            if (!response.ok) throw new Error(result.error || 'Error al guardar la plantilla');

            toast({ title: "Plantilla Guardada", description: `Tu plantilla se ha actualizado.` });
        } catch (error: any) {
            toast({ title: "Error al Guardar", description: error.message, variant: "destructive" });
        } finally {
            setIsSaving(false);
        }
    }
    
    const handleResetToDefault = () => {
        setPrompt(PROMPT_DEFAULTS[selectedPromptKey]?.default || '');
        toast({ title: "Plantilla Restaurada", description: "Se ha cargado la plantilla original. Haz clic en Guardar para aplicarla." });
    };
    
    const selectedEntity = entities.find(e => e.id === selectedEntityId);

  return (
    <div className="container mx-auto py-8 space-y-8">
        <Card>
            <CardHeader>
                <div className="flex items-center space-x-3">
                    <Brain className="h-8 w-8 text-primary" />
                    <div>
                        <CardTitle>Gestor de Prompts Centralizado</CardTitle>
                        <CardDescription>Selecciona una entidad y una de sus conexiones para personalizar sus plantillas de IA.</CardDescription>
                    </div>
                </div>
            </CardHeader>
        </Card>

        <Card>
            <CardHeader>
                 <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                     <div>
                        <Label htmlFor="entity-selector">1. Selecciona una Entidad</Label>
                        <Select value={selectedEntityId} onValueChange={(value) => {
                            setSelectedEntityId(value);
                            const entity = entities.find(e => e.id === value);
                            setSelectedConnectionKey(entity?.connections[0]?.key || '');
                        }}>
                            <SelectTrigger id="entity-selector"><SelectValue placeholder="Selecciona..." /></SelectTrigger>
                            <SelectContent>
                                {entities.map(entity => (
                                    <SelectItem key={entity.id} value={entity.id}>
                                       {entity.type === 'company' ? <Building className="inline-block mr-2 h-4 w-4" /> : <User className="inline-block mr-2 h-4 w-4" />}
                                       {entity.name}
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                     </div>
                     <div>
                        <Label htmlFor="connection-selector">2. Selecciona una Conexión</Label>
                        <Select value={selectedConnectionKey} onValueChange={setSelectedConnectionKey} disabled={!selectedEntity}>
                            <SelectTrigger id="connection-selector"><SelectValue placeholder="Selecciona..." /></SelectTrigger>
                             <SelectContent>
                               {selectedEntity?.connections.map(conn => (
                                   <SelectItem key={conn.key} value={conn.key}>
                                       <Globe className="inline-block mr-2 h-4 w-4" />
                                       {conn.url}
                                   </SelectItem>
                               ))}
                            </SelectContent>
                        </Select>
                     </div>
                     <div>
                        <Label htmlFor="prompt-selector">3. Selecciona una Plantilla</Label>
                        <Select value={selectedPromptKey} onValueChange={(value) => setSelectedPromptKey(value as PromptKey)}>
                            <SelectTrigger id="prompt-selector"><SelectValue /></SelectTrigger>
                            <SelectContent>
                                {Object.entries(PROMPT_DEFAULTS).map(([key, { label }]) => (
                                    <SelectItem key={key} value={key}>{label}</SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                     </div>
                 </div>
            </CardHeader>
            <CardContent className="space-y-4">
                 <div>
                     {isLoading ? (
                        <div className="mt-2 flex h-[400px] w-full items-center justify-center rounded-md border border-dashed">
                             <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                             <p className="ml-2 text-muted-foreground">Cargando plantilla...</p>
                        </div>
                    ) : (
                        <Textarea 
                            id="prompt-template"
                            value={prompt}
                            onChange={(e) => setPrompt(e.target.value)}
                            className="mt-2 font-code min-h-[400px] text-sm"
                            placeholder="Introduce tu prompt de IA aquí..."
                            disabled={!selectedConnectionKey}
                        />
                    )}
                </div>
                {!selectedConnectionKey && !isLoading && (
                    <Alert variant="destructive">
                       <Info className="h-4 w-4" />
                       <AlertTitle>No hay conexión seleccionada</AlertTitle>
                       <AlertDescription>Esta entidad no tiene conexiones configuradas. No puedes editar prompts hasta que se añada una.</AlertDescription>
                   </Alert>
                )}
                <div className="flex flex-col sm:flex-row justify-end gap-2">
                    <Button onClick={handleResetToDefault} variant="outline" disabled={isSaving || isLoading || !selectedConnectionKey}>
                        <RotateCcw className="mr-2 h-4 w-4" />
                        Restaurar por Defecto
                    </Button>
                    <Button onClick={handleSave} disabled={isSaving || isLoading || !selectedConnectionKey}>
                        {isSaving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
                        {isSaving ? "Guardando..." : "Guardar Plantilla"}
                    </Button>
                </div>
            </CardContent>
        </Card>
    </div>
  );
}
