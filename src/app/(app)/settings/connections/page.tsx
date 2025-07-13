
// src/app/(app)/settings/connections/page.tsx
"use client";

import React, { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
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
    wooCommerceStoreUrl: string;
    wooCommerceApiKey: string;
    wooCommerceApiSecret: string;
    wordpressApiUrl: string;
    wordpressUsername: string;
    wordpressApplicationPassword: string;
    shopifyStoreUrl: string;
    shopifyApiPassword: string; // This will hold the access token for a specific store
}

type PartnerConnectionData = {
    partnerApiToken: string;
    partnerOrgId: string;
};

type AllConnections = { [key: string]: ConnectionData | PartnerConnectionData };


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

const INITIAL_PARTNER_STATE: PartnerConnectionData = {
    partnerApiToken: '',
    partnerOrgId: '',
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
  onSave, 
  onDelete, 
  isSaving,
}: { 
  editingTarget: { type: 'user' | 'company'; id: string | null; name: string };
  partnerFormData: PartnerConnectionData;
  onPartnerFormDataChange: (data: PartnerConnectionData) => void;
  onSave: (isPartner: boolean) => void;
  onDelete: (key: string) => void;
  isSaving: boolean;
}) => {
    const [verificationStatus, setVerificationStatus] = useState<'idle' | 'verifying' | 'success' | 'error'>('idle');
    const [verificationMessage, setVerificationMessage] = useState('');
    const { toast } = useToast();

    const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
      const { name, value } = e.target;
      onPartnerFormDataChange({ ...partnerFormData, [name]: value });
    };

    const handleVerify = async () => {
        setVerificationStatus('verifying');
        setVerificationMessage('');
        
        if (!editingTarget.id) {
             setVerificationStatus('error');
             setVerificationMessage('Error: No se ha seleccionado ninguna entidad para verificar.');
             return;
        }

        try {
            const token = await auth.currentUser?.getIdToken();
            if (!token) throw new Error('No se pudo obtener el token de autenticación.');
            
            const payload = {
                entityId: editingTarget.id,
                entityType: editingTarget.type,
            };

            const response = await fetch('/api/shopify/verify-partner', {
                method: 'POST',
                headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
                body: JSON.stringify(payload),
            });

            const result = await response.json();
            if (!response.ok) throw new Error(result.error || 'Fallo en la verificación.');
            
            setVerificationStatus('success');
            setVerificationMessage(result.message);
            toast({ title: "¡Éxito!", description: result.message });
        } catch (error: any) {
            setVerificationStatus('error');
            setVerificationMessage(error.message);
             toast({ title: "Error de Verificación", description: error.message, variant: 'destructive' });
        }
    };

    const getStatusJsx = () => {
        switch(verificationStatus) {
            case 'verifying':
                return <span className="flex items-center text-sm text-muted-foreground"><Loader2 className="mr-2 h-4 w-4 animate-spin"/> Verificando...</span>
            case 'success':
                return <span className="flex items-center text-sm text-green-600"><CheckCircle className="mr-2 h-4 w-4"/> {verificationMessage}</span>
            case 'error':
                 return <span className="flex items-center text-sm text-destructive"><AlertCircle className="mr-2 h-4 w-4"/> {verificationMessage}</span>
            default:
                return <p className="text-xs text-muted-foreground">Haz clic en "Verificar Conexión" para comprobar tus credenciales.</p>;
        }
    }

    return (
        <Card className="mt-8 border-primary/50">
            <CardHeader>
                <CardTitle>Conexión Global de Shopify Partners</CardTitle>
                <CardDescription>
                    Introduce tus credenciales de Partner para la creación automatizada de tiendas para <strong>{editingTarget.name}</strong>.
                </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
                 <Alert>
                    <AlertCircle className="h-4 w-4" />
                    <AlertTitle>¿Cómo obtener las credenciales?</AlertTitle>
                    <AlertDescription>
                        <ol className="list-decimal list-inside space-y-1 mt-2">
                            <li>Ve a tu panel de Shopify Partner: <strong>Ajustes &gt; Clientes de la API</strong>.</li>
                            <li>Crea o selecciona un <strong>Cliente de la API de Partner</strong>.</li>
                            <li>Copia el <strong>Token de acceso</strong> y el <strong>Organization ID</strong> (de la URL del panel) y pégalos abajo.</li>
                        </ol>
                    </AlertDescription>
                </Alert>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                        <Label htmlFor="partnerApiToken">Token de Acceso de la API de Partner</Label>
                        <Input id="partnerApiToken" name="partnerApiToken" type="password" value={partnerFormData.partnerApiToken || ''} onChange={handleInputChange} placeholder="Pega aquí el Token de Acceso" disabled={isSaving} />
                    </div>
                    <div>
                        <Label htmlFor="partnerOrgId">Organization ID</Label>
                        <Input id="partnerOrgId" name="partnerOrgId" value={partnerFormData.partnerOrgId || ''} onChange={handleInputChange} placeholder="Pega aquí el ID de la organización" disabled={isSaving} />
                    </div>
                </div>
                <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                    <div className="flex items-center gap-2">
                        <Button onClick={() => onSave(true)} disabled={isSaving}>
                            {isSaving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                            Guardar Credenciales
                        </Button>
                        <Button variant="outline" onClick={handleVerify} disabled={isSaving || verificationStatus === 'verifying'}>
                            Verificar Conexión
                        </Button>
                        <AlertDialog>
                            <AlertDialogTrigger asChild>
                                <Button variant="outline" disabled={isSaving || !partnerFormData.partnerApiToken} size="icon">
                                    <Trash2 className="h-4 w-4"/>
                                </Button>
                            </AlertDialogTrigger>
                            <AlertDialogContent>
                                <AlertDialogHeader>
                                    <AlertDialogTitle>¿Eliminar Credenciales de Partner?</AlertDialogTitle>
                                    <AlertDialogDescription>
                                        Esta acción eliminará permanentemente las credenciales de Shopify Partner para <strong>{editingTarget.name}</strong>.
                                    </AlertDialogDescription>
                                </AlertDialogHeader>
                                <AlertDialogFooter>
                                    <AlertDialogCancel>Cancelar</AlertDialogCancel>
                                    <AlertDialogAction onClick={() => onDelete('shopify_partner')} className="bg-destructive hover:bg-destructive/90">Sí, eliminar</AlertDialogAction>
                                </AlertDialogFooter>
                            </AlertDialogContent>
                        </AlertDialog>
                    </div>
                    <div className="h-5">{getStatusJsx()}</div>
                </div>
            </CardContent>
        </Card>
    );
};



