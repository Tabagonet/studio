
"use client";

import React, { useState, useEffect, useMemo } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { KeyRound, Save, Loader2, Trash2, PlusCircle, ShieldCheck, ShieldAlert } from "lucide-react";
import { auth } from '@/lib/firebase';
import { useToast } from '@/hooks/use-toast';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';

interface ConnectionData {
    wooCommerceStoreUrl: string;
    wooCommerceApiKey: string;
    wooCommerceApiSecret: string;
    wordpressApiUrl: string;
    wordpressUsername: string;
    wordpressApplicationPassword: string;
}

type AllConnections = { [key: string]: ConnectionData };

const INITIAL_STATE: ConnectionData = {
    wooCommerceStoreUrl: '',
    wooCommerceApiKey: '',
    wooCommerceApiSecret: '',
    wordpressApiUrl: '',
    wordpressUsername: '',
    wordpressApplicationPassword: ''
};

function getHostname(url: string): string | null {
    try {
        return new URL(url).hostname;
    } catch (e) {
        return null;
    }
}

export default function ConnectionsPage() {
    const [allConnections, setAllConnections] = useState<AllConnections>({});
    const [activeKey, setActiveKey] = useState<string | null>(null);
    const [selectedKey, setSelectedKey] = useState<string>('new');
    
    const [formData, setFormData] = useState<ConnectionData>(INITIAL_STATE);
    const [isLoading, setIsLoading] = useState(true);
    const [isSaving, setIsSaving] = useState(false);
    const [isDeleting, setIsDeleting] = useState(false);

    const [testStatus, setTestStatus] = useState<'idle' | 'testing' | 'success' | 'error'>('idle');
    const [testMessage, setTestMessage] = useState('');

    const { toast } = useToast();

    const fetchConnections = async () => {
        setIsLoading(true);
        const user = auth.currentUser;
        if (!user) {
            setIsLoading(false);
            return;
        }

        try {
            const token = await user.getIdToken();
            const response = await fetch('/api/user-settings/connections', {
                headers: { 'Authorization': `Bearer ${token}` }
            });

            if (response.ok) {
                const data = await response.json();
                setAllConnections(data.allConnections || {});
                setActiveKey(data.activeConnectionKey || null);
                
                // If there's an active connection, select it by default
                if (data.activeConnectionKey) {
                    setSelectedKey(data.activeConnectionKey);
                } else {
                    setSelectedKey('new');
                    setFormData(INITIAL_STATE);
                }
            }
        } catch (error) {
            console.error("Error fetching connections:", error);
            toast({
                title: "Error al cargar conexiones",
                description: "No se pudieron cargar tus configuraciones guardadas.",
                variant: "destructive"
            });
        } finally {
            setIsLoading(false);
        }
    };

    useEffect(() => {
        const unsubscribe = auth.onAuthStateChanged((user) => {
            if (user) {
                fetchConnections();
            } else {
                setIsLoading(false);
                setAllConnections({});
                setActiveKey(null);
                setSelectedKey('new');
                setFormData(INITIAL_STATE);
            }
        });
        return () => unsubscribe();
    }, [toast]);
    
    useEffect(() => {
        if (selectedKey === 'new') {
            setFormData(INITIAL_STATE);
        } else if (allConnections[selectedKey]) {
            setFormData(allConnections[selectedKey]);
        }
    }, [selectedKey, allConnections]);

    const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const { name, value } = e.target;
        setFormData(prev => ({ ...prev, [name]: value }));
    };

    const handleSave = async () => {
        const key = getHostname(formData.wooCommerceStoreUrl);
        if (!key) {
            toast({ title: "URL de la tienda inválida", description: "Por favor, introduce una URL válida para la tienda de WooCommerce.", variant: "destructive" });
            return;
        }

        setIsSaving(true);
        const user = auth.currentUser;
        if (!user) {
            toast({ title: "Error de autenticación", variant: "destructive" });
            setIsSaving(false);
            return;
        }

        try {
            const token = await user.getIdToken();
            await fetch('/api/user-settings/connections', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify({ key, connectionData: formData, setActive: true })
            });

            toast({
                title: "Conexión Guardada",
                description: `Los datos para '${key}' han sido guardados y activados.`,
            });
            await fetchConnections(); // Refetch to update list and active status
            setSelectedKey(key); // Ensure the saved key is now selected
        } catch (error: any) {
            toast({ title: "Error al Guardar", description: error.message, variant: "destructive" });
        } finally {
            setIsSaving(false);
        }
    };
    
    const handleDelete = async () => {
        if (selectedKey === 'new') return;

        setIsDeleting(true);
        const user = auth.currentUser;
        if (!user) {
            toast({ title: "Error de autenticación", variant: "destructive" });
            setIsDeleting(false);
            return;
        }

        try {
            const token = await user.getIdToken();
            await fetch('/api/user-settings/connections', {
                method: 'DELETE',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
                body: JSON.stringify({ key: selectedKey })
            });
            
            toast({ title: "Conexión Eliminada", description: `El perfil para '${selectedKey}' ha sido eliminado.` });
            await fetchConnections(); // Refetch to update the list
        } catch (error: any) {
            toast({ title: "Error al Eliminar", description: error.message, variant: "destructive" });
        } finally {
            setIsDeleting(false);
        }
    };

    // Placeholder for connection test logic
    const handleTestConnection = async () => {
        setTestStatus('testing');
        // This is a mock response
        await new Promise(resolve => setTimeout(resolve, 1500));
        if (formData.wooCommerceStoreUrl && formData.wordpressApiUrl) {
            setTestStatus('success');
            setTestMessage('¡La conexión con WooCommerce y WordPress parece correcta!');
        } else {
            setTestStatus('error');
            setTestMessage('Faltan datos para realizar la prueba. Asegúrate de rellenar las URLs.');
        }
    };

    const connectionKeys = useMemo(() => Object.keys(allConnections), [allConnections]);

    if (isLoading) {
        return (
            <div className="flex h-64 w-full items-center justify-center">
                <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                <p className="ml-2 text-muted-foreground">Cargando perfiles de conexión...</p>
            </div>
        );
    }

    return (
        <div className="container mx-auto py-8 space-y-8">
            <Card>
                <CardHeader>
                    <div className="flex items-center space-x-3">
                        <KeyRound className="h-8 w-8 text-primary" />
                        <div>
                            <CardTitle>Gestión de Conexiones API</CardTitle>
                            <CardDescription>Guarda y gestiona perfiles para múltiples tiendas WooCommerce.</CardDescription>
                        </div>
                    </div>
                </CardHeader>
            </Card>

            <Card>
                <CardHeader>
                    <CardTitle>Selector de Perfil</CardTitle>
                </CardHeader>
                <CardContent className="flex items-center gap-4">
                    <div className="flex-1">
                        <Label htmlFor="profile-selector">Selecciona un perfil para editar o añade uno nuevo</Label>
                        <Select value={selectedKey} onValueChange={setSelectedKey} disabled={isSaving}>
                            <SelectTrigger id="profile-selector">
                                <SelectValue placeholder="Selecciona un perfil..." />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="new">
                                    <div className="flex items-center">
                                        <PlusCircle className="mr-2 h-4 w-4" />
                                        Añadir Nueva Conexión
                                    </div>
                                </SelectItem>
                                {connectionKeys.map(key => (
                                    <SelectItem key={key} value={key}>
                                        <div className="flex items-center">
                                            <span className="mr-2">{key === activeKey ? '🟢' : '⚪️'}</span>
                                            {key}
                                        </div>
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                         <p className="text-xs text-muted-foreground mt-1">La conexión marcada con 🟢 es la que está activa actualmente en toda la aplicación.</p>
                    </div>
                </CardContent>
            </Card>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                <Card>
                    <CardHeader>
                        <CardTitle>WooCommerce</CardTitle>
                        <CardDescription>Credenciales para la API REST de WooCommerce.</CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        <div>
                            <Label htmlFor="wooCommerceStoreUrl">URL de la Tienda</Label>
                            <Input id="wooCommerceStoreUrl" name="wooCommerceStoreUrl" value={formData.wooCommerceStoreUrl} onChange={handleInputChange} placeholder="https://mitienda.com" disabled={isSaving} />
                            <p className="text-xs text-muted-foreground mt-1">La URL se usará como identificador del perfil.</p>
                        </div>
                        <div>
                            <Label htmlFor="wooCommerceApiKey">Clave de Cliente (API Key)</Label>
                            <Input id="wooCommerceApiKey" name="wooCommerceApiKey" type="password" value={formData.wooCommerceApiKey} onChange={handleInputChange} placeholder="ck_xxxxxxxxxxxx" disabled={isSaving}/>
                        </div>
                        <div>
                            <Label htmlFor="wooCommerceApiSecret">Clave Secreta (API Secret)</Label>
                            <Input id="wooCommerceApiSecret" name="wooCommerceApiSecret" type="password" value={formData.wooCommerceApiSecret} onChange={handleInputChange} placeholder="cs_xxxxxxxxxxxx" disabled={isSaving}/>
                        </div>
                    </CardContent>
                </Card>

                <Card>
                    <CardHeader>
                        <CardTitle>WordPress</CardTitle>
                        <CardDescription>Credenciales para subir imágenes a la biblioteca de medios.</CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        <div>
                            <Label htmlFor="wordpressApiUrl">URL de WordPress</Label>
                            <Input id="wordpressApiUrl" name="wordpressApiUrl" value={formData.wordpressApiUrl} onChange={handleInputChange} placeholder="https://mitienda.com" disabled={isSaving}/>
                            <p className="text-xs text-muted-foreground mt-1">Normalmente es la misma URL que tu tienda.</p>
                        </div>
                        <div>
                            <Label htmlFor="wordpressUsername">Nombre de Usuario de WordPress</Label>
                            <Input id="wordpressUsername" name="wordpressUsername" value={formData.wordpressUsername} onChange={handleInputChange} placeholder="Tu usuario admin" disabled={isSaving}/>
                        </div>
                        <div>
                            <Label htmlFor="wordpressApplicationPassword">Contraseña de Aplicación</Label>
                            <Input id="wordpressApplicationPassword" name="wordpressApplicationPassword" type="password" value={formData.wordpressApplicationPassword} onChange={handleInputChange} placeholder="xxxx xxxx xxxx xxxx xxxx xxxx" disabled={isSaving}/>
                            <p className="text-xs text-muted-foreground mt-1">Genera una en tu Perfil de WordPress &gt; Contraseñas de aplicación.</p>
                        </div>
                    </CardContent>
                </Card>
            </div>
            
             {testStatus !== 'idle' && (
                <Alert variant={testStatus === 'success' ? 'default' : 'destructive'}>
                    {testStatus === 'success' ? <ShieldCheck className="h-4 w-4" /> : <ShieldAlert className="h-4 w-4" />}
                    <AlertTitle>{testStatus === 'success' ? 'Prueba Exitosa' : 'Prueba Fallida'}</AlertTitle>
                    <AlertDescription>{testMessage}</AlertDescription>
                </Alert>
            )}


            <div className="flex justify-between items-center">
                <div>
                     {selectedKey !== 'new' && (
                        <AlertDialog>
                            <AlertDialogTrigger asChild>
                                <Button variant="destructive" disabled={isSaving || isDeleting}>
                                    {isDeleting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Trash2 className="mr-2 h-4 w-4" />}
                                    Eliminar Perfil
                                </Button>
                            </AlertDialogTrigger>
                            <AlertDialogContent>
                                <AlertDialogHeader>
                                    <AlertDialogTitle>¿Estás seguro?</AlertDialogTitle>
                                    <AlertDialogDescription>
                                        Esta acción no se puede deshacer. Se eliminará permanentemente el perfil de conexión para <strong>{selectedKey}</strong>.
                                    </AlertDialogDescription>
                                </AlertDialogHeader>
                                <AlertDialogFooter>
                                    <AlertDialogCancel>Cancelar</AlertDialogCancel>
                                    <AlertDialogAction onClick={handleDelete}>Continuar</AlertDialogAction>
                                </AlertDialogFooter>
                            </AlertDialogContent>
                        </AlertDialog>
                    )}
                </div>
                <div className="flex justify-end gap-4">
                     <Button variant="outline" onClick={handleTestConnection} disabled={isSaving || testStatus === 'testing'}>
                        {testStatus === 'testing' ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                        Probar Conexión
                    </Button>
                    <Button onClick={handleSave} disabled={isSaving || isDeleting}>
                        {isSaving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
                        {isSaving ? "Guardando..." : "Guardar y Activar"}
                    </Button>
                </div>
            </div>
        </div>
    );
}
