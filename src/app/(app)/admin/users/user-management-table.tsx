
"use client";

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useToast } from '@/hooks/use-toast';
import { auth } from '@/lib/firebase';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button, buttonVariants } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Loader2, UserCheck, UserX, MoreHorizontal, Trash2, Shield, User, KeyRound, Briefcase, BarChart, FileSignature, BookCopy, Search, Building } from 'lucide-react';
import Image from 'next/image';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger, DropdownMenuSub, DropdownMenuSubTrigger, DropdownMenuSubContent, DropdownMenuPortal } from '@/components/ui/dropdown-menu';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog';
import { cn } from '@/lib/utils';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import type { Company } from '@/lib/types';

type UserRole = 'super_admin' | 'admin' | 'content_manager' | 'product_manager' | 'seo_analyst' | 'pending' | 'user';

const ROLE_NAMES: Record<UserRole, string> = {
    super_admin: 'Super Admin',
    admin: 'Administrador',
    content_manager: 'Gestor de Contenido',
    product_manager: 'Gestor de Productos',
    seo_analyst: 'Analista SEO',
    pending: 'Pendiente',
    user: 'Usuario (obsoleto)',
};

interface User {
  uid: string;
  email: string;
  displayName: string;
  photoURL: string;
  role: UserRole;
  status: 'active' | 'rejected' | 'pending_approval';
  siteLimit: number;
  companyId: string | null;
  companyName: string | null;
}

type GroupedUsers = {
    companyName: string;
    users: User[];
}

