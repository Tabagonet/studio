
"use client";

import React, { useState, useEffect, useCallback } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Loader2, Save, Building, Users } from "lucide-react";
import { useToast } from '@/hooks/use-toast';
import { auth, onAuthStateChanged, type FirebaseUser } from '@/lib/firebase';
import type { Company } from '@/lib/types';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

type EditableCompanyData = Omit<Company, 'id' | 'createdAt' | 'userCount'>;

const INITIAL_COMPANY_DATA: EditableCompanyData = {
    name: '',
    logoUrl: '',
    taxId: '',
    address: '',
    phone: '',
    email: '',
};

export default function CompanySettingsPage() {
    const [companyData, setCompanyData] = useState<EditableCompanyData>(INITIAL_COMPANY_DATA);
    const [isLoading, setIsLoading] = useState(true);
    const [isSaving, setIsSaving] = useState(false);
    const { toast } = useToast();

    const [currentUser, setCurrentUser] = useState<{ role: string | null; companyId: string | null; } | null>(null);
    const [allCompanies, setAllCompanies] = useState<Company[]>([]);
    const [editingTargetId, setEditingTargetId] = useState<string | null>(null);

    const fetchAllCompaniesForSuperAdmin = useCallback(async (token: string) => {
        try {
            const response = await fetch('/api/admin/companies', {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            if (response.ok) {
                const data = await response.json();
                setAllCompanies(data.companies);
            }
        } catch (error) {
            console.error("Failed to fetch all companies:", error);
        }
    }, []);

    const fetchCompanyData = useCallback(async (user: FirebaseUser, companyId: string | null) => {
        setIsLoading(true);
        try {
            const token = await user.getIdToken();
            const url = new URL('/api/user-settings/company', window.location.origin);
            if (companyId) {
                url.searchParams.append('companyId', companyId);
            }
            
            const response = await fetch(url.toString(), {
                headers: { 'Authorization': `Bearer ${token}` }
            });

            if (response.ok) {
                const data = await response.json();
                setCompanyData(data.company || INITIAL_COMPANY_DATA);
            } else {
                 setCompanyData(INITIAL_COMPANY_DATA);
            }
        } catch (error) {
            console.error("Error fetching company data:", error);
            setCompanyData(INITIAL_COMPANY_DATA);
            toast({ title: "Error al Cargar Datos", description: "No se pudo obtener la información de la empresa.", variant: "destructive" });
        } finally {
            setIsLoading(false);
        }
    }, [toast]);
    
    useEffect(() => {
        const unsubscribe = onAuthStateChanged(auth, async (user: FirebaseUser | null) => {
            if (user) {
                try {
                    const token = await user.getIdToken();
                    const response = await fetch('/api/user/verify', { headers: { 'Authorization': `Bearer ${token}` } });
                    const userData = await response.json();
                    setCurrentUser(userData);

                    if (userData.role === 'super_admin') {
                        await fetchAllCompaniesForSuperAdmin(token);
                        // Default to editing own "company" (user_settings) if not otherwise set
                        if (!editingTargetId) {
                           setEditingTargetId(userData.uid);
                           fetchCompanyData(user, null);
                        } else {
                           fetchCompanyData(user, editingTargetId === userData.uid ? null : editingTargetId);
                        }
                    } else { // Regular admin
                        setEditingTargetId(userData.companyId);
                        fetchCompanyData(user, userData.companyId);
                    }
                } catch (e) {
                    setIsLoading(false);
                }
            } else {
                setIsLoading(false);
            }
        });
        return () => unsubscribe();
    }, [editingTargetId, fetchAllCompaniesForSuperAdmin, fetchCompanyData]);

    const handleSave = async () => {
        if (!editingTargetId) {
            toast({ title: "Error", description: "No se ha seleccionado una empresa para editar.", variant: "destructive" });
            return;
        }
        setIsSaving(true);
        const user = auth.currentUser;
        if (!user) {
            toast({ title: "No autenticado", variant: "destructive" });
            setIsSaving(false);
            return;
        }

        try {
            const token = await user.getIdToken();
            const payload = {
                companyId: (currentUser?.role === 'super_admin' && editingTargetId !== user.uid) ? editingTargetId : undefined,
                data: companyData,
            };

            const response = await fetch('/api/user-settings/company', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
                body: JSON.stringify(payload)
            });

            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.error || "Fallo al guardar los datos de la empresa.");
            }

            toast({ title: "Datos Guardados", description: `La información de la empresa ha sido actualizada.` });
        } catch (error: any) {
            toast({ title: "Error al Guardar", description: error.message, variant: "destructive" });
        } finally {
            setIsSaving(false);
        }
    };

    const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        setCompanyData(prev => ({ ...prev, [e.target.name]: e.target.value }));
    };

    return (
        <div className="container mx-auto py-8 space-y-6">
            <Card>
                <CardHeader>
                    <div className="flex items-center space-x-3">
                        <Building className="h-8 w-8 text-primary" />
                        <div>
                            <CardTitle>Datos de la Empresa</CardTitle>
                            <CardDescription>Gestiona la información fiscal, de contacto y el logo de tu empresa. Estos datos pueden usarse en informes y facturas.</CardDescription>
                        </div>
                    </div>
                </CardHeader>
            </Card>

            {currentUser?.role === 'super_admin' && (
                <Card>
                    <CardHeader><CardTitle>Selector de Entidad</CardTitle></CardHeader>
                    <CardContent>
                        <Label>Selecciona qué configuración de empresa deseas editar</Label>
                        <Select
                            value={editingTargetId || ''}
                            onValueChange={setEditingTargetId}
                        >
                            <SelectTrigger><SelectValue /></SelectTrigger>
                            <SelectContent>
                                <SelectItem value={currentUser.uid}><Users className="inline-block mr-2 h-4 w-4" />Mis Ajustes (Super Admin)</SelectItem>
                                {allCompanies.map(company => (
                                    <SelectItem key={company.id} value={company.id}><Building className="inline-block mr-2 h-4 w-4" />{company.name}</SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </CardContent>
                </Card>
            )}

            <Card>
                <CardHeader><CardTitle>Información General y Fiscal</CardTitle></CardHeader>
                <CardContent className="space-y-4">
                    {isLoading ? (
                        <div className="space-y-4">
                            <div className="h-10 bg-muted rounded-md animate-pulse"></div>
                            <div className="h-10 bg-muted rounded-md animate-pulse"></div>
                            <div className="h-10 bg-muted rounded-md animate-pulse"></div>
                        </div>
                    ) : (
                    <>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div>
                                <Label htmlFor="name">Nombre de la Empresa</Label>
                                <Input id="name" name="name" value={companyData.name || ''} onChange={handleInputChange} placeholder="Ej: Mi Gran Empresa S.L." disabled={isSaving || (currentUser?.role === 'admin')} />
                                {currentUser?.role === 'admin' && <p className="text-xs text-muted-foreground mt-1">Solo un Super Admin puede cambiar el nombre de la empresa.</p>}
                            </div>
                            <div>
                                <Label htmlFor="taxId">NIF/CIF (Tax ID)</Label>
                                <Input id="taxId" name="taxId" value={companyData.taxId || ''} onChange={handleInputChange} placeholder="Ej: B12345678" disabled={isSaving} />
                            </div>
                        </div>
                        <div>
                            <Label htmlFor="address">Dirección Fiscal</Label>
                            <Input id="address" name="address" value={companyData.address || ''} onChange={handleInputChange} placeholder="Ej: Calle Principal 123, 28001 Madrid, España" disabled={isSaving} />
                        </div>
                         <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div>
                                <Label htmlFor="phone">Teléfono de Contacto</Label>
                                <Input id="phone" name="phone" value={companyData.phone || ''} onChange={handleInputChange} placeholder="Ej: +34 910 000 000" disabled={isSaving} />
                            </div>
                            <div>
                                <Label htmlFor="email">Email de Contacto</Label>
                                <Input id="email" name="email" type="email" value={companyData.email || ''} onChange={handleInputChange} placeholder="Ej: contacto@empresa.com" disabled={isSaving} />
                            </div>
                        </div>
                         <div>
                            <Label htmlFor="logoUrl">URL del Logo</Label>
                            <Input id="logoUrl" name="logoUrl" value={companyData.logoUrl || ''} onChange={handleInputChange} placeholder="https://ejemplo.com/logo.png" disabled={isSaving} />
                            <p className="text-xs text-muted-foreground mt-1">Sube tu logo a tu WordPress y pega aquí la URL completa.</p>
                        </div>

                         <div className="flex justify-end pt-4">
                            <Button onClick={handleSave} disabled={isSaving || isLoading}>
                                {isSaving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
                                Guardar Datos
                            </Button>
                        </div>
                    </>
                    )}
                </CardContent>
            </Card>
        </div>
    );
}
