

"use client";

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useSearchParams } from 'next/navigation';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Loader2, Save, Building, DollarSign, User } from "lucide-react";
import { useToast } from '@/hooks/use-toast';
import { auth, onAuthStateChanged, type FirebaseUser } from '@/lib/firebase';
import type { Company, ProductPhoto, User as AppUser } from '@/lib/types';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue, SelectSeparator } from '@/components/ui/select';
import { ImageUploader } from '@/components/features/wizard/image-uploader';
import { Skeleton } from '@/components/ui/skeleton';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Checkbox } from '@/components/ui/checkbox';


type EditableCompanyData = Omit<Company, 'id' | 'createdAt' | 'userCount'>;

const INITIAL_COMPANY_DATA: EditableCompanyData = {
    name: '',
    logoUrl: '',
    taxId: '',
    address: '',
    phone: '',
    email: '',
    seoHourlyRate: 10,
    platform: 'woocommerce',
    shopifyCreationDefaults: {
        createProducts: true,
        theme: '',
    }
};

const SHOPIFY_THEMES = [
  { value: 'dawn', label: 'Dawn (Flexible y minimalista)' },
  { value: 'refresh', label: 'Refresh (Atrevido y vibrante)' },
  { value: 'craft', label: 'Craft (Artesanal y auténtico)' },
  { value: 'sense', label: 'Sense (Energético y detallado)' },
  { value: 'taste', label: 'Taste (Espacioso y audaz)' },
];


