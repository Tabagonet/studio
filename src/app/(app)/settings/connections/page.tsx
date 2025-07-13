
// src/app/(app)/settings/connections/page.tsx
"use client";

import React, { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { KeyRound, Save, Loader2, Trash2, PlusCircle, Users, Building, User, Globe, Store, PlugZap, AlertCircle, RefreshCw, CheckCircle, Copy, ExternalLink } from "lucide-react";
import { auth, onAuthStateChanged, type FirebaseUser } from '@/lib/firebase';
import { useToast } from '@/hooks/use-toast';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue, SelectSeparator, SelectLabel, SelectGroup } from '@/components/ui/select';
import type { Company, User as AppUser } from '@/lib/types';
import { cn } from '@/lib/utils';
import { Tooltip, TooltipProvider, TooltipTrigger, TooltipContent } from '@/components/ui/tooltip';
import { Skeleton } from '@/components/ui/skeleton';
import { Alert, AlertTitle, AlertDescription } from '@/components/ui/alert';
import { ShopifyIcon } from '@/components/core/icons';


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

type PartnerAppConnectionData = {
  clientId: string;
  clientSecret: string;
};

type AllConnections = { [key: string]: ConnectionData };
type AllPartnerConnections = { [key: string]: PartnerAppConnectionData };

interface SelectedEntityStatus {
    wooCommerceConfigured: boolean;
    wordPressConfigured: boolean;
    shopifyConfigured: boolean;
    pluginActive: boolean;
    activeStoreUrl: string | null;
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
    clientId: '',
    clientSecret: '',
};


function getHostname(url: string | null): string | null {
    if (!url) return null;
    try {
        const fullUrl = url.startsWith('http') ? url : `https://${url}`;
        const parsedUrl = new URL(fullUrl);
        return parsedUrl.hostname.replace(/^www\./, '');
    } catch (e) {
        return url; // Fallback to the original string if URL parsing fails
    }
}

const ConnectionStatusIndicator = ({ status, isLoading, onRefresh }: { status: SelectedEntityStatus | null, isLoading: boolean, onRefresh: () => void }) => {
  if (isLoading) {
    return (
        <div className="flex items-center gap-2 text-sm text-muted-foreground border p-3 rounded-md bg-muted/50">
            <Loader2 className="h-4 w-4 animate-spin" /> Verificando conexión...
        </div>
    );
  }

  if (!status || !status.activeStoreUrl) {
    return (
      <div className="flex items-center gap-2">
         <Link href="/settings/connections" className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors" title="Configurar conexión">
            <Globe className="h-4 w-4 text-destructive" />
            <span className="hidden md:inline">No conectado</span>
        </Link>
        <TooltipProvider><Tooltip><TooltipTrigger asChild>
            <Button variant="ghost" size="icon-sm" onClick={onRefresh} disabled={isLoading}><RefreshCw className={cn("h-4 w-4 text-muted-foreground", isLoading && "animate-spin")} /></Button>
        </TooltipTrigger><TooltipContent><p>Refrescar Estado</p></TooltipContent></Tooltip></TooltipProvider>
      </div>
    );
  }
  
  const hostname = getHostname(status.activeStoreUrl);
  const isSuperAdminScope = !status.assignedPlatform;
  const showWooCommerce = status.assignedPlatform === 'woocommerce' || (isSuperAdminScope && status.activePlatform === 'woocommerce');
  const showShopify = status.assignedPlatform === 'shopify' || (isSuperAdminScope && status.activePlatform === 'shopify');

  const wpActive = status.wordPressConfigured;
  const wooActive = status.wooCommerceConfigured;
  const isPluginVerifiedAndActive = wpActive && status.pluginActive;

  if (showWooCommerce && !isPluginVerifiedAndActive) {
      return (
        <div className="flex items-center gap-2">
            <Link href="/settings/connections" className="flex items-center gap-2 text-sm text-destructive hover:text-destructive/80 transition-colors" title="La conexión con WordPress no está verificada. Haz clic para ir a Ajustes.">
                <AlertCircle className="h-4 w-4" />
                <span className="hidden md:inline">Conexión no verificada</span>
            </Link>
            <TooltipProvider><Tooltip><TooltipTrigger asChild>
                <Button variant="ghost" size="icon-sm" onClick={onRefresh} disabled={isLoading}><RefreshCw className={cn("h-4 w-4 text-muted-foreground", isLoading && "animate-spin")} /></Button>
            </TooltipTrigger><TooltipContent><p>Refrescar Estado</p></TooltipContent></Tooltip></TooltipProvider>
        </div>
      )
  }

  return (
    <div className="flex items-center gap-2">
        <TooltipProvider delayDuration={100}>
            <Link href="/settings/connections" className="flex items-center gap-3 text-sm text-muted-foreground hover:text-foreground transition-colors" title="Gestionar conexiones">
                <span className="hidden md:inline font-medium">{hostname}</span>
                
                <div className="flex items-center gap-2 flex-shrink-0">
                    {showWooCommerce && (
                        <div className="flex items-center gap-2">
                            <Tooltip>
                                <TooltipTrigger>
                                <Store className={cn("h-4 w-4", wooActive ? "text-green-500" : "text-muted-foreground")} />
                                </TooltipTrigger>
                                <TooltipContent>
                                    <p>WooCommerce: {wooActive ? "Configurado" : "No Configurado"}</p>
                                </TooltipContent>
                            </Tooltip>
                            <Tooltip>
                                <TooltipTrigger>
                                <Globe className={cn("h-4 w-4", wpActive ? "text-green-500" : "text-destructive")} />
                                </TooltipTrigger>
                                <TooltipContent>
                                    <p>WordPress: {wpActive ? "Configurado" : "No Configurado"}</p>
                                </TooltipContent>
                            </Tooltip>
                            <Tooltip>
                                <TooltipTrigger>
                                <PlugZap className={cn("h-4 w-4", isPluginVerifiedAndActive ? "text-green-500" : "text-destructive")} />
                                </TooltipTrigger>
                                <TooltipContent>
                                    <p>Plugin AutoPress AI: {isPluginVerifiedAndActive ? "Activo y Verificado" : "No Detectado o No Verificado"}</p>
                                </TooltipContent>
                            </Tooltip>
                        </div>
                    )}
                    {showShopify && (
                        <div className="flex items-center gap-2">
                            <Tooltip>
                                <TooltipTrigger>
                                <ShopifyIcon className={cn("h-4 w-4", status.shopifyConfigured ? "text-green-500" : "text-destructive")} />
                                </TooltipTrigger>
                                <TooltipContent>
                                    <p>Shopify: {status.shopifyConfigured ? "Configurado" : "No Configurado"}</p>
                                </TooltipContent>
                            </Tooltip>
                        </div>
                    )}
                </div>
            </Link>
        </TooltipProvider>
         <TooltipProvider><Tooltip><TooltipTrigger asChild>
            <Button variant="ghost" size="icon-sm" onClick={onRefresh} disabled={isLoading}><RefreshCw className={cn("h-4 w-4 text-muted-foreground", isLoading && "animate-spin")} /></Button>
        </TooltipTrigger><TooltipContent><p>Refrescar Estado</p></TooltipContent></Tooltip></TooltipProvider>
    </div>
  );
};

