
// src/app/(app)/settings/connections/page.tsx
"use client";

import React, { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { KeyRound, Save, Loader2, Trash2, PlusCircle, Users, Building, User, Store, PlugZap, AlertCircle, RefreshCw } from "lucide-react";
import { auth, onAuthStateChanged, type FirebaseUser } from '@/lib/firebase';
import { useToast } from '@/hooks/use-toast';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue, SelectSeparator, SelectLabel, SelectGroup } from '@/components/ui/select';
import type { Company, User as AppUser } from '@/lib/types';
import { cn } from '@/lib/utils';
import { Skeleton } from '@/components/ui/skeleton';
import { Alert, AlertTitle, AlertDescription } from '@/components/ui/alert';
import { ShopifyIcon } from '@/components/core/icons';
import { ShopifyPartnerCard } from '@/components/features/settings/connections/shopify-partner-card';
import type { PartnerAppConnectionData } from '@/lib/api-helpers';
import { ConnectionStatusIndicator } from '@/components/core/ConnectionStatusIndicator';


interface ConnectionData {
    wooCommerceStoreUrl?: string;
    wooCommerceApiKey?: string;
    wooCommerceApiSecret?: string;
    wordpressApiUrl?: string;
    wordpressUsername?: string;
    wordpressApplicationPassword?: string;
    shopifyStoreUrl?: string;
    shopifyApiPassword?: string;
}

type AllConnections = { [key: string]: ConnectionData | PartnerAppConnectionData };

interface SelectedEntityStatus {
    activeStoreUrl: string | null;
    wooCommerceConfigured: boolean;
    wordPressConfigured: boolean;
    shopifyConfigured: boolean;
    shopifyPartnerConfigured?: boolean;
    shopifyPartnerError?: string; 
    shopifyCustomAppConfigured?: boolean; 
    pluginActive: boolean;
    activePlatform: 'woocommerce' | 'shopify' | null;
    assignedPlatform: 'woocommerce' | 'shopify' | null;
}

const INITIAL_STATE: ConnectionData = {
    wooCommerceStoreUrl: '',
    wooCommerceApiKey: '',
    wooCommerceApiSecret: '',
    wordpressApiUrl: '',
    wordpressUsername: '',
    wordpressApplicationPassword: '',
    shopifyStoreUrl: '',
    shopifyApiPassword: '',
};

const INITIAL_PARTNER_APP_STATE: PartnerAppConnectionData = {
    partnerApiToken: undefined,
    organizationId: undefined,
    clientId: undefined,
    clientSecret: undefined,
    automationApiKey: undefined,
};

function getHostname(url: string | null | undefined): string | null {
    if (!url) return null;
    try {
        const fullUrl = url.startsWith('http') ? url : `https://${url}`;
        const parsedUrl = new URL(fullUrl);
        return parsedUrl.hostname.replace(/^www\./, '');
    } catch (e) {
        return url;
    }
}

