
"use client";

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useToast } from '@/hooks/use-toast';
import { auth, onAuthStateChanged } from '@/lib/firebase';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button, buttonVariants } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Loader2, UserCheck, UserX, MoreHorizontal, Trash2, Shield, User, Briefcase, Building, Store, BrainCircuit } from 'lucide-react';
import Image from 'next/image';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger, DropdownMenuSub, DropdownMenuSubTrigger, DropdownMenuSubContent, DropdownMenuPortal } from '@/components/ui/dropdown-menu';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog';
import { cn } from '@/lib/utils';
import { Label } from '@/components/ui/label';
import type { Company, User as AppUser, PlanUsage } from '@/lib/types';
import { ShopifyIcon } from '@/components/core/icons';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { deleteUserAction, addCreditsAction } from './actions';
import { Input } from '@/components/ui/input';


type UserRole = 'super_admin' | 'admin' | 'content_manager' | 'product_manager' | 'seo_analyst' | 'pending' | 'user';
type UserPlatform = 'woocommerce' | 'shopify';
type UserPlan = 'lite' | 'pro' | 'agency';

const ROLE_NAMES: Record<UserRole, string> = {
    super_admin: 'Super Admin',
    admin: 'Administrador',
    content_manager: 'Gestor de Contenido',
    product_manager: 'Gestor de Productos',
    seo_analyst: 'Analista SEO',
    pending: 'Pendiente',
    user: 'Usuario (obsoleto)',
};

interface Plan {
    id: UserPlan;
    sites: number;
    [key: string]: any;
}

interface User extends AppUser {
  plan?: UserPlan | null;
  siteLimitFromPlan?: number | null;
}

type GroupedUsers = {
    companyName: string;
    users: User[];
}

interface AddCreditsDialogState {
    open: boolean;
    entityType: 'user' | 'company';
    entityId: string;
    entityName: string;
}