export default function CompanySettingsPage() {
    const searchParams = useSearchParams();
    const [companyData, setCompanyData] = useState<EditableCompanyData>(INITIAL_COMPANY_DATA);
    const [logoPhotos, setLogoPhotos] = useState<ProductPhoto[]>([]);
    
    const [isLoading, setIsLoading] = useState(true);
    const [isSaving, setIsSaving] = useState(false);
    const { toast } = useToast();

    const [currentUser, setCurrentUser] = useState<{ uid: string | null; role: string | null; companyId: string | null; companyName: string | null; } | null>(null);
    const [allCompanies, setAllCompanies] = useState<Company[]>([]);
    const [unassignedUsers, setUnassignedUsers] = useState<AppUser[]>([]);
    const [editingTargetId, setEditingTargetId] = useState<string | null>(null);
    const [editingEntityType, setEditingEntityType] = useState<'user' | 'company' | null>(null);


    const fetchAllCompaniesAndUsers = useCallback(async (token: string) => {
        try {
            const [companiesResponse, usersResponse] = await Promise.all([
                fetch('/api/admin/companies', { headers: { 'Authorization': `Bearer ${token}` } }),
                fetch('/api/admin/users', { headers: { 'Authorization': `Bearer ${token}` } })
            ]);
            if (companiesResponse.ok) setAllCompanies((await companiesResponse.json()).companies);
            if (usersResponse.ok) setUnassignedUsers((await usersResponse.json()).users.filter((u: AppUser) => !u.companyId));

        } catch (error) {
            console.error("Failed to fetch all companies/users:", error);
        }
    }, []);

    const fetchSettingsData = useCallback(async (user: FirebaseUser, type: 'user' | 'company' | null, id: string | null) => {
        if (!id || !type) {
            setCompanyData(INITIAL_COMPANY_DATA);
            setLogoPhotos([]);
            setIsLoading(false);
            return;
        }
        setIsLoading(true);
        try {
            const token = await user.getIdToken();
            
            let dataToSet: Company;
            let entityName = 'Usuario Desconocido';
            let entityPlatform: 'woocommerce' | 'shopify' | null = 'woocommerce';

            if (type === 'company') {
                const companyResponse = await fetch(`/api/user-settings/company?companyId=${id}`, { headers: { 'Authorization': `Bearer ${token}` } });
                const companyDetails = allCompanies.find(c => c.id === id);
                entityName = companyDetails?.name || 'Empresa Desconocida';
                entityPlatform = companyDetails?.platform || 'woocommerce';

                if (companyResponse.ok) {
                    dataToSet = { ...INITIAL_COMPANY_DATA, name: entityName, platform: entityPlatform, ...(await companyResponse.json()).company };
                } else {
                     dataToSet = { ...INITIAL_COMPANY_DATA, name: entityName, platform: entityPlatform } as Company;
                     if (companyResponse.status !== 404) toast({ title: "Error al Cargar Datos", description: (await companyResponse.json()).error, variant: "destructive" });
                }
            } else { // type === 'user'
                 const userDocSnap = await fetch('/api/user/verify', { headers: { 'Authorization': `Bearer ${token}` } });
                 const userData = await userDocSnap.json();
                 entityName = userData?.displayName || 'Usuario Desconocido';
                 entityPlatform = userData?.platform || 'woocommerce';
                 
                 const userSettingsResponse = await fetch(`/api/user-settings/connections?userId=${id}`, { headers: { 'Authorization': `Bearer ${token}` } });
                 if (userSettingsResponse.ok) {
                    const userSettings = await userSettingsResponse.json();
                    
                    dataToSet = {
                        ...INITIAL_COMPANY_DATA,
                        name: entityName,
                        platform: entityPlatform,
                        ...(userSettings.companyData || {})
                    };
                 } else {
                    dataToSet = { ...INITIAL_COMPANY_DATA, name: entityName, platform: entityPlatform } as Company;
                    if (userSettingsResponse.status !== 404) toast({ title: "Error al Cargar Datos", description: (await userSettingsResponse.json()).error, variant: "destructive" });
                 }
            }
            
            setCompanyData(dataToSet);
            if (dataToSet.logoUrl) {
                setLogoPhotos([{ id: 'logo', previewUrl: dataToSet.logoUrl, name: 'Logo de la empresa', status: 'completed', progress: 100 }]);
            } else {
                setLogoPhotos([]);
            }

        } catch (error) {
            console.error(`Error fetching data for ${type} ${id}:`, error);
            toast({ title: "Error al Cargar Datos", description: `No se pudo obtener la información.`, variant: "destructive" });
        } finally {
            setIsLoading(false);
        }
    }, [toast, allCompanies]);
    
    const handleTargetSelection = (value: string) => {
        const [type, id] = value.split(':');
        setEditingEntityType(type as 'user' | 'company');
        setEditingTargetId(id);
        const user = auth.currentUser;
        if (user) fetchSettingsData(user, type as 'user' | 'company', id);
    }
    
    useEffect(() => {
        const unsubscribe = onAuthStateChanged(auth, async (user: FirebaseUser | null) => {
            if (user) {
                try {
                    const token = await user.getIdToken();
                    const response = await fetch('/api/user/verify', { headers: { 'Authorization': `Bearer ${token}` } });
                    const userData = await response.json();
                    setCurrentUser(userData);

                    const targetIdFromUrl = searchParams.get('companyId');
                    let initialId = targetIdFromUrl;
                    let initialType: 'user' | 'company' = 'company';

                    if (userData.role === 'super_admin') {
                        await fetchAllCompaniesAndUsers(token);
                        if (!initialId) {
                            initialId = userData.companyId || user.uid; 
                            initialType = userData.companyId ? 'company' : 'user';
                        }
                    } else { // Admin or other role
                        if (userData.companyId) {
                            initialId = userData.companyId;
                            initialType = 'company';
                        } else {
                            initialId = user.uid;
                            initialType = 'user';
                        }
                    }

                    if (initialId) {
                       setEditingTargetId(initialId);
                       setEditingEntityType(initialType);
                       fetchSettingsData(user, initialType, initialId);
                    } else {
                        setIsLoading(false);
                    }
                } catch (e) { 
                    console.error("Failed to initialize company settings page:", e);
                    setIsLoading(false); 
                }
            } else {
                setIsLoading(false);
            }
        });
        return () => unsubscribe();
    }, [searchParams, fetchAllCompaniesAndUsers, fetchSettingsData]);

    const handleSave = async () => {
        if (!editingTargetId || !editingEntityType) {
            toast({ title: "Error", description: "No se ha seleccionado una entidad para editar.", variant: "destructive" });
            return;
        }
        setIsSaving(true);
        const user = auth.currentUser;
        if (!user) {
            toast({ title: "No autenticado", variant: "destructive" });
            setIsSaving(false); return;
        }

        try {
            const token = await user.getIdToken();
            let finalData = { ...companyData };

            const newLogoPhoto = logoPhotos.find(p => p.file);
            if (newLogoPhoto?.file) {
                const formData = new FormData();
                formData.append('imagen', newLogoPhoto.file);
                const uploadResponse = await fetch('/api/upload-image', {
                    method: 'POST',
                    headers: { 'Authorization': `Bearer ${token}` },
                    body: formData,
                });
                if (!uploadResponse.ok) throw new Error('Fallo al subir el logo.');
                const imageData = await uploadResponse.json();
                finalData.logoUrl = imageData.url;
            } else if (logoPhotos.length === 0) {
                finalData.logoUrl = null;
            }

            const payload: any = { data: finalData };
            
            if (editingEntityType === 'company') {
                 payload.companyId = editingTargetId;
            } else {
                payload.userId = editingTargetId;
            }
            
            const response = await fetch('/api/user-settings/company', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
                body: JSON.stringify(payload)
            });
            if (!response.ok) throw new Error((await response.json()).error || "Fallo al guardar los datos.");
            
            toast({ title: "Datos Guardados", description: `La información ha sido actualizada.` });
            if (editingTargetId) fetchSettingsData(user, editingEntityType, editingTargetId);
        } catch (error: any) {
            toast({ title: "Error al Guardar", description: error.message, variant: "destructive" });
        } finally {
            setIsSaving(false);
        }
    };

    const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        setCompanyData(prev => ({ ...prev, [e.target.name]: e.target.value }));
    };

    const editingTargetPlatform = useMemo(() => {
        if (!editingEntityType || !editingTargetId) return null;

        if (editingEntityType === 'company') {
            return allCompanies.find(c => c.id === editingTargetId)?.platform || null;
        }
        
        let targetUserId = editingTargetId;
        const user = allCompanies.flatMap(c => (c as any).users || []).find((u: AppUser) => u.uid === targetUserId) ||
                     unassignedUsers.find(u => u.uid === targetUserId) ||
                     (currentUser?.uid === targetUserId ? (currentUser as any) : null);
        
        return user?.platform || null;
    }, [editingEntityType, editingTargetId, allCompanies, unassignedUsers, currentUser]);


    const renderContent = () => {
        if (isLoading) {
            return <Skeleton className="h-96 w-full" />;
        }
        if (!editingTargetId) {
            return (
                <Alert>
                    <Building className="h-4 w-4" />
                    <AlertTitle>No hay una entidad seleccionada</AlertTitle>
                    <AlertDescription>
                        {currentUser?.role === 'super_admin' 
                            ? "Por favor, selecciona una empresa o usuario de la lista para editar sus datos." 
                            : "Tu cuenta de administrador no está asignada a ninguna empresa. Un Super Admin debe asignarte a una para que puedas editar estos datos."}
                    </AlertDescription>
                </Alert>
            )
        }

        const isCompany = editingEntityType === 'company';
        const generalInfoTitle = isCompany ? 'Información General y Fiscal' : 'Información de Contacto y Facturación';
        const nameLabel = isCompany ? 'Nombre de la Empresa' : 'Nombre de Usuario / Razón Social';
        const taxLabel = isCompany ? 'NIF/CIF (Tax ID)' : 'NIF/CIF (Opcional)';
        const addressLabel = isCompany ? 'Dirección Fiscal' : 'Dirección (Opcional)';
        
        const canEditCompanyName = currentUser?.role === 'super_admin' && isCompany;
        const canEditUserName = !isCompany;

        return (
            <div className="space-y-6">
                <Card>
                    <CardHeader><CardTitle>{generalInfoTitle}</CardTitle></CardHeader>
                    <CardContent className="space-y-6">
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                            <div>
                                <Label htmlFor="name">{nameLabel}</Label>
                                <Input id="name" name="name" value={companyData.name || ''} onChange={handleInputChange} placeholder="Ej: Mi Gran Empresa S.L." disabled={isSaving || (!canEditCompanyName && !canEditUserName)} />
                                {!canEditCompanyName && isCompany && <p className="text-xs text-muted-foreground mt-1">Solo un Super Admin puede cambiar el nombre de la empresa.</p>}
                            </div>
                           {currentUser?.role === 'super_admin' && (
                               <div>
                                    <Label htmlFor="platform">Plataforma Principal</Label>
                                    <Select 
                                        name="platform" 
                                        value={companyData.platform || 'woocommerce'} 
                                        onValueChange={(value) => setCompanyData(prev => ({...prev, platform: value as any}))}
                                        disabled={isSaving}
                                    >
                                        <SelectTrigger id="platform"><SelectValue /></SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value="woocommerce">WordPress / WooCommerce</SelectItem>
                                            <SelectItem value="shopify">Shopify</SelectItem>
                                        </SelectContent>
                                    </Select>
                                </div>
                            )}
                        </div>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                            <div>
                                <Label htmlFor="taxId">{taxLabel}</Label>
                                <Input id="taxId" name="taxId" value={companyData.taxId || ''} onChange={handleInputChange} placeholder="Ej: B12345678" disabled={isSaving} />
                            </div>
                            <div>
                                <Label htmlFor="address">{addressLabel}</Label>
                                <Input id="address" name="address" value={companyData.address || ''} onChange={handleInputChange} placeholder="Ej: Calle Principal 123, 28001 Madrid, España" disabled={isSaving} />
                            </div>
                        </div>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                            <div>
                                <Label htmlFor="phone">Teléfono de Contacto</Label>
                                <Input id="phone" name="phone" value={companyData.phone || ''} onChange={handleInputChange} placeholder="Ej: +34 910 000 000" disabled={isSaving} />
                            </div>
                            <div>
                                <Label htmlFor="email">Email de Contacto</Label>
                                <Input id="email" name="email" type="email" value={companyData.email || ''} onChange={handleInputChange} placeholder="Ej: contacto@empresa.com" disabled={isSaving} />
                            </div>
                        </div>
                         {currentUser?.role === 'super_admin' && (
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                <div>
                                    <Label htmlFor="seoHourlyRate" className="flex items-center gap-2"><DollarSign className="h-4 w-4" />Precio Hora SEO (€)</Label>
                                    <Input id="seoHourlyRate" name="seoHourlyRate" type="number" value={companyData.seoHourlyRate || ''} onChange={handleInputChange} placeholder="10" disabled={isSaving} />
                                    <p className="text-xs text-muted-foreground mt-1">Este valor se usará por defecto en el Planificador de Publicidad.</p>
                                </div>
                            </div>
                        )}
                    </CardContent>
                </Card>
                
                {editingTargetPlatform === 'shopify' && (
                    <Card>
                        <CardHeader>
                            <CardTitle>Automatización de Shopify</CardTitle>
                            <CardDescription>Define los ajustes por defecto para la creación de nuevas tiendas Shopify.</CardDescription>
                        </CardHeader>
                        <CardContent className="space-y-4">
                            <div className="flex items-center space-x-2">
                                <Checkbox
                                    id="create-products-default"
                                    checked={companyData.shopifyCreationDefaults?.createProducts ?? true}
                                    onCheckedChange={(checked) => setCompanyData(prev => ({
                                        ...prev,
                                        shopifyCreationDefaults: {
                                            ...(prev.shopifyCreationDefaults || { theme: '' }),
                                            createProducts: !!checked,
                                        }
                                    }))}
                                    disabled={isSaving}
                                />
                                <Label htmlFor="create-products-default" className="text-sm font-normal cursor-pointer">
                                    Crear productos de ejemplo por defecto en nuevas tiendas Shopify
                                </Label>
                            </div>
                            <p className="text-xs text-muted-foreground mt-1 pl-6">
                                Si se desmarca, no se crearán productos aunque el solicitante (ej. el chatbot) lo pida.
                            </p>

                            <div className="pt-4 border-t">
                               <Label htmlFor="shopify-theme">Plantilla de Tema por Defecto</Label>
                                <Select
                                    value={companyData.shopifyCreationDefaults?.theme || '__default__'}
                                    onValueChange={(value) => {
                                        const newTheme = value === '__default__' ? '' : value;
                                        setCompanyData(prev => ({
                                            ...prev,
                                            shopifyCreationDefaults: {
                                                ...(prev.shopifyCreationDefaults || { createProducts: true }),
                                                theme: newTheme,
                                            }
                                        }));
                                    }}
                                    disabled={isSaving}
                                >
                                    <SelectTrigger id="shopify-theme">
                                        <SelectValue placeholder="Tema por defecto de Shopify..." />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="__default__">Tema por defecto de Shopify</SelectItem>
                                        <SelectSeparator />
                                        {SHOPIFY_THEMES.map((theme) => (
                                            <SelectItem key={theme.value} value={theme.value}>
                                                {theme.label}
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                                 <p className="text-xs text-muted-foreground mt-1">La plantilla seleccionada se instalará al crear una nueva tienda de desarrollo.</p>
                            </div>
                        </CardContent>
                    </Card>
                )}

                <Card>
                    <CardHeader><CardTitle>Logo</CardTitle></CardHeader>
                    <CardContent>
                        <ImageUploader
                            photos={logoPhotos}
                            onPhotosChange={setLogoPhotos}
                            isProcessing={isSaving}
                            maxPhotos={1}
                        />
                    </CardContent>
                </Card>
                <div className="flex justify-end">
                    <Button onClick={handleSave} disabled={isSaving || isLoading}>
                        {isSaving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
                        Guardar Cambios
                    </Button>
                </div>
            </div>
        );
    };
    
    const pageTitle = editingEntityType === 'company' ? 'Datos de la Empresa' : 'Datos de Cuenta';
    const pageDescription = editingEntityType === 'company' ? 'Gestiona la información fiscal, de contacto y el logo de la empresa.' : 'Gestiona tus datos de contacto y logo. Estos datos pueden usarse en informes y facturas.';

    return (
        <div className="container mx-auto py-8 space-y-6">
            <Card>
                <CardHeader>
                    <div className="flex items-center space-x-3">
                        <Building className="h-8 w-8 text-primary" />
                        <div>
                            <CardTitle>{pageTitle}</CardTitle>
                            <CardDescription>{pageDescription}</CardDescription>
                        </div>
                    </div>
                </CardHeader>
            </Card>

            {currentUser?.role === 'super_admin' && (
                <Card>
                    <CardHeader><CardTitle>Selector de Entidad</CardTitle></CardHeader>
                    <CardContent>
                        <Label>Selecciona qué entidad deseas editar</Label>
                        <Select value={`${editingEntityType}:${editingTargetId}`} onValueChange={handleTargetSelection}>
                            <SelectTrigger><SelectValue placeholder="Elige una entidad..." /></SelectTrigger>
                            <SelectContent>
                                {allCompanies.map(company => (
                                    <SelectItem key={company.id} value={`company:${company.id}`}><Building className="inline-block mr-2 h-4 w-4" />{company.name}</SelectItem>
                                ))}
                                {unassignedUsers.length > 0 && <SelectSeparator />}
                                {unassignedUsers.map(u => (
                                    <SelectItem key={u.uid} value={`user:${u.uid}`}><User className="inline-block mr-2 h-4 w-4" />{u.displayName} (Sin Empresa)</SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </CardContent>
                </Card>
            )}

            {renderContent()}
        </div>
    );
}
