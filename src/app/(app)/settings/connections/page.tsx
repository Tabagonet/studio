
"use client";

import React, { useState, useEffect, useCallback } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { KeyRound, Save, Loader2, Trash2, PlusCircle, Users, Building, User, Globe, Store, PlugZap } from "lucide-react";
import { auth, onAuthStateChanged, type FirebaseUser } from '@/lib/firebase';
import { useToast } from '@/hooks/use-toast';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue, SelectSeparator, SelectLabel, SelectGroup } from '@/components/ui/select';
import type { Company } from '@/lib/types';
import { cn } from '@/lib/utils';
import { Tooltip, TooltipProvider, TooltipTrigger, TooltipContent } from '@/components/ui/tooltip';


interface ConnectionData {
    wooCommerceStoreUrl: string;
    wooCommerceApiKey: string;
    wooCommerceApiSecret: string;
    wordpressApiUrl: string;
    wordpressUsername: string;
    wordpressApplicationPassword: string;
}

type AllConnections = { [key: string]: ConnectionData };

interface BasicUser {
    uid: string;
    displayName: string;
}

interface SelectedEntityStatus {
    wooCommerceConfigured: boolean;
    wordPressConfigured: boolean;
    pluginActive: boolean;
    activeStoreUrl: string | null;
}

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


const ConnectionStatusIndicator = ({ status, isLoading }: { status: SelectedEntityStatus | null, isLoading: boolean }) => {
  if (isLoading) {
    return (
        <div className="flex items-center gap-2 text-sm text-muted-foreground border p-3 rounded-md bg-muted/50">
            <Loader2 className="h-4 w-4 animate-spin" /> Verificando conexión...
        </div>
    );
  }

  if (!status || !status.activeStoreUrl) {
    return (
      <div className="flex items-center gap-2 text-sm text-destructive border border-destructive/20 p-3 rounded-md bg-destructive/10">
        <Globe className="h-4 w-4" />
        <span>No hay ninguna conexión activa para esta entidad.</span>
      </div>
    );
  }
  
  const hostname = getHostname(status.activeStoreUrl);

  return (
    <TooltipProvider delayDuration={100}>
        <div className="flex items-center justify-between gap-3 text-sm border p-3 rounded-md">
            <span className="text-muted-foreground truncate" title={hostname || ''}>Conectado a: <strong className="text-foreground">{hostname}</strong></span>
            <div className="flex items-center gap-2 flex-shrink-0">
                <Tooltip>
                    <TooltipTrigger>
                        <Store className={cn("h-4 w-4", status.wooCommerceConfigured ? "text-green-500" : "text-destructive")} />
                    </TooltipTrigger>
                    <TooltipContent>
                        <p>WooCommerce: {status.wooCommerceConfigured ? "Configurado" : "No Configurado"}</p>
                    </TooltipContent>
                </Tooltip>
                <Tooltip>
                    <TooltipTrigger>
                       <Globe className={cn("h-4 w-4", status.wordPressConfigured ? "text-green-500" : "text-destructive")} />
                    </TooltipTrigger>
                    <TooltipContent>
                        <p>WordPress: {status.wordPressConfigured ? "Configurado" : "No Configurado"}</p>
                    </TooltipContent>
                </Tooltip>
                <Tooltip>
                    <TooltipTrigger>
                        <PlugZap className={cn("h-4 w-4", status.pluginActive ? "text-green-500" : "text-destructive")} />
                    </TooltipTrigger>
                    <TooltipContent>
                        <p>Plugin AutoPress AI: {status.pluginActive ? "Activo" : "No Detectado"}</p>
                    </TooltipContent>
                </Tooltip>
            </div>
        </div>
    </TooltipProvider>
  );
};