export function UserManagementTable({ onDataChange }: { onDataChange: () => void }) {
    const [users, setUsers] = useState<User[]>([]);
    const [companies, setCompanies] = useState<Company[]>([]);
    const [plans, setPlans] = useState<Plan[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [isUpdating, setIsUpdating] = useState<string | null>(null);
    const { toast } = useToast();
    const currentAdmin = auth.currentUser;
    const [currentUserRole, setCurrentUserRole] = useState<string | null>(null);
    
    // State for plan modal
    const [isPlanModalOpen, setIsPlanModalOpen] = useState(false);
    const [selectedUserForPlan, setSelectedUserForPlan] = useState<User | null>(null);
    const [newUserPlan, setNewUserPlan] = useState<UserPlan | ''>('');

    // State for credits modal
    const [addCreditsDialog, setAddCreditsDialog] = useState<AddCreditsDialogState>({ open: false, entityId: '', entityName: '', entityType: 'user' });
    const [creditsToAdd, setCreditsToAdd] = useState('');
    const [isAddingCredits, setIsAddingCredits] = useState(false);


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
            const [usersResponse, verifyResponse, companiesResponse, plansResponse] = await Promise.all([
                fetch('/api/admin/users', { headers: { 'Authorization': `Bearer ${token}` } }),
                fetch('/api/user/verify', { headers: { 'Authorization': `Bearer ${token}` } }),
                fetch('/api/admin/companies', { headers: { 'Authorization': `Bearer ${token}` } }),
                fetch('/api/settings/plans', { headers: { 'Authorization': `Bearer ${token}` } })
            ]);

            if (!usersResponse.ok) throw new Error((await usersResponse.json()).error || 'Failed to fetch users.');
            if(verifyResponse.ok) setCurrentUserRole((await verifyResponse.json()).role);
            if(companiesResponse.ok) setCompanies((await companiesResponse.json()).companies);
            if(plansResponse.ok) setPlans((await plansResponse.json()).plans);
            
            const usersData = (await usersResponse.json()).users;
            setUsers(usersData);

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

    const handleUpdatePlatform = async (targetUid: string, platform: UserPlatform | null) => {
        setIsUpdating(targetUid);
        await performApiCall(
            `/api/admin/users/${targetUid}/update-platform`,
            'POST',
            { platform },
            "La plataforma del usuario ha sido actualizada."
        );
        setIsUpdating(null);
    };
    
    const handleAssignCompany = async (targetUid: string, companyId: string | null) => {
        setIsUpdating(targetUid);
        await performApiCall(
            `/api/admin/users/${targetUid}/assign-company`,
            'POST',
            { companyId },
            "La asignación de empresa del usuario ha sido actualizada."
        );
        setIsUpdating(null);
    };

    const handleUpdatePlan = async () => {
        if (!selectedUserForPlan || !newUserPlan) {
            toast({ title: 'Valor inválido', description: 'Por favor, selecciona un plan.', variant: 'destructive'});
            return;
        }
        setIsUpdating(selectedUserForPlan.uid);
        const success = await performApiCall(
            `/api/admin/users/${selectedUserForPlan.uid}/update-plan`,
            'POST',
            { plan: newUserPlan },
            `El plan de suscripción para ${selectedUserForPlan.displayName} ha sido actualizado.`
        );
        setIsUpdating(null);
        if(success) {
             setIsPlanModalOpen(false);
             setSelectedUserForPlan(null);
             setNewUserPlan('');
        }
    };
    
    const handleAddCredits = async () => {
      const credits = parseInt(creditsToAdd, 10);
      if (isNaN(credits) || credits <= 0) {
        toast({ title: 'Créditos inválidos', description: 'Por favor, introduce un número positivo.', variant: 'destructive' });
        return;
      }
      
      const { entityId, entityType, entityName } = addCreditsDialog;
      setIsAddingCredits(true);
      const user = auth.currentUser;
      if (!user) return;
      const token = await user.getIdToken();
      
      const result = await addCreditsAction({ entityId, entityType, credits }, token);

      if (result.success) {
        toast({ title: "Créditos añadidos", description: `Se han añadido ${credits} créditos a ${entityName}.` });
        setCreditsToAdd('');
        setAddCreditsDialog({ ...addCreditsDialog, open: false });
        onDataChange();
      } else {
        toast({ title: 'Error al añadir créditos', description: result.error, variant: 'destructive' });
      }
      setIsAddingCredits(false);
    };


    const handleDeleteUser = async (targetUid: string) => {
        setIsUpdating(targetUid);
        const user = auth.currentUser;
        if (!user) {
            toast({ title: "No autenticado", variant: "destructive" });
            setIsUpdating(null);
            return;
        }
        const token = await user.getIdToken();
        const result = await deleteUserAction(targetUid, token);

        if(result.success) {
            toast({ title: "Éxito", description: "El usuario ha sido eliminado." });
            fetchUsersAndCompanies();
        } else {
            toast({ title: "Error al Eliminar", description: result.error, variant: "destructive" });
        }
        
        setIsUpdating(null);
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
        if (!users || users.length === 0 || plans.length === 0) return [];
        
        const usersWithPlanLimits = users.map(user => {
            const effectivePlanId = user.companyPlan || user.plan;
            const plan = plans.find(p => p.id === effectivePlanId);
            return {
                ...user,
                siteLimitFromPlan: plan ? plan.sites : null,
            };
        });
        
        const groups: Record<string, User[]> = {};
        
        usersWithPlanLimits.forEach(user => {
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
    }, [users, plans]);
    
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
            {/* Plan Modal */}
            <AlertDialog open={isPlanModalOpen} onOpenChange={setIsPlanModalOpen}>
                <AlertDialogContent>
                     <AlertDialogHeader>
                        <AlertDialogTitle>Asignar Plan de Suscripción</AlertDialogTitle>
                         <AlertDialogDescription>
                            Selecciona el plan para {selectedUserForPlan?.displayName}. Esto determinará su acceso a las funcionalidades.
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <div className="py-4">
                        <Label htmlFor="user-plan-select">Plan de Suscripción</Label>
                        <Select value={newUserPlan} onValueChange={(value) => setNewUserPlan(value as any)}>
                            <SelectTrigger id="user-plan-select">
                                <SelectValue placeholder="Selecciona un plan..." />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="lite">Lite</SelectItem>
                                <SelectItem value="pro">Pro</SelectItem>
                                <SelectItem value="agency">Agency</SelectItem>
                            </SelectContent>
                        </Select>
                    </div>
                    <AlertDialogFooter>
                        <AlertDialogCancel onClick={() => { setSelectedUserForPlan(null); setNewUserPlan(''); }}>Cancelar</AlertDialogCancel>
                        <AlertDialogAction onClick={handleUpdatePlan} disabled={isUpdating === selectedUserForPlan?.uid}>
                             {isUpdating === selectedUserForPlan?.uid && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                             Guardar Plan
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>

            {/* Add Credits Modal */}
            <AlertDialog open={addCreditsDialog.open} onOpenChange={(open) => !open && setAddCreditsDialog({ ...addCreditsDialog, open: false })}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>Añadir Créditos Extra</AlertDialogTitle>
                        <AlertDialogDescription>
                            Introduce la cantidad de créditos de un solo uso que quieres añadir a <strong>{addCreditsDialog.entityName}</strong>.
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <div className="py-4">
                        <Label htmlFor="credits-to-add">Créditos de IA a añadir</Label>
                        <Input
                            id="credits-to-add"
                            type="number"
                            value={creditsToAdd}
                            onChange={(e) => setCreditsToAdd(e.target.value)}
                            placeholder="Ej: 500"
                        />
                    </div>
                    <AlertDialogFooter>
                        <AlertDialogCancel>Cancelar</AlertDialogCancel>
                        <AlertDialogAction onClick={handleAddCredits} disabled={isAddingCredits}>
                            {isAddingCredits && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                            Añadir Créditos
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
                        <TableHead>Plan</TableHead>
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
                                <TableCell className="text-right">
                                    {group.companyName !== 'Sin Empresa Asignada' && (
                                        <Button
                                            variant="ghost"
                                            size="icon"
                                            onClick={() => setAddCreditsDialog({
                                                open: true,
                                                entityId: companies.find(c => c.name === group.companyName)?.id || '',
                                                entityName: group.companyName,
                                                entityType: 'company',
                                            })}
                                        >
                                            <BrainCircuit className="h-4 w-4" />
                                            <span className="sr-only">Añadir créditos a la empresa</span>
                                        </Button>
                                    )}
                                </TableCell>
                            </TableRow>
                            {group.users.map((u) => {
                               const effectivePlan = u.companyPlan || u.plan;
                               const isIndividualUser = !u.companyId;
                               return (
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
                                            {ROLE_NAMES[u.role as UserRole] || u.role}
                                        </Badge>
                                    </TableCell>
                                      <TableCell>
                                        <Badge variant={effectivePlan ? "default" : "secondary"} className="capitalize">
                                            {effectivePlan || 'N/A'}
                                        </Badge>
                                    </TableCell>
                                    <TableCell className="text-center font-medium">
                                        {u.siteLimitFromPlan == null ? 'N/A' : (u.siteLimitFromPlan >= 999 ? 'Ilimitado' : u.siteLimitFromPlan)}
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
                                                                        {isIndividualUser && (
                                                                            <>
                                                                                <DropdownMenuItem onSelect={() => { setSelectedUserForPlan(u); setNewUserPlan(u.plan || ''); setIsPlanModalOpen(true); }}>
                                                                                    <Briefcase className="mr-2 h-4 w-4" /> Asignar Plan Individual
                                                                                </DropdownMenuItem>
                                                                                 <DropdownMenuItem onSelect={() => setAddCreditsDialog({ open: true, entityId: u.uid, entityName: u.displayName, entityType: 'user' })}>
                                                                                    <BrainCircuit className="mr-2 h-4 w-4" /> Añadir Créditos Extra
                                                                                </DropdownMenuItem>
                                                                            </>
                                                                        )}

                                                                        <DropdownMenuSub>
                                                                            <DropdownMenuSubTrigger>
                                                                                <Building className="mr-2 h-4 w-4" /> Asignar a Empresa
                                                                            </DropdownMenuSubTrigger>
                                                                            <DropdownMenuPortal>
                                                                                <DropdownMenuSubContent>
                                                                                    <DropdownMenuItem onSelect={() => handleAssignCompany(u.uid, null)}>
                                                                                        <UserX className="mr-2 h-4 w-4" />
                                                                                        Desasignar (Sin Empresa)
                                                                                    </DropdownMenuItem>
                                                                                    <DropdownMenuSeparator />
                                                                                    {companies.map(company => (
                                                                                        <DropdownMenuItem key={company.id} onSelect={() => handleAssignCompany(u.uid, company.id)}>
                                                                                            {company.name}
                                                                                        </DropdownMenuItem>
                                                                                    ))}
                                                                                    {companies.length === 0 && <DropdownMenuItem disabled>No hay empresas creadas</DropdownMenuItem>}
                                                                                </DropdownMenuSubContent>
                                                                            </DropdownMenuPortal>
                                                                        </DropdownMenuSub>
                                                                         <DropdownMenuSub>
                                                                            <DropdownMenuSubTrigger>
                                                                                <Store className="mr-2 h-4 w-4" /> Asignar Plataforma
                                                                            </DropdownMenuSubTrigger>
                                                                            <DropdownMenuPortal>
                                                                                <DropdownMenuSubContent>
                                                                                    <DropdownMenuItem onSelect={() => handleUpdatePlatform(u.uid, 'woocommerce')}><Store className="mr-2 h-4 w-4" /> WooCommerce</DropdownMenuItem>
                                                                                    <DropdownMenuItem onSelect={() => handleUpdatePlatform(u.uid, 'shopify')}><ShopifyIcon className="mr-2 h-4 w-4" /> Shopify</DropdownMenuItem>
                                                                                     <DropdownMenuSeparator />
                                                                                    <DropdownMenuItem onSelect={() => handleUpdatePlatform(u.uid, null)}>
                                                                                        <UserX className="mr-2 h-4 w-4" /> Sin Asignar
                                                                                    </DropdownMenuItem>
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
                                                                            <DropdownMenuItem onSelect={() => handleUpdateRole(u.uid, 'content_manager')}>Gestor de Contenido</DropdownMenuItem>
                                                                            <DropdownMenuItem onSelect={() => handleUpdateRole(u.uid, 'product_manager')}>Gestor de Productos</DropdownMenuItem>
                                                                            <DropdownMenuItem onSelect={() => handleUpdateRole(u.uid, 'seo_analyst')}>Analista SEO</DropdownMenuItem>
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
                               );
                            })}
                        </React.Fragment>
                    )) : (
                        <TableRow>
                            <TableCell colSpan={7} className="h-24 text-center">
                                No se encontraron usuarios.
                            </TableCell>
                        </TableRow>
                    )}
                </TableBody>
            </Table>
        </div>
    );
}