export function UserManagementTable() {
    const [users, setUsers] = useState<User[]>([]);
    const [companies, setCompanies] = useState<Company[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [isUpdating, setIsUpdating] = useState<string | null>(null);
    const { toast } = useToast();
    const currentAdmin = auth.currentUser;
    const [currentUserRole, setCurrentUserRole] = useState<string | null>(null);
    
    // State for site limit modal
    const [isLimitModalOpen, setIsLimitModalOpen] = useState(false);
    const [selectedUserForLimit, setSelectedUserForLimit] = useState<User | null>(null);
    const [newSiteLimit, setNewSiteLimit] = useState<number | string>('');

    const fetchUsersAndCompanies = useCallback(async () => {
        setIsLoading(true);
        const user = auth.currentUser;
        if (!user) {
            toast({ title: "No autenticado", variant: "destructive" });
            setIsLoading(false);
            return;
        }

        try {
            const token = await user.getIdToken();
            const [usersResponse, verifyResponse, companiesResponse] = await Promise.all([
                fetch('/api/admin/users', { headers: { 'Authorization': `Bearer ${token}` } }),
                fetch('/api/user/verify', { headers: { 'Authorization': `Bearer ${token}` } }),
                fetch('/api/admin/companies', { headers: { 'Authorization': `Bearer ${token}` } })
            ]);

            if (!usersResponse.ok) {
                const errorData = await usersResponse.json();
                throw new Error(errorData.error || 'Failed to fetch users.');
            }
            if(verifyResponse.ok) {
                const userData = await verifyResponse.json();
                setCurrentUserRole(userData.role);
            }
            if (companiesResponse.ok) {
                const companyData = await companiesResponse.json();
                setCompanies(companyData.companies);
            }

            const data = await usersResponse.json();
            setUsers(data.users);

        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            toast({ title: "Error al Cargar Datos", description: errorMessage, variant: "destructive" });
        } finally {
            setIsLoading(false);
        }
    }, [toast]);

    useEffect(() => {
        const unsubscribe = auth.onAuthStateChanged((user) => {
            if (user) {
                fetchUsersAndCompanies();
            } else {
                setIsLoading(false);
                setUsers([]);
                setCompanies([]);
            }
        });
        return () => unsubscribe();
    }, [fetchUsersAndCompanies]);
    
    const performApiCall = async (url: string, method: string, body: any, successMessage: string) => {
        const user = auth.currentUser;
        if (!user) {
            toast({ title: "No autenticado", variant: "destructive" });
            return false;
        }
        try {
            const token = await user.getIdToken();
            const response = await fetch(url, {
                method,
                headers: { 
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}` 
                },
                body: JSON.stringify(body)
            });
            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.error || 'La operación falló.');
            }
            toast({ title: "Éxito", description: successMessage });
            fetchUsersAndCompanies();
            return true;
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            toast({ title: "Error en la Operación", description: errorMessage, variant: "destructive" });
            return false;
        }
    };
    
    const handleUpdateStatus = async (targetUid: string, newStatus: 'active' | 'rejected') => {
        setIsUpdating(targetUid);
        await performApiCall(
            `/api/admin/users/${targetUid}/update-status`, 
            'POST', 
            { status: newStatus },
            "El estado del usuario ha sido actualizado."
        );
        setIsUpdating(null);
    };

    const handleUpdateRole = async (targetUid: string, newRole: UserRole) => {
        setIsUpdating(targetUid);
        await performApiCall(
            `/api/admin/users/${targetUid}/update-role`,
            'POST',
            { role: newRole },
            "El rol del usuario ha sido actualizado."
        );
        setIsUpdating(null);
    };
    
    const handleAssignCompany = async (targetUid: string, companyId: string) => {
        setIsUpdating(targetUid);
        await performApiCall(
            `/api/admin/users/${targetUid}/assign-company`,
            'POST',
            { companyId },
            "El usuario ha sido asignado a la empresa."
        );
        setIsUpdating(null);
    };

    const handleUpdateSiteLimit = async () => {
        if (!selectedUserForLimit || newSiteLimit === '' || Number(newSiteLimit) < 0) {
            toast({ title: 'Valor inválido', description: 'Por favor, introduce un número válido para el límite.', variant: 'destructive'});
            return;
        }
        setIsUpdating(selectedUserForLimit.uid);
        const success = await performApiCall(
            `/api/admin/users/${selectedUserForLimit.uid}/update-site-limit`,
            'POST',
            { siteLimit: Number(newSiteLimit) },
            `El límite de sitios para ${selectedUserForLimit.displayName} ha sido actualizado.`
        );
        setIsUpdating(null);
        if(success) {
             setIsLimitModalOpen(false);
             setSelectedUserForLimit(null);
             setNewSiteLimit('');
        }
    };

    const handleDeleteUser = async (targetUid: string) => {
        setIsUpdating(targetUid);
        const user = auth.currentUser;
        if (!user) {
            toast({ title: "No autenticado", variant: "destructive" });
            setIsUpdating(null);
            return;
        }
        try {
            const token = await user.getIdToken();
            const response = await fetch(`/api/admin/users/${targetUid}`, {
                method: 'DELETE',
                headers: { 'Authorization': `Bearer ${token}` }
            });
            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.error || 'La operación falló.');
            }
            toast({ title: "Éxito", description: "El usuario ha sido eliminado." });
            fetchUsersAndCompanies();
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            toast({ title: "Error al Eliminar", description: errorMessage, variant: "destructive" });
        } finally {
            setIsUpdating(null);
        }
    };

    const getStatusBadge = (status: User['status']) => {
        switch (status) {
            case 'active': return <Badge variant="default" className="bg-green-600 hover:bg-green-700">Activo</Badge>;
            case 'pending_approval': return <Badge variant="secondary" className="bg-amber-500 hover:bg-amber-600 text-white">Pendiente</Badge>;
            case 'rejected': return <Badge variant="destructive">Rechazado/Suspendido</Badge>;
            default: return <Badge variant="outline">{status}</Badge>;
        }
    };
    
    const groupedUsers = useMemo((): GroupedUsers[] => {
        if (!users || users.length === 0) return [];
        
        const groups: Record<string, User[]> = {};
        
        users.forEach(user => {
            const companyKey = user.companyName || 'Sin Empresa Asignada';
            if (!groups[companyKey]) {
                groups[companyKey] = [];
            }
            groups[companyKey].push(user);
        });

        return Object.entries(groups).map(([companyName, users]) => ({
            companyName,
            users: users.sort((a,b) => a.displayName.localeCompare(b.displayName))
        })).sort((a,b) => {
            if (a.companyName === 'Sin Empresa Asignada') return 1;
            if (b.companyName === 'Sin Empresa Asignada') return -1;
            return a.companyName.localeCompare(b.companyName);
        });
    }, [users]);
    
    if (isLoading) {
        return (
            <div className="flex justify-center items-center h-64 border rounded-md">
                <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                <p className="ml-3 text-muted-foreground">Cargando usuarios...</p>
            </div>
        );
    }
    
    return (
        <div className="rounded-md border">
            <AlertDialog open={isLimitModalOpen} onOpenChange={setIsLimitModalOpen}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>Establecer Límite de Sitios</AlertDialogTitle>
                        <AlertDialogDescription>
                            Define cuántos perfiles de conexión puede guardar este usuario. Usa un número alto (ej. 999) para "ilimitado".
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <div className="py-4">
                        <Label htmlFor="site-limit-input">Límite de Sitios para {selectedUserForLimit?.displayName}</Label>
                        <Input
                            id="site-limit-input"
                            type="number"
                            min="0"
                            value={newSiteLimit}
                            onChange={(e) => setNewSiteLimit(e.target.value)}
                            placeholder="Ej: 5"
                        />
                    </div>
                    <AlertDialogFooter>
                        <AlertDialogCancel onClick={() => { setSelectedUserForLimit(null); setNewSiteLimit(''); }}>Cancelar</AlertDialogCancel>
                        <AlertDialogAction onClick={handleUpdateSiteLimit} disabled={isUpdating === selectedUserForLimit?.uid}>
                             {isUpdating === selectedUserForLimit?.uid && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                             Guardar Límite
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>

            <Table>
                <TableHeader>
                    <TableRow>
                        <TableHead className="w-[300px]">Usuario</TableHead>
                        <TableHead>Email</TableHead>
                        <TableHead>Rol</TableHead>
                        <TableHead>Límite Sitios</TableHead>
                        <TableHead>Estado</TableHead>
                        <TableHead className="text-right w-[100px]">Acciones</TableHead>
                    </TableRow>
                </TableHeader>
                <TableBody>
                    {groupedUsers.length > 0 ? groupedUsers.map((group) => (
                        <React.Fragment key={group.companyName}>
                            <TableRow className="bg-muted/50 hover:bg-muted/50">
                                <TableCell colSpan={6} className="py-3 text-lg font-semibold text-primary">
                                    <div className="flex items-center gap-2">
                                        <Building className="h-5 w-5" />
                                        {group.companyName}
                                    </div>
                                </TableCell>
                            </TableRow>
                            {group.users.map((u) => (
                                <TableRow key={u.uid} className={cn(isUpdating === u.uid && "opacity-50")}>
                                    <TableCell>
                                        <div className="flex items-center gap-3">
                                            <Image src={u.photoURL || `https://placehold.co/40x40.png`} alt={u.displayName} width={32} height={32} className="rounded-full" />
                                            <span className="font-medium">{u.displayName}</span>
                                        </div>
                                    </TableCell>
                                    <TableCell className="text-muted-foreground">{u.email}</TableCell>
                                    <TableCell>
                                        <Badge variant="outline" className="capitalize">
                                            {ROLE_NAMES[u.role] || u.role}
                                        </Badge>
                                    </TableCell>
                                    <TableCell className="text-center font-medium">
                                        {u.siteLimit >= 999 ? 'Ilimitado' : u.siteLimit}
                                    </TableCell>
                                    <TableCell>{getStatusBadge(u.status)}</TableCell>
                                    <TableCell className="text-right">
                                        {isUpdating === u.uid ? (
                                            <div className="flex justify-end items-center h-8">
                                                <Loader2 className="h-5 w-5 animate-spin" />
                                            </div>
                                        ) : (
                                            <AlertDialog>
                                                <DropdownMenu>
                                                    <DropdownMenuTrigger asChild>
                                                        <Button variant="ghost" className="h-8 w-8 p-0" disabled={u.uid === currentAdmin?.uid || u.role === 'super_admin'}>
                                                            <span className="sr-only">Abrir menú</span>
                                                            <MoreHorizontal className="h-4 w-4" />
                                                        </Button>
                                                    </DropdownMenuTrigger>
                                                    <DropdownMenuContent align="end">
                                                        <DropdownMenuLabel>Acciones</DropdownMenuLabel>
                                                        <DropdownMenuSeparator />
                                                        {u.status === 'pending_approval' && (
                                                            <>
                                                                <DropdownMenuItem onSelect={() => handleUpdateStatus(u.uid, 'active')}>
                                                                    <UserCheck className="mr-2 h-4 w-4" /> Aprobar
                                                                </DropdownMenuItem>
                                                                <DropdownMenuItem onSelect={() => handleUpdateStatus(u.uid, 'rejected')} className="text-destructive focus:text-destructive">
                                                                    <UserX className="mr-2 h-4 w-4" /> Rechazar
                                                                </DropdownMenuItem>
                                                            </>
                                                        )}
                                                        {u.status === 'active' && (
                                                            <>
                                                                {currentUserRole === 'super_admin' && (
                                                                    <>
                                                                        <DropdownMenuItem onSelect={() => { setSelectedUserForLimit(u); setNewSiteLimit(u.siteLimit); setIsLimitModalOpen(true); }}>
                                                                            <KeyRound className="mr-2 h-4 w-4" /> Fijar Límite de Sitios
                                                                        </DropdownMenuItem>
                                                                        <DropdownMenuSub>
                                                                            <DropdownMenuSubTrigger>
                                                                                <Building className="mr-2 h-4 w-4" /> Asignar a Empresa
                                                                            </DropdownMenuSubTrigger>
                                                                            <DropdownMenuPortal>
                                                                                <DropdownMenuSubContent>
                                                                                    {companies.map(company => (
                                                                                        <DropdownMenuItem key={company.id} onSelect={() => handleAssignCompany(u.uid, company.id)}>
                                                                                            {company.name}
                                                                                        </DropdownMenuItem>
                                                                                    ))}
                                                                                    {companies.length === 0 && <DropdownMenuItem disabled>No hay empresas creadas</DropdownMenuItem>}
                                                                                </DropdownMenuSubContent>
                                                                            </DropdownMenuPortal>
                                                                        </DropdownMenuSub>
                                                                        <DropdownMenuSeparator />
                                                                    </>
                                                                )}
                                                                
                                                                <DropdownMenuSub>
                                                                    <DropdownMenuSubTrigger>
                                                                        <Briefcase className="mr-2 h-4 w-4" /> Cambiar Rol
                                                                    </DropdownMenuSubTrigger>
                                                                    <DropdownMenuPortal>
                                                                        <DropdownMenuSubContent>
                                                                            {currentUserRole === 'super_admin' && (
                                                                                <DropdownMenuItem onSelect={() => handleUpdateRole(u.uid, 'admin')}><Shield className="mr-2 h-4 w-4" /> Administrador</DropdownMenuItem>
                                                                            )}
                                                                            <DropdownMenuItem onSelect={() => handleUpdateRole(u.uid, 'content_manager')}><FileSignature className="mr-2 h-4 w-4" /> Gestor de Contenido</DropdownMenuItem>
                                                                            <DropdownMenuItem onSelect={() => handleUpdateRole(u.uid, 'product_manager')}><BookCopy className="mr-2 h-4 w-4" /> Gestor de Productos</DropdownMenuItem>
                                                                            <DropdownMenuItem onSelect={() => handleUpdateRole(u.uid, 'seo_analyst')}><Search className="mr-2 h-4 w-4" /> Analista SEO</DropdownMenuItem>
                                                                        </DropdownMenuSubContent>
                                                                    </DropdownMenuPortal>
                                                                </DropdownMenuSub>

                                                                <DropdownMenuItem onSelect={() => handleUpdateStatus(u.uid, 'rejected')} className="text-destructive focus:text-destructive">
                                                                  <UserX className="mr-2 h-4 w-4" /> Suspender
                                                                </DropdownMenuItem>
                                                            </>
                                                        )}
                                                        <DropdownMenuSeparator />
                                                        <AlertDialogTrigger asChild>
                                                            <DropdownMenuItem className="text-destructive focus:text-destructive">
                                                                <Trash2 className="mr-2 h-4 w-4" /> Eliminar
                                                            </DropdownMenuItem>
                                                        </AlertDialogTrigger>
                                                    </DropdownMenuContent>
                                                </DropdownMenu>
                                                <AlertDialogContent>
                                                    <AlertDialogHeader>
                                                        <AlertDialogTitle>¿Estás absolutamente seguro?</AlertDialogTitle>
                                                        <AlertDialogDescription>
                                                            Esta acción no se puede deshacer. Se eliminará permanentemente al usuario <strong>{u.displayName}</strong> y todos sus datos.
                                                        </AlertDialogDescription>
                                                    </AlertDialogHeader>
                                                    <AlertDialogFooter>
                                                        <AlertDialogCancel>Cancelar</AlertDialogCancel>
                                                        <AlertDialogAction onClick={() => handleDeleteUser(u.uid)} className={buttonVariants({ variant: "destructive" })}>
                                                            Sí, eliminar usuario
                                                        </AlertDialogAction>
                                                    </AlertDialogFooter>
                                                </AlertDialogContent>
                                            </AlertDialog>
                                        )}
                                    </TableCell>
                                </TableRow>
                            ))}
                        </React.Fragment>
                    )) : (
                        <TableRow>
                            <TableCell colSpan={6} className="h-24 text-center">
                                No se encontraron usuarios.
                            </TableCell>
                        </TableRow>
                    )}
                </TableBody>
            </Table>
        </div>
    );
}