export default function ConnectionsPage() {
    const [allConnections, setAllConnections] = useState<AllConnections>({});
    const [activeKey, setActiveKey] = useState<string | null>(null);
    const [selectedKey, setSelectedKey] = useState<string>('new');
    
    const [formData, setFormData] = useState<ConnectionData>(INITIAL_STATE);
    const [partnerFormData, setPartnerFormData] = useState<PartnerConnectionData>(INITIAL_PARTNER_STATE);

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

    const { toast } = useToast();

    const fetchConnections = useCallback(async (user: FirebaseUser, targetType: 'user' | 'company', targetId: string | null) => {
        setIsLoading(true);
        if (!targetId) {
            setAllConnections({});
            setActiveKey(null);
            setSelectedKey('new');
            setFormData(INITIAL_STATE);
            setPartnerFormData(INITIAL_PARTNER_STATE);
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
                const currentActiveKey = data.activeConnectionKey || null;
                setActiveKey(currentActiveKey);
                
                if (connections['shopify_partner']) {
                    setPartnerFormData(connections['shopify_partner']);
                } else {
                    setPartnerFormData(INITIAL_PARTNER_STATE);
                }

                if (selectedKey !== 'new' && connections[selectedKey]) {
                    setFormData(connections[selectedKey]);
                } else if (currentActiveKey && connections[currentActiveKey]) {
                    setSelectedKey(currentActiveKey);
                    setFormData(connections[currentActiveKey]);
                } else {
                    const firstNonPartnerKey = Object.keys(connections).find(k => k !== 'shopify_partner');
                    if (firstNonPartnerKey) {
                        setSelectedKey(firstNonPartnerKey);
                        setFormData(connections[firstNonPartnerKey]);
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
                newEditingTarget = { type: 'user', id: user.uid, name: 'Mis Conexiones (Super Admin)', platform: null }; // Super admin can see both
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
            } else {
                setIsLoading(false);
                setIsDataLoading(false);
            }
        });
        return () => unsubscribe();
    }, [fetchConnections]);

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
                 newEditingTarget = { type: 'user', id: user.uid, name: 'Mis Conexiones (Super Admin)', platform: null }; // Super admin can see both
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
        const connectionKeys = Object.keys(allConnections).filter(k => k !== 'shopify_partner');
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

    const handlePartnerFormDataChange = (newData: PartnerConnectionData) => {
      setPartnerFormData(newData);
    };
    
    const handleSave = async (isPartnerCreds: boolean = false) => {
        let keyToSave: string;
        let dataToSave: any;
        let setActive = !isPartnerCreds;

        if (isPartnerCreds) {
            if (!partnerFormData.partnerApiToken || !partnerFormData.partnerOrgId) {
                toast({ title: "Datos Incompletos", description: "El Token de Acceso y el ID de Organización son obligatorios.", variant: "destructive" });
                return;
            }
            keyToSave = 'shopify_partner';
            dataToSave = partnerFormData;
            setIsSavingPartner(true);
        } else {
            const urlsToValidate = [
                { name: 'WooCommerce', url: formData.wooCommerceStoreUrl },
                { name: 'WordPress', url: formData.wordpressApiUrl },
            ];
            for (const item of urlsToValidate) {
                if (item.url) {
                    try { new URL(item.url.includes('://') ? item.url : `https://${item.url}`); }
                    catch (e) { toast({ title: "URL Inválida", description: `El formato de la URL para ${item.name} no es válido.`, variant: "destructive" }); return; }
                }
            }
            const wooHostname = getHostname(formData.wooCommerceStoreUrl);
            const wpHostname = getHostname(formData.wordpressApiUrl);
            const shopifyHostname = getHostname(formData.shopifyStoreUrl);
            
            keyToSave = selectedKey !== 'new' ? selectedKey : (wooHostname || wpHostname || shopifyHostname || '');
            if (!keyToSave) {
                toast({ title: "Datos Incompletos", description: "Por favor, introduce una URL válida para que sirva como identificador.", variant: "destructive" });
                return;
            }
            dataToSave = formData;
            setIsSaving(true);
        }

        const user = auth.currentUser;
        if (!user) {
            toast({ title: "Error de autenticación", variant: "destructive" });
            isPartnerCreds ? setIsSavingPartner(false) : setIsSaving(false); return;
        }

        try {
            const token = await user.getIdToken();
            const payload: any = { key: keyToSave, connectionData: dataToSave, setActive };
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
                throw new Error((await response.json()).error || "Fallo al guardar la conexión.");
            }
            
            toast({ title: "Conexión Guardada", description: `Los datos para '${keyToSave}' han sido guardados.` });
            
            await fetchConnections(user, editingTarget.type, editingTarget.id);
            
            if (!isPartnerCreds && selectedKey === 'new') {
                setSelectedKey(keyToSave);
            }
            setRefreshKey(k => k + 1);
            window.dispatchEvent(new Event('connections-updated'));

        } catch (error: any) {
            toast({ title: "Error al Guardar", description: error.message, variant: "destructive" });
        } finally {
            if (isPartnerCreds) {
                setIsSavingPartner(false);
            } else {
                setIsSaving(false);
            }
        }
    };
    
    const handleDelete = async (keyToDelete: string) => {
        if (keyToDelete === 'new') return;
        setIsDeleting(keyToDelete);
        const user = auth.currentUser;
        if (!user) {
            toast({ title: "Error de autenticación", variant: "destructive" });
            setIsDeleting(null); return;
        }

        try {
            const token = await user.getIdToken();
            const payload: any = { key: keyToDelete };
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
    
    const connectionKeys = Object.keys(allConnections).filter(k => k !== 'shopify_partner');
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
                         onSave={handleSave}
                         onDelete={handleDelete}
                         isSaving={isSavingPartner}
                       />
                    )}
                </div>
            )}
        </div>
    );
}

    