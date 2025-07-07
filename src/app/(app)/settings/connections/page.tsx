
"use client";

import React, { useState, useEffect, useCallback } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { KeyRound, Save, Loader2, Trash2, PlusCircle, ShieldCheck, ShieldAlert, Users, Building, ChevronsUpDown } from "lucide-react";
import { auth, onAuthStateChanged, type FirebaseUser } from '@/lib/firebase';
import { useToast } from '@/hooks/use-toast';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import type { Company } from '@/lib/types';


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
    
    const [currentUser, setCurrentUser] = useState<{ uid: string | null; role: string | null; companyId: string | null; companyName: string | null; } | null>(null);
    const [companies, setCompanies] = useState<Company[]>([]);
    const [isCompanyListLoading, setIsCompanyListLoading] = useState(false);
    
    // This state now holds the context of what is being edited
    const [editingTarget, setEditingTarget] = useState<{ type: 'user' | 'company'; id: string | null; name: string }>({ type: 'user', id: null, name: 'Mis Conexiones' });

    const { toast } = useToast();

    const fetchConnections = useCallback(async (user: FirebaseUser, targetType: 'user' | 'company', targetId: string | null) => {
        setIsLoading(true);
        try {
            const token = await user.getIdToken();
            const url = new URL('/api/user-settings/connections', window.location.origin);
            if (targetType === 'company' && targetId) {
                url.searchParams.append('companyId', targetId);
            }
            
            const response = await fetch(url.toString(), {
                headers: { 'Authorization': `Bearer ${token}` }
            });

            if (response.ok) {
                const data = await response.json();
                setAllConnections(data.allConnections || {});
                const currentActiveKey = data.activeConnectionKey || null;
                setActiveKey(currentActiveKey);
                
                if (currentActiveKey && data.allConnections[currentActiveKey]) {
                    setSelectedKey(currentActiveKey);
                    setFormData(data.allConnections[currentActiveKey]);
                } else {
                    setSelectedKey('new');
                    setFormData(INITIAL_STATE);
                }
            } else {
                throw new Error((await response.json()).error || "Fallo al cargar las conexiones.");
            }
        } catch (error) {
            console.error("Error fetching connections:", error);
            const errorMessage = error instanceof Error ? error.message : "Error desconocido.";
            toast({ title: "Error al Cargar Conexiones", description: errorMessage, variant: "destructive" });
        } finally {
            setIsLoading(false);
        }
    }, [toast]);
    
    useEffect(() => {
        const fetchInitialData = async (user: FirebaseUser) => {
            const token = await user.getIdToken();
            const response = await fetch('/api/user/verify', { headers: { 'Authorization': `Bearer ${token}` } });
            if (!response.ok) throw new Error("Failed to verify user.");
            const userData = await response.json();
            setCurrentUser(userData);

            let newEditingTarget = { ...editingTarget };

            if (userData.role === 'super_admin') {
                setIsCompanyListLoading(true);
                try {
                    const companiesResponse = await fetch('/api/admin/companies', { headers: { 'Authorization': `Bearer ${token}` } });
                    if (companiesResponse.ok) setCompanies((await companiesResponse.json()).companies);
                } finally {
                    setIsCompanyListLoading(false);
                }
                newEditingTarget = { type: 'user', id: user.uid, name: 'Mis Conexiones (Super Admin)' };
            } else if (userData.role === 'admin') {
                if (userData.companyId) {
                    newEditingTarget = { type: 'company', id: userData.companyId, name: userData.companyName || 'Mi Empresa' };
                } else {
                    newEditingTarget = { type: 'user', id: user.uid, name: 'Mis Conexiones' };
                }
            }
            setEditingTarget(newEditingTarget);
            await fetchConnections(user, newEditingTarget.type, newEditingTarget.id);
        };
        
        const unsubscribe = onAuthStateChanged(auth, async (user) => {
            if (user) {
                setIsLoading(true);
                await fetchInitialData(user);
            } else {
                setIsLoading(false);
            }
        });
        return () => unsubscribe();
    }, []); // Run only once on mount

    const handleTargetChange = (value: string) => {
        const user = auth.currentUser;
        if (!user) return;
        
        let newEditingTarget;
        if (value === 'user') {
            newEditingTarget = { type: 'user', id: user.uid, name: 'Mis Conexiones (Super Admin)' };
        } else {
            const company = companies.find(c => c.id === value);
            newEditingTarget = { type: 'company', id: value, name: company?.name || 'Empresa Desconocida' };
        }
        setEditingTarget(newEditingTarget);
        fetchConnections(user, newEditingTarget.type, newEditingTarget.id);
    };


    useEffect(() => {
        const connectionKeys = Object.keys(allConnections);
        if (selectedKey === 'new') {
            setFormData(INITIAL_STATE);
        } else if (allConnections[selectedKey]) {
            setFormData(allConnections[selectedKey]);
        } else if (connectionKeys.length > 0) {
            setSelectedKey(connectionKeys[0]);
        } else {
            setSelectedKey('new');
            setFormData(INITIAL_STATE);
        }
    }, [selectedKey, allConnections]);

    const handleSave = async () => {
        const urlsToValidate = [
            { name: 'WooCommerce', url: formData.wooCommerceStoreUrl },
            { name: 'WordPress', url: formData.wordpressApiUrl }
        ];

        for (const item of urlsToValidate) {
            if (item.url) {
                try {
                    const fullUrl = item.url.includes('://') ? item.url : `https://${item.url}`;
                    new URL(fullUrl);
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
            toast({ title: "Datos Incompletos", description: "Por favor, introduce una URL válida.", variant: "destructive" });
            return;
        }

        setIsSaving(true);
        const user = auth.currentUser;
        if (!user) {
            toast({ title: "Error de autenticación", variant: "destructive" });
            setIsSaving(false); return;
        }

        try {
            const token = await user.getIdToken();
            const payload: any = { key, connectionData: formData, setActive: true };
            if (editingTarget.type === 'company') {
                payload.companyId = editingTarget.id;
            }

            const response = await fetch('/api/user-settings/connections', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
                body: JSON.stringify(payload)
            });

            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.error || "Fallo al guardar la conexión.");
            }
            
            toast({ title: "Conexión Guardada", description: `Los datos para '${key}' han sido guardados y activados.` });
            window.dispatchEvent(new Event('connections-updated'));
            await fetchConnections(user, editingTarget.type, editingTarget.id);
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
            setIsDeleting(false); return;
        }

        try {
            const token = await user.getIdToken();
            const payload: any = { key: selectedKey };
             if (editingTarget.type === 'company') {
                payload.companyId = editingTarget.id;
            }
            
            await fetch('/api/user-settings/connections', {
                method: 'DELETE',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
                body: JSON.stringify(payload)
            });
            
            toast({ title: "Conexión Eliminada", description: `El perfil para '${selectedKey}' ha sido eliminado.` });
            window.dispatchEvent(new Event('connections-updated'));
            await fetchConnections(user, editingTarget.type, editingTarget.id);
        } catch (error: any) {
            toast({ title: "Error al Eliminar", description: error.message, variant: "destructive" });
        } finally {
            setIsDeleting(false);
        }
    };
    
    const connectionKeys = Object.keys(allConnections);
    const title = currentUser?.role === 'super_admin' ? `Editando Conexiones para: ${editingTarget.name}` : `Conexiones API para ${currentUser?.companyName || 'Mis Conexiones'}`;
    const description = currentUser?.role === 'super_admin' ? 'Como Super Admin, puedes gestionar tus conexiones o las de cualquier empresa.' : 'Gestiona las credenciales para conectar tu empresa con servicios externos como WooCommerce y WordPress.';
    
    if (isLoading) {
        return <div className="flex h-64 w-full items-center justify-center"><Loader2 className="h-8 w-8 animate-spin text-muted-foreground" /><p className="ml-2 text-muted-foreground">Cargando...</p></div>;
    }

    return (
        <div className="container mx-auto py-8 space-y-8">
            <Card>
                <CardHeader>
                    <div className="flex items-center space-x-3">
                        <KeyRound className="h-8 w-8 text-primary" />
                        <div>
                            <CardTitle>{title}</CardTitle>
                            <CardDescription>{description}</CardDescription>
                        </div>
                    </div>
                </CardHeader>
            </Card>

            {currentUser?.role === 'super_admin' && (
                <Card>
                    <CardHeader><CardTitle>Selector de Entidad</CardTitle></CardHeader>
                    <CardContent>
                        <Label>Selecciona qué configuración deseas editar</Label>
                        <Select
                            value={editingTarget.type === 'company' ? editingTarget.id || '' : 'user'}
                            onValueChange={handleTargetChange}
                            disabled={isSaving || isCompanyListLoading}
                        >
                            <SelectTrigger><SelectValue placeholder="Elige una entidad..." /></SelectTrigger>
                            <SelectContent>
                                <SelectItem value="user"><Users className="inline-block mr-2 h-4 w-4" />Mis Conexiones (Super Admin)</SelectItem>
                                {companies.map(company => (
                                    <SelectItem key={company.id} value={company.id}><Building className="inline-block mr-2 h-4 w-4" />{company.name}</SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </CardContent>
                </Card>
            )}

            <Card>
                <CardHeader><CardTitle>Selector de Perfil de Conexión</CardTitle></CardHeader>
                <CardContent className="flex items-center gap-4">
                    <div className="flex-1">
                        <Label htmlFor="profile-selector">Selecciona un perfil para editar o añade uno nuevo</Label>
                        <Select value={selectedKey} onValueChange={setSelectedKey} disabled={isSaving}>
                            <SelectTrigger id="profile-selector"><SelectValue placeholder="Selecciona un perfil..." /></SelectTrigger>
                            <SelectContent>
                                <SelectItem value="new"><PlusCircle className="inline-block mr-2 h-4 w-4" />Añadir Nueva Conexión</SelectItem>
                                {connectionKeys.map(key => (
                                    <SelectItem key={key} value={key}>
                                        <div className="flex items-center">
                                            {key === activeKey && <span className="mr-2 text-green-500">●</span>}
                                            {key}
                                        </div>
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                         <p className="text-xs text-muted-foreground mt-1">La conexión activa para <span className="font-semibold">{editingTarget.name}</span> está marcada con un círculo verde.</p>
                    </div>
                </CardContent>
            </Card>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                <Card>
                    <CardHeader><CardTitle>WooCommerce (Tienda)</CardTitle></CardHeader>
                    <CardContent className="space-y-4">
                        <div>
                            <Label htmlFor="wooCommerceStoreUrl">URL de la Tienda</Label>
                            <Input id="wooCommerceStoreUrl" name="wooCommerceStoreUrl" value={formData.wooCommerceStoreUrl} onChange={handleInputChange} placeholder="https://mitienda.com" disabled={isSaving} />
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
                    <CardHeader><CardTitle>WordPress (Blog y Medios)</CardTitle></CardHeader>
                    <CardContent className="space-y-4">
                        <div>
                            <Label htmlFor="wordpressApiUrl">URL de WordPress</Label>
                            <Input id="wordpressApiUrl" name="wordpressApiUrl" value={formData.wordpressApiUrl} onChange={handleInputChange} placeholder="https://misitio.com" disabled={isSaving}/>
                        </div>
                        <div>
                            <Label htmlFor="wordpressUsername">Nombre de Usuario de WordPress</Label>
                            <Input id="wordpressUsername" name="wordpressUsername" value={formData.wordpressUsername} onChange={handleInputChange} placeholder="Tu usuario admin" disabled={isSaving}/>
                        </div>
                        <div>
                            <Label htmlFor="wordpressApplicationPassword">Contraseña de Aplicación</Label>
                            <Input id="wordpressApplicationPassword" name="wordpressApplicationPassword" type="password" value={formData.wordpressApplicationPassword} onChange={handleInputChange} placeholder="xxxx xxxx xxxx xxxx xxxx xxxx" disabled={isSaving}/>
                        </div>
                    </CardContent>
                </Card>
            </div>
            
            <div className="flex flex-col-reverse gap-4 pt-6 mt-6 border-t md:flex-row md:justify-between md:items-center">
                <div>
                     {selectedKey !== 'new' && (
                        <AlertDialog>
                            <AlertDialogTrigger asChild><Button variant="destructive" disabled={isSaving || isDeleting} className="w-full md:w-auto"><Trash2 className="mr-2 h-4 w-4" />Eliminar Perfil</Button></AlertDialogTrigger>
                            <AlertDialogContent>
                                <AlertDialogHeader><AlertDialogTitle>¿Estás seguro?</AlertDialogTitle><AlertDialogDescription>Se eliminará permanentemente el perfil de conexión para <strong>{selectedKey}</strong>.</AlertDialogDescription></AlertDialogHeader>
                                <AlertDialogFooter><AlertDialogCancel>Cancelar</AlertDialogCancel><AlertDialogAction onClick={handleDelete} className="bg-destructive hover:bg-destructive/90">Continuar</AlertDialogAction></AlertDialogFooter>
                            </AlertDialogContent>
                        </AlertDialog>
                    )}
                </div>
                <div className="flex flex-col-reverse gap-4 md:flex-row">
                    <Button onClick={handleSave} disabled={isSaving || isDeleting} className="w-full md:w-auto">
                        {isSaving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
                        {isSaving ? "Guardando..." : `Guardar y Activar para ${editingTarget.type === 'company' ? 'la Empresa' : 'mí'}`}
                    </Button>
                </div>
            </div>
        </div>
    );
}
