
"use client";

import React, { useState, useEffect, useCallback } from 'react';
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
import { useForm, FormProvider } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';


const companySchema = z.object({
    name: z.string().min(2, "El nombre de la empresa es obligatorio."),
    logoUrl: z.string().url().nullable().optional(),
    taxId: z.string().optional().nullable(),
    address: z.string().optional().nullable(),
    phone: z.string().optional().nullable(),
    email: z.string().email("Formato de email inválido.").or(z.literal('')).optional().nullable(),
    seoHourlyRate: z.preprocess(
        (val) => (val === "" || val === null || val === undefined ? undefined : parseFloat(String(val))),
        z.number().positive("El precio debe ser un número positivo.").optional().nullable()
    ),
    platform: z.enum(['woocommerce', 'shopify'], { required_error: 'Debes seleccionar una plataforma.' }),
    plan: z.enum(['lite', 'pro', 'agency'], { required_error: 'Debes seleccionar un plan.' }).nullable(),
    shopifyCreationDefaults: z.object({
        createProducts: z.boolean(),
        theme: z.string().optional(),
    }).optional(),
});

type CompanyFormData = z.infer<typeof companySchema>;

export default function CompanySettingsPage() {
    const searchParams = useSearchParams();
    const [logoPhotos, setLogoPhotos] = useState<ProductPhoto[]>([]);
    
    const [isLoading, setIsLoading] = useState(true);
    const [isSaving, setIsSaving] = useState(false);
    const { toast } = useToast();

    const [currentUser, setCurrentUser] = useState<{ uid: string | null; role: string | null; companyId: string | null; companyName: string | null; } | null>(null);
    const [allCompanies, setAllCompanies] = useState<Company[]>([]);
    const [unassignedUsers, setUnassignedUsers] = useState<AppUser[]>([]);
    const [editingTargetId, setEditingTargetId] = useState<string | null>(null);
    const [editingEntityType, setEditingEntityType] = useState<'user' | 'company' | null>(null);


    const form = useForm<CompanyFormData>({
        resolver: zodResolver(companySchema),
        defaultValues: {
            name: '',
            platform: 'woocommerce',
            plan: 'pro',
            logoUrl: null,
            taxId: '',
            address: '',
            phone: '',
            email: '',
            seoHourlyRate: 60,
            shopifyCreationDefaults: {
                createProducts: true,
                theme: '',
            },
        },
    });


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
            form.reset();
            setLogoPhotos([]);
            setIsLoading(false);
            return;
        }
        setIsLoading(true);
        try {
            const token = await user.getIdToken();
            
            let dataToSet: Partial<CompanyFormData>;
            let entityName = 'Usuario Desconocido';
            
            if (type === 'company') {
                const companyResponse = await fetch(`/api/user-settings/company?companyId=${id}`, { headers: { 'Authorization': `Bearer ${token}` } });
                const companyDetails = allCompanies.find(c => c.id === id);
                entityName = companyDetails?.name || 'Empresa Desconocida';
                const fetchedCompanyData = companyResponse.ok ? (await companyResponse.json()).company : {};
                dataToSet = { name: entityName, platform: companyDetails?.platform || 'woocommerce', ...fetchedCompanyData };

            } else { // type === 'user'
                 const userDocSnap = await fetch('/api/user/verify', { headers: { 'Authorization': `Bearer ${token}` } });
                 const userData = await userDocSnap.json();
                 entityName = userData?.displayName || 'Usuario Desconocido';
                 const userSettingsResponse = await fetch(`/api/user-settings/connections?userId=${id}`, { headers: { 'Authorization': `Bearer ${token}` } });
                 dataToSet = { name: entityName, platform: userData.platform, ...(userSettingsResponse.ok ? (await userSettingsResponse.json()).companyData : {}) };
            }
            
            form.reset(dataToSet);
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
    }, [toast, allCompanies, form]);
    
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

    const onSubmit = async (formData: CompanyFormData) => {
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
            let finalData: Partial<CompanyFormData> = { ...formData };

            const newLogoPhoto = logoPhotos.find(p => p.file);
            if (newLogoPhoto?.file) {
                const formImageData = new FormData();
                formImageData.append('imagen', newLogoPhoto.file);
                const uploadResponse = await fetch('/api/upload-image', {
                    method: 'POST',
                    headers: { 'Authorization': `Bearer ${token}` },
                    body: formImageData,
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
            <FormProvider {...form}>
                <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
                    <Card>
                        <CardHeader><CardTitle>{generalInfoTitle}</CardTitle></CardHeader>
                        <CardContent className="space-y-6">
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                <FormField
                                    control={form.control}
                                    name="name"
                                    render={({ field }) => (
                                        <FormItem>
                                            <FormLabel>{nameLabel}</FormLabel>
                                            <FormControl>
                                                <Input {...field} placeholder="Ej: Mi Gran Empresa S.L." disabled={isSaving || (!canEditCompanyName && !canEditUserName)} />
                                            </FormControl>
                                            {!canEditCompanyName && isCompany && <p className="text-xs text-muted-foreground mt-1">Solo un Super Admin puede cambiar el nombre de la empresa.</p>}
                                            <FormMessage />
                                        </FormItem>
                                    )}
                                />
                               {currentUser?.role === 'super_admin' && isCompany && (
                                   <FormField
                                        control={form.control}
                                        name="plan"
                                        render={({ field }) => (
                                            <FormItem>
                                                <FormLabel>Plan de Suscripción</FormLabel>
                                                <Select onValueChange={field.onChange} defaultValue={field.value || 'pro'} disabled={isSaving}>
                                                    <FormControl>
                                                        <SelectTrigger><SelectValue /></SelectTrigger>
                                                    </FormControl>
                                                    <SelectContent>
                                                        <SelectItem value="lite">Lite (29€/mes)</SelectItem>
                                                        <SelectItem value="pro">Pro (49€/mes)</SelectItem>
                                                        <SelectItem value="agency">Agency (99€/mes)</SelectItem>
                                                    </SelectContent>
                                                </Select>
                                                <FormMessage />
                                            </FormItem>
                                        )}
                                   />
                                )}
                            </div>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                <FormField control={form.control} name="taxId" render={({ field }) => (<FormItem><FormLabel>{taxLabel}</FormLabel><FormControl><Input {...field} placeholder="Ej: B12345678" disabled={isSaving} /></FormControl><FormMessage /></FormItem>)} />
                                <FormField control={form.control} name="address" render={({ field }) => (<FormItem><FormLabel>{addressLabel}</FormLabel><FormControl><Input {...field} placeholder="Ej: Calle Principal 123, 28001 Madrid, España" disabled={isSaving} /></FormControl><FormMessage /></FormItem>)} />
                            </div>
                             <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                <FormField control={form.control} name="phone" render={({ field }) => (<FormItem><FormLabel>Teléfono de Contacto</FormLabel><FormControl><Input {...field} placeholder="Ej: +34 910 000 000" disabled={isSaving} /></FormControl><FormMessage /></FormItem>)} />
                                <FormField control={form.control} name="email" render={({ field }) => (<FormItem><FormLabel>Email de Contacto</FormLabel><FormControl><Input type="email" {...field} placeholder="Ej: contacto@empresa.com" disabled={isSaving} /></FormControl><FormMessage /></FormItem>)} />
                            </div>
                             {currentUser?.role === 'super_admin' && (
                                <FormField control={form.control} name="seoHourlyRate" render={({ field }) => (
                                    <FormItem>
                                        <FormLabel className="flex items-center gap-2"><DollarSign className="h-4 w-4" />Precio Hora SEO (€)</FormLabel>
                                        <FormControl>
                                             <Input type="number" {...field} placeholder="60" disabled={isSaving} />
                                        </FormControl>
                                        <p className="text-xs text-muted-foreground">Este valor se usará por defecto en el Planificador de Publicidad.</p>
                                        <FormMessage />
                                    </FormItem>
                                )}/>
                            )}
                        </CardContent>
                    </Card>
                    
                    {form.getValues('platform') === 'shopify' && (
                        <Card>
                            <CardHeader>
                                <CardTitle>Automatización de Shopify</CardTitle>
                                <CardDescription>Define los ajustes por defecto para la creación de nuevas tiendas Shopify.</CardDescription>
                            </CardHeader>
                            <CardContent className="space-y-4">
                                <FormField control={form.control} name="shopifyCreationDefaults.createProducts" render={({ field }) => (
                                    <FormItem className="flex items-center space-x-2">
                                        <FormControl><Checkbox checked={field.value} onCheckedChange={field.onChange} disabled={isSaving} /></FormControl>
                                        <Label htmlFor="create-products-default" className="text-sm font-normal cursor-pointer">
                                            Crear productos de ejemplo por defecto en nuevas tiendas Shopify
                                        </Label>
                                        <FormMessage />
                                    </FormItem>
                                )}/>
                                <p className="text-xs text-muted-foreground mt-1 pl-6">
                                    Si se desmarca, no se crearán productos aunque el solicitante (ej. el chatbot) lo pida.
                                </p>
                                <FormField control={form.control} name="shopifyCreationDefaults.theme" render={({ field }) => (
                                     <FormItem className="pt-4 border-t">
                                        <FormLabel>Handle de la Plantilla de Tema</FormLabel>
                                        <FormControl><Input {...field} placeholder="Ej: dawn, refresh, taste" disabled={isSaving} /></FormControl>
                                        <p className="text-xs text-muted-foreground mt-1">
                                          Introduce el identificador del tema (ej. 'dawn'). Esto se usa principalmente para temas gratuitos. La instalación de temas de pago no está soportada por la API de creación de tiendas de Shopify.
                                        </p>
                                        <FormMessage />
                                    </FormItem>
                                )}/>
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
                        <Button type="submit" disabled={isSaving || isLoading}>
                            {isSaving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
                            Guardar Cambios
                        </Button>
                    </div>
                </form>
            </FormProvider>
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