export default function ConnectionsPage() {
    const [allConnections, setAllConnections] = useState<AllConnections>({});
    const [activeKey, setActiveKey] = useState<string | null>(null);
    const [selectedKey, setSelectedKey] = useState<string>('new');
    
    const [formData, setFormData] = useState<ConnectionData>(INITIAL_STATE);
    const [isLoading, setIsLoading] = useState(true);
    const [isSaving, setIsSaving] = useState(false);
    const [isDeleting, setIsDeleting] = useState(false);
    
    const [currentUser, setCurrentUser] = useState<{ uid: string | null; role: string | null; companyId: string | null; companyName: string | null; } | null>(null);
    const [allCompanies, setAllCompanies] = useState<Company[]>([]);
    const [unassignedUsers, setUnassignedUsers] = useState<BasicUser[]>([]);
    const [isDataLoading, setIsDataLoading] = useState(false);
    
    const [editingTarget, setEditingTarget] = useState<{ type: 'user' | 'company'; id: string | null; name: string }>({ type: 'user', id: null, name: 'Mis Conexiones' });

    const [selectedEntityStatus, setSelectedEntityStatus] = useState<SelectedEntityStatus | null>(null);
    const [isCheckingStatus, setIsCheckingStatus] = useState(false);
    const [refreshKey, setRefreshKey] = useState(0);

    const { toast } = useToast();

    const fetchConnections = useCallback(async (user: FirebaseUser, targetType: 'user' | 'company', targetId: string | null) => {
        setIsLoading(true);
        if (!targetId) {
            setAllConnections({});
            setActiveKey(null);
            setSelectedKey('new');
            setFormData(INITIAL_STATE);
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
            setIsDataLoading(true);
            const token = await user.getIdToken();
            const response = await fetch('/api/user/verify', { headers: { 'Authorization': `Bearer ${token}` } });
            if (!response.ok) throw new Error("Failed to verify user.");
            const userData = await response.json();
            setCurrentUser(userData);

            let newEditingTarget: { type: 'user' | 'company'; id: string | null; name: string; } | undefined;

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
                newEditingTarget = { type: 'user', id: user.uid, name: 'Mis Conexiones (Super Admin)' };
            } else if (userData.role === 'admin') {
                if (userData.companyId) {
                    newEditingTarget = { type: 'company', id: userData.companyId, name: userData.companyName || 'Mi Empresa' };
                } else {
                    newEditingTarget = { type: 'user', id: user.uid, name: 'Mis Conexiones' };
                }
            }
            
            if (newEditingTarget) {
                 setEditingTarget(newEditingTarget);
                 await fetchConnections(user, newEditingTarget.type as 'user' | 'company', newEditingTarget.id);
            }
             setIsDataLoading(false);
        };
        
        const unsubscribe = onAuthStateChanged(auth, async (user) => {
            if (user) {
                await fetchInitialData(user);
            } else {
                setIsLoading(false);
                setIsDataLoading(false);
            }
        });
        return () => unsubscribe();
    }, [fetchConnections]);

     useEffect(() => {
        if (!editingTarget.id) {
            setSelectedEntityStatus(null);
            return;
        }

        const fetchStatus = async () => {
            setIsCheckingStatus(true);
            const user = auth.currentUser;
            if (!user) {
                setIsCheckingStatus(false);
                return;
            }

            try {
                const token = await user.getIdToken();
                const url = new URL('/api/check-config', window.location.origin);
                if (editingTarget.type === 'company') {
                    url.searchParams.append('companyId', editingTarget.id);
                } else { // 'user'
                    url.searchParams.append('userId', editingTarget.id);
                }

                const response = await fetch(url.toString(), {
                    headers: { 'Authorization': `Bearer ${token}` }
                });
                
                if (response.ok) {
                    const data = await response.json();
                    setSelectedEntityStatus(data);
                } else {
                    setSelectedEntityStatus(null);
                }
            } catch (error) {
                console.error("Failed to fetch connection status for selected entity", error);
                setSelectedEntityStatus(null);
            } finally {
                setIsCheckingStatus(false);
            }
        };

        fetchStatus();
    }, [editingTarget, refreshKey]);

    const handleTargetChange = (value: string) => {
        const user = auth.currentUser;
        if (!user) return;
        
        const [type, id] = value.split(':');
        let newEditingTarget: { type: 'user' | 'company'; id: string | null; name: string };

        if (type === 'user') {
            if (id === 'self') {
                 newEditingTarget = { type: 'user', id: user.uid, name: 'Mis Conexiones (Super Admin)' };
            } else {
                const selectedUser = unassignedUsers.find(u => u.uid === id);
                newEditingTarget = { type: 'user', id: id, name: selectedUser?.displayName || 'Usuario Desconocido' };
            }
        } else { // type === 'company'
            const company = allCompanies.find(c => c.id === id);
            newEditingTarget = { type: 'company', id: id, name: company?.name || 'Empresa Desconocida' };
        }
        setEditingTarget(newEditingTarget);
        fetchConnections(user, newEditingTarget.type as 'user' | 'company', newEditingTarget.id);
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
            } else { // type is 'user'
                payload.userId = editingTarget.id;
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
            setRefreshKey(k => k + 1);
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
            } else { // type is 'user'
                payload.userId = editingTarget.id;
            }
            
            await fetch('/api/user-settings/connections', {
                method: 'DELETE',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
                body: JSON.stringify(payload)
            });
            
            toast({ title: "Conexión Eliminada", description: `El perfil para '${selectedKey}' ha sido eliminado.` });
            window.dispatchEvent(new Event('connections-updated'));
            await fetchConnections(user, editingTarget.type, editingTarget.id);
            setRefreshKey(k => k + 1);
        } catch (error: any) {
            toast({ title: "Error al Eliminar", description: error.message, variant: "destructive" });
        } finally {
            setIsDeleting(false);
        }
    };
    
    const connectionKeys = Object.keys(allConnections);
    const title = currentUser?.role === 'super_admin' ? `Editando Conexiones para: ${editingTarget.name}` : `Conexiones API para ${currentUser?.companyName || 'Mis Conexiones'}`;
    const description = currentUser?.role === 'super_admin' ? 'Como Super Admin, puedes gestionar tus conexiones o las de cualquier empresa o usuario.' : 'Gestiona las credenciales para conectar tu empresa con servicios externos como WooCommerce y WordPress.';
    
    if (isDataLoading) {
        return <div className="flex h-64 w-full items-center justify-center"><Loader2 className="h-8 w-8 animate-spin text-muted-foreground" /><p className="ml-2 text-muted-foreground">Cargando datos de usuario...</p></div>;
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
                            value={`${editingTarget.type}:${editingTarget.id === currentUser.uid ? 'self' : editingTarget.id}`}
                            onValueChange={handleTargetChange}
                            disabled={isSaving || isDataLoading}
                        >
                            <SelectTrigger><SelectValue placeholder="Elige una entidad..." /></SelectTrigger>
                            <SelectContent>
                                <SelectGroup>
                                  <SelectLabel>Super Admin</SelectLabel>
                                  <SelectItem value="user:self"><Users className="inline-block mr-2 h-4 w-4" />Mis Conexiones (Super Admin)</SelectItem>
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
                <CardHeader><CardTitle>Selector de Perfil de Conexión</CardTitle></CardHeader>
                <CardContent className="space-y-4">
                     <ConnectionStatusIndicator status={selectedEntityStatus} isLoading={isCheckingStatus} />
                    <div className="flex-1">
                        <Label htmlFor="profile-selector">Selecciona un perfil para editar o añade uno nuevo</Label>
                        <Select value={selectedKey} onValueChange={setSelectedKey} disabled={isSaving || isLoading}>
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

            {isLoading ? (
                <div className="flex justify-center items-center h-48"><Loader2 className="h-8 w-8 animate-spin" /></div>
            ) : (
                <>
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
                                {isSaving ? "Guardando..." : `Guardar y Activar para ${editingTarget.type === 'company' ? 'la Empresa' : 'el Usuario'}`}
                            </Button>
                        </div>
                    </div>
                </>
            )}
        </div>
    );
}