export default function ConnectionsPage() {
    const { toast } = useToast();

    const [allConnections, setAllConnections] = useState<AllConnections>({});
    const [activeKey, setActiveKey] = useState<string | null>(null);
    const [selectedKey, setSelectedKey] = useState<string>('new');
    
    const [formData, setFormData] = useState<ConnectionData>(INITIAL_STATE);
    const [partnerFormData, setPartnerFormData] = useState<PartnerAppConnectionData>(INITIAL_PARTNER_APP_STATE);

    const [isLoading, setIsLoading] = useState(true);
    const [isSaving, setIsSaving] = useState(false);
    const [isSavingPartner, setIsSavingPartner] = useState(false);
    
    const [isDeleting, setIsDeleting] = useState(false);
    
    const [currentUser, setCurrentUser] = useState<{ uid: string | null; role: string | null; companyId: string | null; companyName: string | null; } | null>(null);
    const [allCompanies, setAllCompanies] = useState<Company[]>([]);
    const [unassignedUsers, setUnassignedUsers] = useState<AppUser[]>([]);
    const [isDataLoading, setIsDataLoading] = useState(true);
    
    const [editingTarget, setEditingTarget] = useState<{ type: 'user' | 'company'; id: string | null; name: string }>({ type: 'user', id: null, name: 'Mis Conexiones' });
    const [editingTargetPlatform, setEditingTargetPlatform] = useState<'woocommerce' | 'shopify' | null>(null);

    const [selectedEntityStatus, setSelectedEntityStatus] = useState<SelectedEntityStatus | null>(null);
    const [isCheckingStatus, setIsCheckingStatus] = useState(false);

    const fetchAllDataForTarget = useCallback(async (user: FirebaseUser, targetType: 'user' | 'company', targetId: string | null) => {
        setIsLoading(true);
        if (!targetId) {
            setAllConnections({});
            setActiveKey(null);
            setSelectedKey('new');
            setFormData(INITIAL_STATE);
            setPartnerFormData(INITIAL_PARTNER_APP_STATE);
            setIsLoading(false);
            return;
        }

        try {
            const token = await user.getIdToken();
            const url = new URL('/api/user-settings/connections', window.location.origin);
            if (targetType === 'company') {
                url.searchParams.append('companyId', targetId);
            } else { // 'user'
                url.searchParams.append('userId', targetId);
            }
            
            const response = await fetch(url.toString(), {
                headers: { 'Authorization': `Bearer ${token}` }
            });

            if (response.ok) {
                const data = await response.json();
                const connections = data.allConnections || {};
                setAllConnections(connections);
                if (connections.partner_app) {
                    setPartnerFormData(connections.partner_app);
                } else {
                    setPartnerFormData(INITIAL_PARTNER_APP_STATE);
                }
                const currentActiveKey = data.activeConnectionKey || null;
                setActiveKey(currentActiveKey);
                
                const connectionKeys = Object.keys(connections).filter(k => k !== 'partner_app');
                
                if (currentActiveKey && connections[currentActiveKey]) {
                    setSelectedKey(currentActiveKey);
                    setFormData(connections[currentActiveKey]);
                } else if (connectionKeys.length > 0) {
                    setSelectedKey(connectionKeys[0]);
                    setFormData(connections[connectionKeys[0]]);
                } else {
                    setSelectedKey('new');
                    setFormData(INITIAL_STATE);
                }
            } else {
                throw new Error((await response.json()).error || "Fallo al cargar las conexiones.");
            }
            await fetchStatus(targetType, targetId, token);
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : "Error desconocido.";
            toast({ title: "Error al Cargar Conexiones", description: errorMessage, variant: "destructive" });
        } finally {
            setIsLoading(false);
        }
    }, [toast]); // Removed fetchStatus and selectedKey from dependency array to break potential loops
    
    const fetchStatus = useCallback(async (targetType: 'user' | 'company' | null, targetId: string | null, token: string) => {
        if (!targetType || !targetId) {
            setSelectedEntityStatus(null);
            return;
        }
        setIsCheckingStatus(true);
        try {
            const url = new URL('/api/check-config', window.location.origin);
            if (targetType === 'company') {
                url.searchParams.append('companyId', targetId);
            } else { // 'user'
                url.searchParams.append('userId', targetId);
            }

            const response = await fetch(url.toString(), {
                headers: { 'Authorization': `Bearer ${token}` },
                cache: 'no-store'
            });
            
            const data = await response.json();
            if (response.ok) {
                setSelectedEntityStatus(data);
                if (data.shopifyPartnerConfigured === false && data.shopifyPartnerError) {
                    const errorMessage = `Shopify Partner API: ${data.shopifyPartnerError}`;
                    toast({
                        title: "Error de Conexión Shopify Partner",
                        description: errorMessage,
                        variant: "destructive",
                        duration: 10000,
                    });
                }
            } else {
                setSelectedEntityStatus(null);
            }
        } catch (error) {
            console.error("Failed to fetch connection status for selected entity", error);
            setSelectedEntityStatus(null);
        } finally {
            setIsCheckingStatus(false);
        }
    }, [toast]);

    const fetchInitialData = useCallback(async (user: FirebaseUser) => {
        setIsDataLoading(true);
        const token = await user.getIdToken();
        try {
            const response = await fetch('/api/user/verify', { headers: { 'Authorization': `Bearer ${token}` } });
            if (!response.ok) throw new Error("Failed to verify user.");
            
            const userData = await response.json();
            setCurrentUser(userData);

            let initialType: 'user' | 'company' = 'user';
            let initialId: string | null = user.uid;
            let initialName = 'Mis Conexiones';
            let initialPlatform: 'woocommerce' | 'shopify' | null = userData.platform || null;

            if (userData.role === 'super_admin') {
                 const [companiesResponse, usersResponse] = await Promise.all([
                    fetch('/api/admin/companies', { headers: { 'Authorization': `Bearer ${token}` } }),
                    fetch('/api/admin/users', { headers: { 'Authorization': `Bearer ${token}` } })
                ]);
                if (companiesResponse.ok) setAllCompanies((await companiesResponse.json()).companies);
                if (usersResponse.ok) {
                    const allUsers = (await usersResponse.json()).users;
                    setUnassignedUsers(allUsers.filter((u: any) => u.role !== 'super_admin' && !u.companyId));
                }
            }

            if (userData.companyId) {
                initialType = 'company';
                initialId = userData.companyId;
                initialName = userData.companyName || 'Empresa';
                initialPlatform = userData.companyPlatform || null;
            }
            
            setEditingTarget({ type: initialType, id: initialId, name: initialName });
            setEditingTargetPlatform(initialPlatform);
            if (initialId) {
                await fetchAllDataForTarget(user, initialType, initialId);
            }
        } catch (e) {
            console.error("Failed to initialize connections page:", e);
        } finally {
            setIsDataLoading(false);
        }
    }, [fetchAllDataForTarget]);

    useEffect(() => {
        const unsubscribe = onAuthStateChanged(auth, async (user) => {
            if (user) {
                await fetchInitialData(user);
            } else {
                setIsLoading(false);
                setIsDataLoading(false);
            }
        });
        
        return () => unsubscribe();
    }, [fetchInitialData]);

    const handleTargetChange = (value: string) => {
        const user = auth.currentUser;
        if (!user) return;
        
        const [type, id] = value.split(':');
        let newEditingTarget: { type: 'user' | 'company'; id: string | null; name: string, platform: 'woocommerce' | 'shopify' | null };

        if (type === 'user') {
            if (id === user.uid) { // Super Admin's personal settings
                 newEditingTarget = { type: 'user', id: user.uid, name: 'Mis Conexiones (Super Admin)', platform: null };
            } else {
                const selectedUser = unassignedUsers.find(u => u.uid === id);
                newEditingTarget = { type: 'user', id: id, name: selectedUser?.displayName || 'Usuario Desconocido', platform: selectedUser?.platform || null };
            }
        } else { // type === 'company'
            const company = allCompanies.find(c => c.id === id);
            newEditingTarget = { type: 'company', id: id, name: company?.name || 'Empresa Desconocida', platform: company?.platform || null };
        }
        
        setEditingTarget(newEditingTarget);
        setEditingTargetPlatform(newEditingTarget.platform);
        if(newEditingTarget.id) {
            fetchAllDataForTarget(user, newEditingTarget.type, newEditingTarget.id);
        }
    };


    useEffect(() => {
        const connectionKeys = Object.keys(allConnections).filter(k => k !== 'partner_app');
        if (selectedKey === 'new') {
            setFormData(INITIAL_STATE);
        } else if (allConnections[selectedKey]) {
            setFormData(allConnections[selectedKey] as ConnectionData);
        } else if (connectionKeys.length > 0) {
            setSelectedKey(connectionKeys[0]);
        } else {
            setSelectedKey('new');
            setFormData(INITIAL_STATE);
        }
    }, [selectedKey, allConnections]);
    
    const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const { name, value } = e.target;
        setFormData(prev => ({ ...prev, [name]: value }));
    };

    const handlePartnerFormDataChange = (data: PartnerAppConnectionData) => {
      setPartnerFormData(data);
    };
    
    const handleSave = async (isPartnerCreds: boolean = false) => {
        const setSaving = isPartnerCreds ? setIsSavingPartner : setIsSaving;
        setSaving(true);

        const user = auth.currentUser;
        if (!user || !editingTarget.id) {
            toast({ title: "Error de autenticación o de selección de entidad.", variant: "destructive" });
            setSaving(false); return;
        }

        try {
            const token = await user.getIdToken();
            let keyToSave: string;
            let dataToSave: any;
            
            const setActive = !isPartnerCreds;

            if (isPartnerCreds) {
                keyToSave = `partner_app`;
                dataToSave = partnerFormData;
            } else {
                 const wooHostname = getHostname(formData.wooCommerceStoreUrl);
                 const wpHostname = getHostname(formData.wordpressApiUrl);
                 const shopifyHostname = getHostname(formData.shopifyStoreUrl);
                
                 keyToSave = selectedKey !== 'new' ? selectedKey : (wooHostname || wpHostname || shopifyHostname || '');
                if (!keyToSave) {
                    toast({ title: "Datos Incompletos", description: "Por favor, introduce una URL válida para que sirva como identificador.", variant: "destructive" });
                    setSaving(false); return;
                }
                dataToSave = formData;
            }

            const payload: any = { 
                key: keyToSave, 
                connectionData: dataToSave, 
                setActive,
                entityId: editingTarget.id,
                entityType: editingTarget.type,
                isPartner: isPartnerCreds,
            };

            const response = await fetch('/api/user-settings/connections', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
                body: JSON.stringify(payload)
            });

            if (!response.ok) {
                throw new Error((await response.json()).error || "Fallo al guardar la conexión.");
            }
            
            toast({ title: "Credenciales Guardadas", description: `Los datos para '${keyToSave}' han sido guardados.` });
            
            // Re-fetch all data to ensure UI is in sync.
            await fetchAllDataForTarget(user, editingTarget.type, editingTarget.id);
            if (!isPartnerCreds) {
                setSelectedKey(keyToSave);
            }
            
        } catch (error: any) {
            toast({ title: "Error al Guardar", description: error.message, variant: "destructive" });
        } finally {
            setSaving(false);
            setIsSavingPartner(false);
        }
    };
    
    const handleDelete = async (keyToDelete: string) => {
        if (keyToDelete === 'new') return;
        setIsDeleting(true);
        const user = auth.currentUser;
        if (!user || !editingTarget.id) {
            toast({ title: "Error de autenticación", variant: "destructive" });
            setIsDeleting(false); return;
        }

        try {
            const token = await user.getIdToken();
            const payload: any = { 
                key: keyToDelete,
                entityId: editingTarget.id,
                entityType: editingTarget.type,
            };
            
            await fetch('/api/user-settings/connections', {
                method: 'DELETE',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
                body: JSON.stringify(payload)
            });
            
            toast({ title: "Conexión Eliminada", description: `El perfil para '${keyToDelete}' ha sido eliminado.` });
            
            // This now waits for the server to confirm before refetching data
            await fetchAllDataForTarget(user, editingTarget.type, editingTarget.id);
            
        } catch (error: any) {
            toast({ title: "Error al Eliminar", description: error.message, variant: "destructive" });
        } finally {
            setIsDeleting(false);
        }
    };
    
    const connectionKeys = Object.keys(allConnections).filter(k => k !== 'partner_app');
    const title = currentUser?.role === 'super_admin' ? `Editando Conexiones para: ${editingTarget.name}` : `Conexiones API para ${currentUser?.companyName || 'Mis Conexiones'}`;
    
    let description = 'Gestiona tus credenciales para conectar con servicios externos.';
    if (currentUser?.role === 'super_admin') {
      description = 'Como Super Admin, puedes gestionar tus conexiones o las de cualquier empresa o usuario.';
    } else if (editingTargetPlatform === 'woocommerce') {
      description = 'Gestiona las credenciales para conectar tu cuenta con tus sitios de WooCommerce y WordPress.';
    } else if (editingTargetPlatform === 'shopify') {
      description = 'Gestiona las credenciales para conectar tu cuenta con tus tiendas Shopify y tu cuenta de Partner.';
    }
    
    const saveButtonText = `Guardar y Activar para ${editingTarget.type === 'company' ? 'la Empresa' : 'el Usuario'}`;
    
    const showWooCommerce = currentUser?.role === 'super_admin' || editingTargetPlatform === 'woocommerce';
    const showShopify = currentUser?.role === 'super_admin' || editingTargetPlatform === 'shopify';

    if (isDataLoading) {
        return (
             <div className="container mx-auto py-8 space-y-6">
                <Skeleton className="h-28" />
                <Skeleton className="h-24" />
                <Skeleton className="h-96" />
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
                        <Select value={`${editingTarget.type}:${editingTarget.id}`} onValueChange={handleTargetChange}>
                            <SelectTrigger><SelectValue placeholder="Elige una entidad..." /></SelectTrigger>
                            <SelectContent>
                                <SelectGroup>
                                  <SelectLabel>Super Admin</SelectLabel>
                                  <SelectItem value={`user:${currentUser?.uid}`}><User className="inline-block mr-2 h-4 w-4" />Mis Conexiones (Super Admin)</SelectItem>
                                </SelectGroup>
                                
                                {allCompanies.length > 0 && <SelectSeparator />}
                                {allCompanies.length > 0 && (
                                    <SelectGroup>
                                        <SelectLabel>Empresas</SelectLabel>
                                        {allCompanies.map(company => (
                                            <SelectItem key={company.id} value={`company:${company.id}`}><Building className="inline-block mr-2 h-4 w-4" />{company.name}</SelectItem>
                                        ))}
                                    </SelectGroup>
                                )}

                                {unassignedUsers.length > 0 && <SelectSeparator />}
                                {unassignedUsers.length > 0 && (
                                    <SelectGroup>
                                        <SelectLabel>Usuarios sin Empresa</SelectLabel>
                                        {unassignedUsers.map(u => (
                                            <SelectItem key={u.uid} value={`user:${u.uid}`}><User className="inline-block mr-2 h-4 w-4" />{u.displayName}</SelectItem>
                                        ))}
                                    </SelectGroup>
                                )}
                            </SelectContent>
                        </Select>
                    </CardContent>
                </Card>
            )}

            <Card>
                <CardHeader>
                    <CardTitle>Perfiles de Conexión de Tiendas</CardTitle>
                    <CardDescription>
                        Gestiona las conexiones a tiendas específicas, ya sean de WooCommerce o Shopify. La conexión activa se usará por defecto en las herramientas.
                    </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                     <ConnectionStatusIndicator status={selectedEntityStatus} isLoading={isCheckingStatus} onRefresh={() => auth.currentUser && fetchAllDataForTarget(auth.currentUser, editingTarget.type, editingTarget.id)} />
                    <div className="flex-1">
                        <Label htmlFor="profile-selector">Selecciona un perfil para editar o añade uno nuevo</Label>
                        <Select value={selectedKey} onValueChange={setSelectedKey} disabled={isSaving || isLoading}>
                            <SelectTrigger id="profile-selector"><SelectValue placeholder="Selecciona un perfil..." /></SelectTrigger>
                            <SelectContent>
                                <SelectItem value="new"><PlusCircle className="inline-block mr-2 h-4 w-4" />Añadir Nueva Conexión</SelectItem>
                                {connectionKeys.map(key => {
                                    const connection = allConnections[key] as ConnectionData;
                                    const isShopify = !!connection.shopifyStoreUrl;
                                    const isWoo = !!connection.wooCommerceStoreUrl || !!connection.wordpressApiUrl;
                                    let Icon;
                                    if (isShopify) Icon = ShopifyIcon;
                                    else if (isWoo) Icon = Store;

                                    return (
                                        <SelectItem key={key} value={key}>
                                            <div className="flex items-center gap-2">
                                                {key === activeKey && <span className="mr-2 text-green-500">●</span>}
                                                {Icon && <Icon className="h-4 w-4 text-muted-foreground" />}
                                                {key}
                                            </div>
                                        </SelectItem>
                                    );
                                })}
                            </SelectContent>
                        </Select>
                         <p className="text-xs text-muted-foreground mt-1">La conexión activa para <span className="font-semibold">{editingTarget.name}</span> está marcada con un círculo verde.</p>
                    </div>
                </CardContent>
            </Card>

            {isLoading ? (
                <div className="flex justify-center items-center h-48"><Loader2 className="h-8 w-8 animate-spin" /></div>
            ) : (
                <div className="space-y-8">
                    {!showWooCommerce && !showShopify && currentUser?.role !== 'super_admin' && (
                        <Alert variant="destructive">
                            <AlertCircle className="h-4 w-4" />
                            <AlertTitle>Plataforma no asignada</AlertTitle>
                            <AlertDescription>
                                No tienes una plataforma (WooCommerce o Shopify) asignada. Un administrador debe asignarte una para poder configurar conexiones.
                            </AlertDescription>
                        </Alert>
                    )}

                    {showWooCommerce && (
                        <Card>
                            <CardHeader>
                                <CardTitle>Conexión a WordPress / WooCommerce</CardTitle>
                                <CardDescription>Credenciales para un sitio específico.</CardDescription>
                            </CardHeader>
                            <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                <div>
                                    <Label htmlFor="wooCommerceStoreUrl">URL de la Tienda WooCommerce</Label>
                                    <Input id="wooCommerceStoreUrl" name="wooCommerceStoreUrl" value={formData.wooCommerceStoreUrl || ''} onChange={handleInputChange} placeholder="https://mitienda.com" disabled={isSaving} />
                                </div>
                                <div>
                                    <Label htmlFor="wordpressApiUrl">URL de WordPress</Label>
                                    <Input id="wordpressApiUrl" name="wordpressApiUrl" value={formData.wordpressApiUrl || ''} onChange={handleInputChange} placeholder="https://misitio.com" disabled={isSaving}/>
                                </div>
                                <div>
                                    <Label htmlFor="wooCommerceApiKey">Clave de Cliente (API Key)</Label>
                                    <Input id="wooCommerceApiKey" name="wooCommerceApiKey" type="password" value={formData.wooCommerceApiKey || ''} onChange={handleInputChange} placeholder="ck_xxxxxxxxxxxx" disabled={isSaving}/>
                                </div>
                                <div>
                                    <Label htmlFor="wordpressUsername">Usuario de WordPress</Label>
                                    <Input id="wordpressUsername" name="wordpressUsername" value={formData.wordpressUsername || ''} onChange={handleInputChange} placeholder="Tu usuario admin" disabled={isSaving}/>
                                </div>
                                <div>
                                    <Label htmlFor="wooCommerceApiSecret">Clave Secreta (API Secret)</Label>
                                    <Input id="wooCommerceApiSecret" name="wooCommerceApiSecret" type="password" value={formData.wooCommerceApiSecret || ''} onChange={handleInputChange} placeholder="cs_xxxxxxxxxxxx" disabled={isSaving}/>
                                </div>
                                <div>
                                    <Label htmlFor="wordpressApplicationPassword">Contraseña de Aplicación</Label>
                                    <Input id="wordpressApplicationPassword" name="wordpressApplicationPassword" type="password" value={formData.wordpressApplicationPassword || ''} onChange={handleInputChange} placeholder="xxxx xxxx xxxx xxxx xxxx xxxx" disabled={isSaving}/>
                                </div>
                            </CardContent>
                        </Card>
                    )}

                    {showShopify && (
                        <Card>
                            <CardHeader>
                                <CardTitle>Conexión a Tienda Shopify Existente</CardTitle>
                                <CardDescription>Crea una App Personalizada (Custom App) en tu tienda Shopify para obtener estas credenciales.</CardDescription>
                            </CardHeader>
                            <CardContent className="space-y-4">
                                <div>
                                    <Label htmlFor="shopifyStoreUrl">URL de la Tienda (.myshopify.com)</Label>
                                    <Input id="shopifyStoreUrl" name="shopifyStoreUrl" value={formData.shopifyStoreUrl || ''} onChange={handleInputChange} placeholder="mitienda.myshopify.com" disabled={isSaving} />
                                </div>
                                <div>
                                    <Label htmlFor="shopifyApiPassword">Token de Acceso de Admin API</Label>
                                    <Input id="shopifyApiPassword" name="shopifyApiPassword" type="password" value={formData.shopifyApiPassword || ''} onChange={handleInputChange} placeholder="shpat_xxxxxxxxxxxx" disabled={isSaving}/>
                                </div>
                            </CardContent>
                        </Card>
                    )}
                    
                    <div className="flex flex-col-reverse gap-4 pt-6 mt-6 border-t md:flex-row md:justify-between md:items-center">
                        <div>
                            {selectedKey !== 'new' && (
                                <AlertDialog>
                                    <AlertDialogTrigger asChild><Button variant="destructive" disabled={isSaving || isDeleting} className="w-full md:w-auto"><Trash2 className="mr-2 h-4 w-4" />Eliminar Perfil</Button></AlertDialogTrigger>
                                    <AlertDialogContent>
                                        <AlertDialogHeader><AlertDialogTitle>¿Estás seguro?</AlertDialogTitle><AlertDialogDescription>Se eliminará permanentemente el perfil de conexión para <strong>{selectedKey}</strong>.</AlertDialogDescription></AlertDialogHeader>
                                        <AlertDialogFooter><AlertDialogCancel>Cancelar</AlertDialogCancel><AlertDialogAction onClick={() => handleDelete(selectedKey)} className="bg-destructive hover:bg-destructive/90">Continuar</AlertDialogAction></AlertDialogFooter>
                                    </AlertDialogContent>
                                </AlertDialog>
                            )}
                        </div>
                        <div className="flex flex-col-reverse gap-4 md:flex-row">
                            <Button onClick={() => handleSave(false)} disabled={isSaving || isDeleting} className="w-full md:w-auto">
                                {isSaving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="h-4 w-4 mr-2"/>}
                                {isSaving ? "Guardando..." : saveButtonText}
                            </Button>
                        </div>
                    </div>

                    {showShopify && (
                       <ShopifyPartnerCard 
                         editingTarget={editingTarget}
                         partnerFormData={partnerFormData}
                         onPartnerFormDataChange={handlePartnerFormDataChange}
                         onSave={() => handleSave(true)}
                         isSavingPartner={isSavingPartner}
                         onDelete={() => handleDelete('partner_app')}
                         isDeleting={isDeleting}
                         configStatus={selectedEntityStatus}
                         onRefreshStatus={() => auth.currentUser && fetchAllDataForTarget(auth.currentUser, editingTarget.type, editingTarget.id)}
                         isCheckingStatus={isCheckingStatus}
                       />
                    )}
                </div>
            )}
        </div>
    );
}