const ShopifyPartnerCard = ({ 
  editingTarget, 
  partnerFormData, 
  onPartnerFormDataChange, 
  onSaveAndConnect, 
  isSavingPartner,
  onDelete,
  isDeleting,
}: { 
  editingTarget: { type: 'user' | 'company'; id: string | null; name: string };
  partnerFormData: PartnerAppConnectionData;
  onPartnerFormDataChange: (data: PartnerAppConnectionData) => void;
  onSaveAndConnect: () => void;
  isSavingPartner: boolean;
  onDelete: () => void;
  isDeleting: boolean;
}) => {
    
    const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
      const { name, value } = e.target;
      onPartnerFormDataChange({ ...partnerFormData, [name]: value });
    };
    
    const REDIRECT_URI = `${process.env.NEXT_PUBLIC_BASE_URL}/api/shopify/auth/callback`;

    const handleCopy = (text: string) => {
        navigator.clipboard.writeText(text);
        toast({ title: 'Copiado al portapapeles' });
    };

    return (
        <Card className="mt-8 border-primary/50">
            <CardHeader>
                <CardTitle>Conexión Global de Shopify Partners</CardTitle>
                <CardDescription>
                    Introduce tus credenciales de aplicación de Partner para la creación automatizada de tiendas para <strong>{editingTarget.name}</strong>.
                </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
                 <Alert>
                    <AlertCircle className="h-4 w-4" />
                    <AlertTitle>¿Cómo obtener las credenciales?</AlertTitle>
                    <AlertDescription>
                        Sigue nuestra <Link href="/docs/SHOPIFY_PARTNER_APP_SETUP.md" target="_blank" className="font-semibold underline">guía paso a paso</Link> para crear una aplicación personalizada en tu panel de Shopify Partner y obtener las credenciales.
                    </AlertDescription>
                </Alert>

                 <Alert variant="default" className="bg-muted">
                    <AlertTitle>URLs Requeridas para la Configuración</AlertTitle>
                    <AlertDescription className="space-y-3 mt-2">
                        <p>Cuando configures tu aplicación en el panel de Shopify Partner, se te pedirán estas URLs:</p>
                        <div className="space-y-1">
                            <Label className="text-xs text-muted-foreground">URL de la aplicación</Label>
                            <div className="flex items-center gap-2">
                                <Input readOnly value={process.env.NEXT_PUBLIC_BASE_URL} className="text-xs h-8 bg-background"/>
                                <Button variant="outline" size="icon-sm" onClick={() => handleCopy(process.env.NEXT_PUBLIC_BASE_URL || '')}><Copy className="h-3 w-3"/></Button>
                            </div>
                        </div>
                        <div className="space-y-1">
                            <Label className="text-xs text-muted-foreground">URL de Redirección Autorizada</Label>
                             <div className="flex items-center gap-2">
                                <Input readOnly value={REDIRECT_URI} className="text-xs h-8 bg-background"/>
                                <Button variant="outline" size="icon-sm" onClick={() => handleCopy(REDIRECT_URI)}><Copy className="h-3 w-3"/></Button>
                            </div>
                        </div>
                    </AlertDescription>
                </Alert>


                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                        <Label htmlFor="clientId">Client ID</Label>
                        <Input id="clientId" name="clientId" value={partnerFormData.clientId || ''} onChange={handleInputChange} placeholder="Tu Client ID de la app de Partner" disabled={isSavingPartner} />
                    </div>
                    <div>
                        <Label htmlFor="clientSecret">Client Secret</Label>
                        <Input id="clientSecret" name="clientSecret" type="password" value={partnerFormData.clientSecret || ''} onChange={handleInputChange} placeholder="••••••••••••••••••••••••••••••••••••" disabled={isSavingPartner} />
                    </div>
                </div>
                <div className="flex flex-col sm:flex-row items-center justify-between gap-4 pt-4 border-t">
                    <div className="flex items-center gap-2 flex-wrap">
                        <Button onClick={onSaveAndConnect} disabled={isSavingPartner}>
                            {isSavingPartner && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                            Guardar y Conectar con Shopify
                        </Button>
                         <AlertDialog>
                            <AlertDialogTrigger asChild>
                                <Button variant="destructive" disabled={isSavingPartner || isDeleting}>
                                    <Trash2 className="mr-2 h-4 w-4" /> Borrar
                                </Button>
                            </AlertDialogTrigger>
                            <AlertDialogContent>
                                <AlertDialogHeader>
                                    <AlertDialogTitle>¿Confirmar eliminación?</AlertDialogTitle>
                                    <AlertDialogDescription>
                                    Esta acción eliminará permanentemente las credenciales de Shopify Partner.
                                    </AlertDialogDescription>
                                </AlertDialogHeader>
                                <AlertDialogFooter>
                                    <AlertDialogCancel>Cancelar</AlertDialogCancel>
                                    <AlertDialogAction onClick={onDelete} className="bg-destructive hover:bg-destructive/90">
                                    Sí, eliminar
                                    </AlertDialogAction>
                                </AlertDialogFooter>
                            </AlertDialogContent>
                        </AlertDialog>
                    </div>
                </div>
            </CardContent>
        </Card>
    );
};



