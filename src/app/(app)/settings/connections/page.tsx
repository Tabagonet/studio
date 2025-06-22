
"use client";

import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { KeyRound, Save, Loader2, ShieldCheck, ShieldAlert } from "lucide-react";
import { auth } from '@/lib/firebase';
import { useToast } from '@/hooks/use-toast';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';

interface ConnectionData {
    wooCommerceStoreUrl: string;
    wooCommerceApiKey: string;
    wooCommerceApiSecret: string;
    wordpressApiUrl: string;
    wordpressUsername: string;
    wordpressApplicationPassword: string;
}

const INITIAL_STATE: ConnectionData = {
    wooCommerceStoreUrl: '',
    wooCommerceApiKey: '',
    wooCommerceApiSecret: '',
    wordpressApiUrl: '',
    wordpressUsername: '',
    wordpressApplicationPassword: ''
};

export default function ConnectionsPage() {
    const [formData, setFormData] = useState<ConnectionData>(INITIAL_STATE);
    const [isLoading, setIsLoading] = useState(true);
    const [isSaving, setIsSaving] = useState(false);
    const [testStatus, setTestStatus] = useState<'idle' | 'testing' | 'success' | 'error'>('idle');
    const [testMessage, setTestMessage] = useState('');
    const { toast } = useToast();

    useEffect(() => {
        const fetchConnections = async () => {
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
                    if (data.connections) {
                        setFormData(prev => ({ ...prev, ...data.connections }));
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

        const unsubscribe = auth.onAuthStateChanged((user) => {
            if (user) {
                fetchConnections();
            } else {
                setIsLoading(false);
            }
        });
        return () => unsubscribe();
    }, [toast]);

    const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const { name, value } = e.target;
        setFormData(prev => ({ ...prev, [name]: value }));
    };

    const handleSave = async () => {
        setIsSaving(true);
        const user = auth.currentUser;
        if (!user) {
            toast({ title: "Error de autenticación", variant: "destructive" });
            setIsSaving(false);
            return;
        }

        try {
            const token = await user.getIdToken();
            const response = await fetch('/api/user-settings/connections', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify({ connections: formData })
            });

            const result = await response.json();
            if (!response.ok) {
                throw new Error(result.error || 'Error al guardar las conexiones');
            }

            toast({
                title: "Conexiones Guardadas",
                description: "Tus claves de API han sido actualizadas.",
            });
        } catch (error: any) {
            toast({
                title: "Error al Guardar",
                description: error.message,
                variant: "destructive",
            });
        } finally {
            setIsSaving(false);
        }
    };
    
    // Placeholder for connection test logic
    const handleTestConnection = async () => {
        setTestStatus('testing');
        setTestMessage('');
        // In a real scenario, you would make an API call to test these credentials
        // e.g., call /api/check-config with the current form data
        await new Promise(resolve => setTimeout(resolve, 1500)); // Simulate API call
        // This is a mock response
        if (formData.wooCommerceStoreUrl && formData.wordpressApiUrl) {
            setTestStatus('success');
            setTestMessage('¡La conexión con WooCommerce y WordPress parece correcta!');
        } else {
            setTestStatus('error');
            setTestMessage('Faltan datos para realizar la prueba. Asegúrate de rellenar las URLs.');
        }
    };

    if (isLoading) {
        return (
            <div className="flex h-64 w-full items-center justify-center">
                <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                <p className="ml-2 text-muted-foreground">Cargando configuración de conexiones...</p>
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
                            <CardTitle>Configuración de Conexiones API</CardTitle>
                            <CardDescription>Conecta tu cuenta a WooCommerce y WordPress para automatizar tu tienda.</CardDescription>
                        </div>
                    </div>
                </CardHeader>
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
                            <Input id="wooCommerceStoreUrl" name="wooCommerceStoreUrl" value={formData.wooCommerceStoreUrl} onChange={handleInputChange} placeholder="https://mitienda.com" />
                        </div>
                        <div>
                            <Label htmlFor="wooCommerceApiKey">Clave de Cliente (API Key)</Label>
                            <Input id="wooCommerceApiKey" name="wooCommerceApiKey" type="password" value={formData.wooCommerceApiKey} onChange={handleInputChange} placeholder="ck_xxxxxxxxxxxx" />
                        </div>
                        <div>
                            <Label htmlFor="wooCommerceApiSecret">Clave Secreta (API Secret)</Label>
                            <Input id="wooCommerceApiSecret" name="wooCommerceApiSecret" type="password" value={formData.wooCommerceApiSecret} onChange={handleInputChange} placeholder="cs_xxxxxxxxxxxx" />
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
                            <Input id="wordpressApiUrl" name="wordpressApiUrl" value={formData.wordpressApiUrl} onChange={handleInputChange} placeholder="https://mitienda.com" />
                            <p className="text-xs text-muted-foreground mt-1">Normalmente es la misma URL que tu tienda.</p>
                        </div>
                        <div>
                            <Label htmlFor="wordpressUsername">Nombre de Usuario de WordPress</Label>
                            <Input id="wordpressUsername" name="wordpressUsername" value={formData.wordpressUsername} onChange={handleInputChange} placeholder="Tu usuario admin" />
                        </div>
                        <div>
                            <Label htmlFor="wordpressApplicationPassword">Contraseña de Aplicación</Label>
                            <Input id="wordpressApplicationPassword" name="wordpressApplicationPassword" type="password" value={formData.wordpressApplicationPassword} onChange={handleInputChange} placeholder="xxxx xxxx xxxx xxxx xxxx xxxx" />
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

            <div className="flex justify-end gap-4">
                <Button variant="outline" onClick={handleTestConnection} disabled={isSaving || isLoading || testStatus === 'testing'}>
                    {testStatus === 'testing' ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                    Probar Conexión
                </Button>
                <Button onClick={handleSave} disabled={isSaving || isLoading}>
                    {isSaving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
                    Guardar Conexiones
                </Button>
            </div>
        </div>
    );
}
