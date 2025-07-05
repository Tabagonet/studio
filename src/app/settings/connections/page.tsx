
"use client";

import React, { useState, useEffect, useMemo } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { KeyRound, Save, Loader2, Trash2, PlusCircle, ShieldCheck, ShieldAlert } from "lucide-react";
import { auth, onAuthStateChanged } from '@/lib/firebase';
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
        if (!url) return null;
        if (!url.startsWith('http')) {
            url = `https://${url}`;
        }
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
    
    const [pageContext, setPageContext] = useState<{ role: string | null; companyName: string | null }>({ role: null, companyName: null });

    const { toast } = useToast();
    
    const fetchPageContext = async (token: string) => {
        try {
            const response = await fetch('/api/user/verify', {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            if (response.ok) {
                const data = await response.json();
                setPageContext({ role: data.role, companyName: data.companyName });
            }
        } catch (error) {
            console.error("Error fetching page context:", error);
        }
    };


    const fetchConnections = async () => {
        setIsLoading(true);
        const user = auth.currentUser;
        if (!user) {
            setIsLoading(false);
            return;
        }

        try {
            const token = await user.getIdToken();
            await fetchPageContext(token); // Fetch context first
            const response = await fetch('/api/user-settings/connections', {
                headers: { 'Authorization': `Bearer ${token}` }
            });

            if (response.ok) {
                const data = await response.json();
                setAllConnections(data.allConnections || {});
                setActiveKey(data.activeConnectionKey || null);
                
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
        const unsubscribe = onAuthStateChanged(auth, (user) => {
            if (user) {
                fetchConnections();
            } else {
                setIsLoading(false);
                setAllConnections({});
                setActiveKey(null);
                setSelectedKey('new');
                setFormData(INITIAL_STATE);
                setPageContext({ role: null, companyName: null });
            }
        });
        return () => unsubscribe();
    }, []);
    
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
        const urlsToValidate = [
            { name: 'WooCommerce', url: formData.wooCommerceStoreUrl },
            { name: 'WordPress', url: formData.wordpressApiUrl }
        ];

        for (const item of urlsToValidate) {
            if (item.url) { 
                try {
                    const fullUrl = item.url.includes('://') ? item.url : `https://${item.url}`;
                    const parsedUrl = new URL(fullUrl);
                    if (parsedUrl.protocol !== 'https:') {
                        toast({ title: "Protocolo no seguro", description: `La URL de ${item.name} debe usar HTTPS.`, variant: "destructive" });
                        return;
                    }
                } catch (e) {
                    toast({ title: "URL Inválida", description: `El formato de la URL para ${item.name} no es válido.`, variant: "destructive" });
                    return;
                }
            }
        }

        const wooHostname = getHostname(formData.wooCommerceStoreUrl);
        const wpHostname = getHostname(formData.wordpressApiUrl);
        
        const key = selectedKey !== 'new' ? selectedKey : (wooHostname || wpHostname);
    
        if (!key) {
            toast({ title: "Datos Incompletos", description: "Por favor, introduce una URL válida para WooCommerce o para WordPress.", variant: "destructive" });
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
            const response = await fetch('/api/user-settings/connections', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
                body: JSON.stringify({ key, connectionData: formData, setActive: true })
            });

            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.error || "Fallo al guardar la conexión.");
            }

            toast({ title: "Conexión Guardada", description: `Los datos para '${key}' han sido guardados y activados.`, });
            window.dispatchEvent(new Event('connections-updated'));
            await fetchConnections();
            setSelectedKey(key);
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
            window.dispatchEvent(new Event('connections-updated'));
            await fetchConnections();
        } catch (error: any) {
            toast({ title: "Error al Eliminar", description: error.message, variant: "destructive" });
        } finally {
            setIsDeleting(false);
        }
    };

    const handleTestConnection = async () => {
        setTestStatus('testing');
        await new Promise(resolve => setTimeout(resolve, 1500));
        if (formData.wooCommerceStoreUrl || formData.wordpressApiUrl) {
            setTestStatus('success');
            setTestMessage('¡La conexión con los servicios configurados parece correcta!');
        } else {
            setTestStatus('error');
            setTestMessage('Faltan datos para realizar la prueba. Asegúrate de rellenar las URLs de al menos un servicio.');
        }
    };

    const connectionKeys = useMemo(() => Object.keys(allConnections), [allConnections]);

    const getPageTitle = () => {
        if (pageContext.role === 'admin' && pageContext.companyName) {
            return `Gestionando Conexiones para ${pageContext.companyName}`;
        }
        if (pageContext.role === 'super_admin') {
            return 'Gestionando Conexiones Personales (Super Admin)';
        }
        return 'Gestión de Conexiones API';
    };

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
                            <CardTitle>{getPageTitle()}</CardTitle>
                            <CardDescription>Guarda y gestiona los perfiles para conectar tus sitios.</CardDescription>
                        </div>
                    </div>
                </CardHeader>
            </Card>

            <Card>
                <CardHeader><CardTitle>Selector de Perfil</CardTitle></CardHeader>
                <CardContent className="flex items-center gap-4">
                    <div className="flex-1">
                        <Label htmlFor="profile-selector">Selecciona un perfil para editar o añade uno nuevo</Label>
                        <Select value={selectedKey} onValueChange={setSelectedKey} disabled={isSaving}>
                            <SelectTrigger id="profile-selector"><SelectValue placeholder="Selecciona un perfil..." /></SelectTrigger>
                            <SelectContent>
                                <SelectItem value="new"><div className="flex items-center"><PlusCircle className="mr-2 h-4 w-4" /> Añadir Nueva Conexión</div></SelectItem>
                                {connectionKeys.map(key => (
                                    <SelectItem key={key} value={key}><div className="flex items-center"><span className="mr-2">{key === activeKey ? '🟢' : '⚪️'}</span>{key}</div></SelectItem>
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
                        <CardTitle>WooCommerce (Tienda)</CardTitle>
                        <CardDescription>Rellena esta sección para usar las funciones de tienda.</CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        <div>
                            <Label htmlFor="wooCommerceStoreUrl">URL de la Tienda</Label>
                            <Input id="wooCommerceStoreUrl" name="wooCommerceStoreUrl" value={formData.wooCommerceStoreUrl} onChange={handleInputChange} placeholder="https://mitienda.com" disabled={isSaving} />
                            <p className="text-xs text-muted-foreground mt-1">La URL de WooCommerce se usará como identificador del perfil si está presente.</p>
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
                        <CardTitle>WordPress (Blog y Medios)</CardTitle>
                        <CardDescription>Rellena esta sección para gestionar el blog o subir imágenes.</CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        <div>
                            <Label htmlFor="wordpressApiUrl">URL de WordPress</Label>
                            <Input id="wordpressApiUrl" name="wordpressApiUrl" value={formData.wordpressApiUrl} onChange={handleInputChange} placeholder="https://misitio.com" disabled={isSaving}/>
                            <p className="text-xs text-muted-foreground mt-1">Si la URL de WooCommerce está vacía, esta se usará como identificador.</p>
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

            <div className="flex flex-col-reverse gap-4 pt-6 mt-6 border-t md:flex-row md:justify-between md:items-center">
                <div>
                     {selectedKey !== 'new' && (
                        <AlertDialog>
                            <AlertDialogTrigger asChild>
                                <Button variant="destructive" disabled={isSaving || isDeleting} className="w-full md:w-auto">
                                    {isDeleting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Trash2 className="mr-2 h-4 w-4" />}
                                    Eliminar Perfil
                                </Button>
                            </AlertDialogTrigger>
                            <AlertDialogContent>
                                <AlertDialogHeader>
                                    <AlertDialogTitle>¿Estás seguro?</AlertDialogTitle>
                                    <AlertDialogDescription>Esta acción eliminará permanentemente el perfil de conexión para <strong>{selectedKey}</strong>.</AlertDialogDescription>
                                </AlertDialogHeader>
                                <AlertDialogFooter>
                                    <AlertDialogCancel>Cancelar</AlertDialogCancel>
                                    <AlertDialogAction onClick={handleDelete}>Continuar</AlertDialogAction>
                                </AlertDialogFooter>
                            </AlertDialogContent>
                        </AlertDialog>
                    )}
                </div>
                <div className="flex flex-col-reverse gap-4 md:flex-row">
                     <Button variant="outline" onClick={handleTestConnection} disabled={isSaving || testStatus === 'testing'} className="w-full md:w-auto">
                        {testStatus === 'testing' ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                        Probar Conexión
                    </Button>
                    <Button onClick={handleSave} disabled={isSaving || isDeleting} className="w-full md:w-auto">
                        {isSaving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
                        {isSaving ? "Guardando..." : "Guardar y Activar"}
                    </Button>
                </div>
            </div>
        </div>
    );
}