export default function ConnectionsPage() {
    const searchParams = useSearchParams();
    const { toast } = useToast();

    const [allConnections, setAllConnections] = useState<AllConnections>({});
    const [allPartnerConnections, setAllPartnerConnections] = useState<AllPartnerConnections>({});
    const [activeKey, setActiveKey] = useState<string | null>(null);
    const [selectedKey, setSelectedKey] = useState<string>('new');
    
    const [formData, setFormData] = useState<ConnectionData>(INITIAL_STATE);
    const [partnerFormData, setPartnerFormData] = useState<PartnerAppConnectionData>(INITIAL_PARTNER_APP_STATE);

    const [isLoading, setIsLoading] = useState(true);
    const [isSaving, setIsSaving] = useState(false);
    const [isSavingPartner, setIsSavingPartner] = useState(false);
    
    const [isDeleting, setIsDeleting] = useState<string | null>(null);
    
    const [currentUser, setCurrentUser] = useState<{ uid: string | null; role: string | null; companyId: string | null; companyName: string | null; } | null>(null);
    const [allCompanies, setAllCompanies] = useState<Company[]>([]);
    const [unassignedUsers, setUnassignedUsers] = useState<AppUser[]>([]);
    const [isDataLoading, setIsDataLoading] = useState(true);
    
    const [editingTarget, setEditingTarget] = useState<{ type: 'user' | 'company'; id: string | null; name: string }>({ type: 'user', id: null, name: 'Mis Conexiones' });
    const [editingTargetPlatform, setEditingTargetPlatform] = useState<'woocommerce' | 'shopify' | null>(null);

    const [selectedEntityStatus, setSelectedEntityStatus] = useState<SelectedEntityStatus | null>(null);
    const [isCheckingStatus, setIsCheckingStatus] = useState(false);
    const [refreshKey, setRefreshKey] = useState(0);

    const fetchConnections = useCallback(async (user: FirebaseUser, targetType: 'user' | 'company', targetId: string | null) => {
        setIsLoading(true);
        if (!targetId) {
            setAllConnections({});
            setAllPartnerConnections({});
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
                setAllPartnerConnections(data.partnerConnections || {});

                const partnerCreds = data.partnerConnections?.[`${targetType}_${targetId}`] || INITIAL_PARTNER_APP_STATE;
                setPartnerFormData(partnerCreds);
                
                const currentActiveKey = data.activeConnectionKey || null;
                setActiveKey(currentActiveKey);
                
                if (selectedKey !== 'new' && connections[selectedKey]) {
                    setFormData(connections[selectedKey]);
                } else if (currentActiveKey && connections[currentActiveKey]) {
                    setSelectedKey(currentActiveKey);
                    setFormData(connections[currentActiveKey]);
                } else {
                    const firstKey = Object.keys(connections)[0];
                    if (firstKey) {
                        setSelectedKey(firstKey);
                        setFormData(connections[firstKey]);
                    } else {
                        setSelectedKey('new');
                        setFormData(INITIAL_STATE);
                    }
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
    }, [toast, selectedKey]);
    
    useEffect(() => {
        const fetchInitialData = async (user: FirebaseUser) => {
            setIsDataLoading(true);
            const token = await user.getIdToken();
            const response = await fetch('/api/user/verify', { headers: { 'Authorization': `Bearer ${token}` } });
            if (!response.ok) throw new Error("Failed to verify user.");
            const userData = await response.json();
            setCurrentUser(userData);

            let newEditingTarget: { type: 'user' | 'company'; id: string | null; name: string; platform: 'woocommerce' | 'shopify' | null };

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
                newEditingTarget = { type: 'user', id: user.uid, name: 'Mis Conexiones (Super Admin)', platform: null };
            } else {
                const effectivePlatform = userData.companyPlatform || userData.platform;
                newEditingTarget = { 
                    type: userData.companyId ? 'company' : 'user', 
                    id: userData.companyId || user.uid, 
                    name: userData.companyName || 'Mis Conexiones',
                    platform: effectivePlatform
                };
            }
            
            setEditingTarget(newEditingTarget);
            setEditingTargetPlatform(newEditingTarget.platform);
            await fetchConnections(user, newEditingTarget.type as 'user' | 'company', newEditingTarget.id);
            setIsDataLoading(false);
        };
        
        const unsubscribe = onAuthStateChanged(auth, async (user) => {
            if (user) {
                await fetchInitialData(user);
                 const authSuccess = searchParams.get('shopify_auth');
                 if(authSuccess === 'success') {
                    toast({title: "¡Conexión con Shopify Exitosa!", description: "Se ha autorizado la aplicación correctamente."});
                 } else if (authSuccess === 'error') {
                     toast({title: "Error en la Conexión con Shopify", description: searchParams.get('error_message') || "No se pudo completar la autorización.", variant: "destructive"});
                 }
            } else {
                setIsLoading(false);
                setIsDataLoading(false);
            }
        });
        return () => unsubscribe();
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [fetchConnections, searchParams]);

     useEffect(() => {
        const targetId = editingTarget.id;
        const targetType = editingTarget.type;

        if (!targetId) {
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
        let newEditingTarget: { type: 'user' | 'company'; id: string | null; name: string, platform: 'woocommerce' | 'shopify' | null };

        if (type === 'user') {
            if (id === 'self') {
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
        fetchConnections(user, newEditingTarget.type as 'user' | 'company', newEditingTarget.id);
    };


    useEffect(() => {
        const connectionKeys = Object.keys(allConnections);
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

    const handlePartnerFormDataChange = (newData: PartnerAppConnectionData) => {
      setPartnerFormData(newData);
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
            let setActive = !isPartnerCreds;

            if (isPartnerCreds) {
                 if (!partnerFormData.clientId || !partnerFormData.clientSecret) {
                    toast({ title: "Datos Incompletos", description: "El Client ID y Client Secret son obligatorios.", variant: "destructive" });
                    setSaving(false); return;
                }
                keyToSave = `partner_app`;
                dataToSave = partnerFormData;
            } else {
                 const urlsToValidate = [
                    { name: 'WooCommerce', url: formData.wooCommerceStoreUrl },
                    { name: 'WordPress', url: formData.wordpressApiUrl },
                ];
                for (const item of urlsToValidate) {
                    if (item.url) {
                        try { new URL(item.url.includes('://') ? item.url : `https://${item.url}`); }
                        catch (e) { toast({ title: "URL Inválida", description: `El formato de la URL para ${item.name} no es válido.`, variant: "destructive" }); setSaving(false); return; }
                    }
                }
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
                isPartner: isPartnerCreds,
                entityId: editingTarget.id,
                entityType: editingTarget.type,
            };

            const response = await fetch('/api/user-settings/connections', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
                body: JSON.stringify(payload)
            });

            if (!response.ok) {
                throw new Error((await response.json()).error || "Fallo al guardar la conexión.");
            }
            
            toast({ title: "Conexión Guardada", description: `Los datos para '${keyToSave}' han sido guardados.` });
            
            await fetchConnections(user, editingTarget.type, editingTarget.id);
            setRefreshKey(k => k + 1);
            window.dispatchEvent(new Event('connections-updated'));

            if (isPartnerCreds) {
                // Now redirect to Shopify for OAuth
                const authUrl = `https://partners.shopify.com/oauth/authorize?client_id=${partnerFormData.clientId}&scope=write_development_stores&redirect_uri=${process.env.NEXT_PUBLIC_BASE_URL}/api/shopify/auth/callback&state=${editingTarget.type}:${editingTarget.id}`;
                window.location.href = authUrl;
            }

        } catch (error: any) {
            toast({ title: "Error al Guardar", description: error.message, variant: "destructive" });
        } finally {
            setSaving(false);
        }
    };
    
    const handleDelete = async (keyToDelete: string) => {
        if (keyToDelete === 'new') return;
        setIsDeleting(keyToDelete);
        const user = auth.currentUser;
        if (!user || !editingTarget.id) {
            toast({ title: "Error de autenticación", variant: "destructive" });
            setIsDeleting(null); return;
        }

        try {
            const token = await user.getIdToken();
            const payload: any = { 
                key: keyToDelete,
                isPartner: keyToDelete.startsWith('partner_app'),
                entityId: editingTarget.id,
                entityType: editingTarget.type,
            };
            
            await fetch('/api/user-settings/connections', {
                method: 'DELETE',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
                body: JSON.stringify(payload)
            });
            
            toast({ title: "Conexión Eliminada", description: `El perfil para '${keyToDelete}' ha sido eliminado.` });
            await fetchConnections(user, editingTarget.type, editingTarget.id);
            setRefreshKey(k => k + 1);
            window.dispatchEvent(new Event('connections-updated'));
        } catch (error: any) {
            toast({ title: "Error al Eliminar", description: error.message, variant: "destructive" });
        } finally {
            setIsDeleting(null);
        }
    };
    
    const connectionKeys = Object.keys(allConnections);
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
                <CardHeader>
                    <CardTitle>Perfiles de Conexión de Tiendas</CardTitle>
                    <CardDescription>
                        Gestiona las conexiones a tiendas específicas, ya sean de WooCommerce o Shopify. La conexión activa se usará por defecto en las herramientas.
                    </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                     <ConnectionStatusIndicator status={selectedEntityStatus} isLoading={isCheckingStatus} onRefresh={() => setRefreshKey(k => k + 1)} />
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
                                    <AlertDialogTrigger asChild><Button variant="destructive" disabled={isSaving || !!isDeleting} className="w-full md:w-auto"><Trash2 className="mr-2 h-4 w-4" />Eliminar Perfil</Button></AlertDialogTrigger>
                                    <AlertDialogContent>
                                        <AlertDialogHeader><AlertDialogTitle>¿Estás seguro?</AlertDialogTitle><AlertDialogDescription>Se eliminará permanentemente el perfil de conexión para <strong>{selectedKey}</strong>.</AlertDialogDescription></AlertDialogHeader>
                                        <AlertDialogFooter><AlertDialogCancel>Cancelar</AlertDialogCancel><AlertDialogAction onClick={() => handleDelete(selectedKey)} className="bg-destructive hover:bg-destructive/90">Continuar</AlertDialogAction></AlertDialogFooter>
                                    </AlertDialogContent>
                                </AlertDialog>
                            )}
                        </div>
                        <div className="flex flex-col-reverse gap-4 md:flex-row">
                            <Button onClick={() => handleSave(false)} disabled={isSaving || !!isDeleting} className="w-full md:w-auto">
                                {isSaving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
                                {isSaving ? "Guardando..." : saveButtonText}
                            </Button>
                        </div>
                    </div>

                    {showShopify && (
                       <ShopifyPartnerCard 
                         editingTarget={editingTarget}
                         partnerFormData={partnerFormData}
                         onPartnerFormDataChange={handlePartnerFormDataChange}
                         onSaveAndConnect={() => handleSave(true)}
                         isSavingPartner={isSavingPartner}
                         onDelete={() => handleDelete('partner_app')}
                         isDeleting={isDeleting === 'partner_app'}
                       />
                    )}
                </div>
            )}
        </div>
    );
}

```
  <change>
    <file>/src/lib/api-helpers.ts</file>
    <content><![CDATA[
// src/lib/api-helpers.ts
import type * as admin from 'firebase-admin';
import { adminDb } from '@/lib/firebase-admin';
import { createWooCommerceApi } from '@/lib/woocommerce';
import { createWordPressApi } from '@/lib/wordpress';
import { createShopifyApi } from '@/lib/shopify';
import type WooCommerceRestApiType from '@woocommerce/woocommerce-rest-api';
import type { AxiosInstance } from 'axios';
import axios from 'axios';
import FormData from 'form-data';
import type { ExtractedWidget } from './types';
import { z } from 'zod';
import crypto from 'crypto';

// THIS IS NOW THE SINGLE SOURCE OF TRUTH
export const partnerAppConnectionDataSchema = z.object({
  clientId: z.string().min(1, "Client ID is required"),
  clientSecret: z.string().min(1, "Client Secret is required"),
});

interface ApiClients {
  wooApi: WooCommerceRestApiType | null;
  wpApi: AxiosInstance | null;
  shopifyApi: AxiosInstance | null;
  activeConnectionKey: string | null;
  settings: admin.firestore.DocumentData | undefined;
}

export async function getPartnerAppCredentials(entityId: string, entityType: 'user' | 'company'): Promise<{ clientId: string; clientSecret: string; }> {
    if (!adminDb) throw new Error("Firestore not configured on server");

    const settingsCollection = entityType === 'company' ? 'companies' : 'user_settings';
    const settingsRef = adminDb.collection(settingsCollection).doc(entityId);
    
    const doc = await settingsRef.get();
    if (!doc.exists) throw new Error(`${entityType === 'company' ? 'Company' : 'User'} settings not found`);

    const connections = doc.data()?.connections || {};
    const partnerAppData = connections['partner_app'];

    if (!partnerAppData) {
      throw new Error(`Invalid or missing Shopify Partner App credentials. Please configure them in Settings > Connections.`);
    }

    const validation = partnerAppConnectionDataSchema.safeParse(partnerAppData);
     if (!validation.success) {
        throw new Error(`Invalid or missing Shopify Partner App credentials. Please configure them in Settings > Connections.`);
    }
    return validation.data;
}


/**
 * Retrieves Shopify Partner credentials from Firestore.
 * @param entityId The Firebase UID of the user or the ID of the company.
 * @param entityType The type of entity ('user' or 'company').
 * @returns An object containing the access token and organization ID.
 * @throws If credentials are not configured or invalid.
 */
export async function getPartnerCredentials(entityId: string, entityType: 'user' | 'company'): Promise<{ partnerApiToken: string; partnerOrgId: string; }> {
    if (!adminDb) {
        console.error('getPartnerCredentials: Firestore no está configurado');
        throw new Error("Firestore not configured on server");
    }

    const settingsRef = entityType === 'company' 
        ? adminDb.collection('companies').doc(entityId)
        : adminDb.collection('user_settings').doc(entityId);
    
    const doc = await settingsRef.get();
    if (!doc.exists) {
        console.error('getPartnerCredentials: Documento no encontrado', settingsRef.path);
        throw new Error(`${entityType === 'company' ? 'Company' : 'User'} settings not found`);
    }

    const docData = doc.data();
    
    const partnerData = docData?.partnerConnections?.[`${entityType}_${entityId}`];
    
    if (!partnerData) {
        throw new Error("Shopify Partner credentials not configured");
    }

    // Since we're moving away from this, the schema is now for the new method.
    // This function will need to be phased out or adapted. For now, assume it works with the old shape.
    return {
        partnerApiToken: partnerData.partnerApiToken,
        partnerOrgId: partnerData.partnerOrgId,
    };
}


function extractHeadingsRecursive(elements: any[], widgets: ExtractedWidget[]): void {
    if (!elements || !Array.isArray(elements)) return;

    for (const element of elements) {
        if (element.elType === 'widget' && element.widgetType === 'heading' && element.settings?.title) {
            widgets.push({
                id: element.id,
                tag: element.settings.header_size || 'h2',
                text: element.settings.title,
                type: 'heading', // Added for clarity on the frontend
            });
        }
        
        if (element.elements && element.elements.length > 0) {
            extractHeadingsRecursive(element.elements, widgets);
        }
    }
}

export function extractElementorHeadings(elementorDataString: string): ExtractedWidget[] {
    try {
        const widgets: ExtractedWidget[] = [];
        if (!elementorDataString) return widgets;
        const elementorData = JSON.parse(elementorDataString);
        extractHeadingsRecursive(elementorData, widgets);
        return widgets;
    } catch (e) {
        console.error("Failed to parse or extract Elementor headings", e);
        return [];
    }
}


/**
 * Recursively traverses Elementor's data structure to collect all user-visible text content.
 * @param data The 'elements' array or any nested object/array from Elementor's data.
 * @param texts The array to push found texts into.
 */
function collectElementorTextsRecursive(data: any, texts: string[]): void {
    if (!data) return;

    if (Array.isArray(data)) {
        data.forEach(item => collectElementorTextsRecursive(item, texts));
        return;
    }

    if (typeof data === 'object') {
        const keysToTranslate = [
            'title', 'editor', 'text', 'button_text', 'header_title', 'header_subtitle',
            'description', 'cta_text', 'label', 'placeholder', 'heading', 'sub_heading',
            'alert_title', 'alert_description',
            // Added based on user's JSON from theme "The7"
            'title_text', 'description_text', 'list_title'
        ];

        for (const key in data) {
            if (Object.prototype.hasOwnProperty.call(data, key)) {
                const value = data[key];

                if (keysToTranslate.includes(key) && typeof value === 'string' && value.trim() !== '') {
                    texts.push(value);
                } else if (typeof value === 'object' && value !== null) {
                    collectElementorTextsRecursive(value, texts);
                }
            }
        }
    }
}

export function collectElementorTexts(elements: any[]): string[] {
    const texts: string[] = [];
    collectElementorTextsRecursive(elements, texts);
    return texts;
}

/**
 * Recursively traverses a deep copy of Elementor's data structure and replaces text content
 * with items from an array of translated strings.
 * @param data A deep copy of the original 'elements' array or nested object/array.
 * @param translatedTexts A mutable array of translated strings.
 * @returns The Elementor data structure with translated text.
 */
function replaceElementorTextsRecursive(data: any, translatedTexts: string[]): any {
    if (!data) return data;

    if (Array.isArray(data)) {
        return data.map(item => replaceElementorTextsRecursive(item, translatedTexts));
    }

    if (typeof data === 'object') {
        const newData = { ...data };
        const keysToTranslate = [
            'title', 'editor', 'text', 'button_text', 'header_title', 'header_subtitle',
            'description', 'cta_text', 'label', 'placeholder', 'heading', 'sub_heading',
            'alert_title', 'alert_description',
            // Added based on user's JSON from theme "The7"
            'title_text', 'description_text', 'list_title'
        ];

        for (const key in newData) {
            if (Object.prototype.hasOwnProperty.call(newData, key)) {
                const value = newData[key];

                if (keysToTranslate.includes(key) && typeof value === 'string' && value.trim() !== '') {
                    if (translatedTexts.length > 0) {
                        newData[key] = translatedTexts.shift();
                    }
                } else if (typeof value === 'object' && value !== null) {
                    newData[key] = replaceElementorTextsRecursive(value, translatedTexts);
                }
            }
        }
        return newData;
    }

    return data;
}

export function replaceElementorTexts(elementorData: any, translatedTexts: string[]): any {
  if (!elementorData || !Array.isArray(elementorData)) return elementorData;
  return replaceElementorTextsRecursive(elementorData, translatedTexts);
}


/**
 * Downloads, processes (resizes, converts to WebP), and uploads an image to the WordPress media library.
 * This function now loads 'sharp' dynamically to avoid bundling it in routes that don't need it.
 * @param imageUrl The URL of the image to process.
 * @param seoFilename A desired filename for SEO purposes. The extension will be replaced with .webp.
 * @param imageMetadata Metadata for the image (title, alt, etc.).
 * @param wpApi Initialized Axios instance for WordPress API.
 * @returns The ID of the newly uploaded media item.
 */
export async function uploadImageToWordPress(
  imageUrl: string,
  seoFilename: string,
  imageMetadata: { title: string; alt_text: string; caption: string; description: string; },
  wpApi: AxiosInstance
): Promise<number> {
    try {
        // Dynamically import sharp ONLY when this function is called.
        const sharp = (await import('sharp')).default;

        // 1. Download the image
        const imageResponse = await axios.get(imageUrl, { responseType: 'arraybuffer' });
        const originalBuffer = Buffer.from(imageResponse.data, 'binary');

        // 2. Process the image with Sharp
        const processedBuffer = await sharp(originalBuffer)
            .resize(1200, 1200, {
                fit: 'inside', // Resize while maintaining aspect ratio
                withoutEnlargement: true, // Don't enlarge smaller images
            })
            .webp({ quality: 80 }) // Convert to WebP with 80% quality
            .toBuffer();
            
        // 3. Prepare FormData for WordPress upload
        const webpFilename = seoFilename.replace(/\.[^/.]+$/, "") + ".webp"; // Ensure filename is .webp
        const formData = new FormData();
        formData.append('file', processedBuffer, webpFilename);
        formData.append('title', imageMetadata.title);
        formData.append('alt_text', imageMetadata.alt_text);
        formData.append('caption', imageMetadata.caption);
        formData.append('description', imageMetadata.description);

        // 4. Upload the processed image to WordPress
        const mediaResponse = await wpApi.post('/media', formData, {
            headers: {
                ...formData.getHeaders(),
                'Content-Disposition': `attachment; filename=${webpFilename}`,
            },
        });

        return mediaResponse.data.id;

    } catch (uploadError: any) {
        let errorMsg = `Error al procesar la imagen desde la URL '${imageUrl}'.`;
        if (uploadError.response?.data?.message) {
            errorMsg += ` Razón: ${uploadError.response.data.message}`;
            if (uploadError.response.status === 401 || uploadError.response.status === 403) {
                errorMsg += ' Esto es probablemente un problema de permisos. Asegúrate de que el usuario de la Contraseña de Aplicación tiene el rol de "Editor" o "Administrador" en WordPress.';
            }
        } else {
            errorMsg += ` Razón: ${uploadError.message}`;
        }
        console.error(errorMsg, uploadError.response?.data);
        throw new Error(errorMsg);
    }
}

/**
 * Finds a category by its path (e.g., "Parent > Child") or creates it if it doesn't exist.
 * @param pathString The category path string.
 * @param wooApi An initialized WooCommerce API client.
 * @returns The ID of the final category in the path.
 */
export async function findOrCreateCategoryByPath(pathString: string, wooApi: WooCommerceRestApiType): Promise<number | null> {
    if (!pathString || !pathString.trim()) {
        return null;
    }

    const pathParts = pathString.split('>').map(part => part.trim());
    let parentId = 0;
    let finalCategoryId: number | null = null;
    
    // Fetch all categories once to avoid multiple API calls in the loop
    const allCategoriesResponse = await wooApi.get("products/categories", { per_page: 100 });
    const allCategories = allCategoriesResponse.data;

    for (const part of pathParts) {
        let foundCategory = allCategories.find(
            (cat: any) => cat.name.toLowerCase() === part.toLowerCase() && cat.parent === parentId
        );

        if (foundCategory) {
            parentId = foundCategory.id;
        } else {
            // Create the new category
            const { data: newCategory } = await wooApi.post("products/categories", {
                name: part,
                parent: parentId,
            });
            // Add the new category to our local list to be found by the next iteration
            allCategories.push(newCategory);
            parentId = newCategory.id;
        }
        finalCategoryId = parentId;
    }

    return finalCategoryId;
}

/**
 * Finds a WP post category by its path (e.g., "Parent > Child") or creates it if it doesn't exist.
 * @param pathString The category path string.
 * @param wpApi An initialized Axios instance for the WordPress API.
 * @returns The ID of the final category in the path.
 */
export async function findOrCreateWpCategoryByPath(pathString: string, wpApi: AxiosInstance): Promise<number | null> {
    if (!pathString || !pathString.trim()) {
        return null;
    }

    const pathParts = pathString.split('>').map(part => part.trim());
    let parentId = 0;
    let finalCategoryId: number | null = null;
    
    // Fetch all categories once to avoid multiple API calls in the loop
    const allCategoriesResponse = await wpApi.get("/categories", { params: { per_page: 100 } });
    const allCategories = allCategoriesResponse.data;

    for (const part of pathParts) {
        let foundCategory = allCategories.find(
            (cat: any) => cat.name.toLowerCase() === part.toLowerCase() && cat.parent === parentId
        );

        if (foundCategory) {
            parentId = foundCategory.id;
        } else {
            // Create the new category
            const { data: newCategory } = await wpApi.post("/categories", {
                name: part,
                parent: parentId,
            });
            // Add the new category to our local list to be found by the next iteration
            allCategories.push(newCategory);
            parentId = newCategory.id;
        }
        finalCategoryId = parentId;
    }

    return finalCategoryId;
}

/**
 * Finds tags by name or creates them if they don't exist in WordPress.
 * @param tagNames An array of tag names.
 * @param wpApi An initialized Axios instance for the WordPress API.
 * @returns A promise that resolves to an array of tag IDs.
 */
export async function findOrCreateTags(tagNames: string[], wpApi: AxiosInstance): Promise<number[]> {
  if (!tagNames || tagNames.length === 0) {
    return [];
  }
  const tagIds: number[] = [];

  for (const name of tagNames) {
    try {
      // 1. Search for the tag
      const searchResponse = await wpApi.get('/tags', { params: { search: name, per_page: 1 } });
      const existingTag = searchResponse.data.find((tag: any) => tag.name.toLowerCase() === name.toLowerCase());

      if (existingTag) {
        tagIds.push(existingTag.id);
      } else {
        // 2. Create the tag if it doesn't exist
        const createResponse = await wpApi.post('/tags', { name });
        tagIds.push(createResponse.data.id);
      }
    } catch (error: any) {
        console.error(`Failed to find or create tag "${name}":`, error.response?.data || error.message);
        // Continue to the next tag even if one fails
    }
  }
  return tagIds;
}

export function validateHmac(searchParams: URLSearchParams, clientSecret: string): boolean {
    const hmac = searchParams.get('hmac');
    if (!hmac) return false;

    // Create a new URLSearchParams object without the hmac
    const params = new URLSearchParams(searchParams.toString());
    params.delete('hmac');
    
    // The parameters must be sorted alphabetically
    params.sort();

    const calculatedHmac = crypto
        .createHmac('sha256', clientSecret)
        .update(params.toString())
        .digest('hex');

    // Use a timing-safe comparison to prevent timing attacks
    try {
        return crypto.timingSafeEqual(Buffer.from(hmac, 'hex'), Buffer.from(calculatedHmac, 'hex'));
    } catch {
        return false;
    }
}


// This is now the single source of truth for getting API clients.
// It also handles the plugin verification.
export async function getApiClientsForUser(uid: string): Promise<ApiClients> {
  if (!adminDb) {
    throw new Error('Firestore admin is not initialized.');
  }

  const userDocRef = await adminDb.collection('users').doc(uid).get();
  const userData = userDocRef.data();
  
  let settingsSource: admin.firestore.DocumentData | undefined;
  if(userData?.companyId) {
      const companyDoc = await adminDb.collection('companies').doc(userData.companyId).get();
      if (companyDoc.exists) settingsSource = companyDoc.data();
  } else {
      const userSettingsDoc = await adminDb.collection('user_settings').doc(uid).get();
      if (userSettingsDoc.exists) settingsSource = userSettingsDoc.data();
  }
  
  if (!settingsSource) {
    throw new Error('No settings found for user or their company. Please configure API connections.');
  }
  
  const allConnections = settingsSource.connections;
  const activeConnectionKey = settingsSource.activeConnectionKey;

  if (!activeConnectionKey || !allConnections || !allConnections[activeConnectionKey]) {
    throw new Error('No active API connection is configured. Please select or create one in Settings.');
  }

  const activeConnection = allConnections[activeConnectionKey];
  const { wordpressApiUrl, wordpressUsername, wordpressApplicationPassword } = activeConnection;

  // Verification is only needed for WordPress-based connections
  if (wordpressApiUrl && wordpressUsername && wordpressApplicationPassword) {
    const tempWpApi = createWordPressApi({
      url: wordpressApiUrl,
      username: wordpressUsername,
      applicationPassword: wordpressApplicationPassword,
    });
    
    if (tempWpApi) {
        const siteUrl = tempWpApi.defaults.baseURL?.replace('/wp-json/wp/v2', '');
        const statusEndpoint = `${siteUrl}/wp-json/custom/v1/status`;
        try {
            const response = await tempWpApi.get(statusEndpoint, { timeout: 15000 });
            if (response.status !== 200 || response.data?.verified !== true) {
                throw new Error("Conexión no verificada. Comprueba que la API Key del plugin es correcta y está activa en tu sitio de WordPress.");
            }
        } catch (e: any) {
            if (e.response?.status === 404) {
                 throw new Error('Endpoint de verificación no encontrado. Actualiza el plugin AutoPress AI Helper en tu WordPress.');
            }
            throw new Error(e.message || "No se pudo verificar el estado del plugin en WordPress. Revisa la URL y las credenciales.");
        }
    }
  }

  const wooApi = createWooCommerceApi({
    url: activeConnection.wooCommerceStoreUrl,
    consumerKey: activeConnection.wooCommerceApiKey,
    consumerSecret: activeConnection.wooCommerceApiSecret,
  });

  const wpApi = createWordPressApi({
    url: wordpressApiUrl,
    username: wordpressUsername,
    applicationPassword: wordpressApplicationPassword,
  });

  const shopifyApi = createShopifyApi({
    url: activeConnection.shopifyStoreUrl,
    accessToken: activeConnection.shopifyApiPassword,
  });

  return { wooApi, wpApi, shopifyApi, activeConnectionKey, settings: settingsSource };
}
