
"use client";

import { useState, useEffect, useCallback } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Users, PlusCircle, Loader2 } from "lucide-react";
import { UserManagementTable } from './user-management-table';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import { auth, onAuthStateChanged, type FirebaseUser } from '@/lib/firebase';
import type { PlanUsage } from '@/lib/types';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { inviteUserAction } from '@/app/api/admin/users/actions';

export default function AdminUsersPage() {
    const [isInviteDialogOpen, setIsInviteDialogOpen] = useState(false);
    const [emailToInvite, setEmailToInvite] = useState('');
    const [isInviting, setIsInviting] = useState(false);
    const { toast } = useToast();

    const [planUsage, setPlanUsage] = useState<PlanUsage | null>(null);
    const [isLoadingUsage, setIsLoadingUsage] = useState(true);
    const [currentUserRole, setCurrentUserRole] = useState<string | null>(null);
    const [fetchDataTrigger, setFetchDataTrigger] = useState(0);


    const fetchPlanUsage = useCallback(async (user: FirebaseUser) => {
        setIsLoadingUsage(true);
        try {
            const token = await user.getIdToken();
            const [usageResponse, userResponse] = await Promise.all([
                fetch('/api/user-settings/my-plan', { headers: { 'Authorization': `Bearer ${token}` } }),
                fetch('/api/user/verify', { headers: { 'Authorization': `Bearer ${token}` } })
            ]);
            
            if (usageResponse.ok) setPlanUsage((await usageResponse.json()).usage); else setPlanUsage(null);
            if (userResponse.ok) setCurrentUserRole((await userResponse.json()).role); else setCurrentUserRole(null);

        } catch (error) {
            toast({ title: "Error", description: "No se pudo cargar el uso del plan.", variant: "destructive" });
        } finally {
            setIsLoadingUsage(false);
        }
    }, [toast]);
    
    useEffect(() => {
        const unsubscribe = onAuthStateChanged(auth, (user) => {
            if (user) {
                fetchPlanUsage(user);
            } else {
                setIsLoadingUsage(false);
            }
        });
        return () => unsubscribe();
    }, [fetchPlanUsage, fetchDataTrigger]);

    const handleInviteUser = async () => {
        if (!emailToInvite) {
            toast({ title: "Email requerido", variant: "destructive" });
            return;
        }
        setIsInviting(true);
        
        const user = auth.currentUser;
        if (!user) {
            toast({ title: "No autenticado", variant: "destructive" });
            setIsInviting(false);
            return;
        }

        try {
            const token = await user.getIdToken();
            const result = await inviteUserAction(emailToInvite, token);

            if (!result.success) {
                throw new Error(result.error || 'No se pudo enviar la invitación.');
            }
            
            toast({ title: "Invitación Creada", description: result.message });
            setFetchDataTrigger(prev => prev + 1); // Trigger a re-fetch of table data
            setIsInviteDialogOpen(false);
            setEmailToInvite('');

        } catch(error: any) {
            toast({ title: "Error al Invitar", description: error.message, variant: "destructive" });
        } finally {
            setIsInviting(false);
        }
    };
    
    const isUserLimitReached = !isLoadingUsage && planUsage ? (planUsage.users.used >= planUsage.users.limit) : false;
    const canInvite = currentUserRole === 'super_admin' || !isUserLimitReached;

    return (
        <div className="space-y-6">
            <Dialog open={isInviteDialogOpen} onOpenChange={setIsInviteDialogOpen}>
                <Card>
                    <CardHeader className="flex flex-row items-center justify-between">
                        <div className="flex items-center space-x-3">
                            <Users className="h-8 w-8 text-primary" />
                            <div>
                                <CardTitle>Gestión de Usuarios y Empresas</CardTitle>
                                <CardDescription>
                                    Gestiona usuarios, empresas, roles y asignaciones de créditos.
                                </CardDescription>
                            </div>
                        </div>
                        <TooltipProvider>
                            <Tooltip>
                                <TooltipTrigger asChild>
                                    <div className="inline-block"> 
                                        <Button onClick={() => setIsInviteDialogOpen(true)} disabled={!canInvite}>
                                            <PlusCircle className="mr-2 h-4 w-4" />
                                            Invitar Usuario
                                        </Button>
                                    </div>
                                </TooltipTrigger>
                                {!canInvite && (
                                    <TooltipContent>
                                        <p>Has alcanzado el límite de usuarios de tu plan.</p>
                                    </TooltipContent>
                                )}
                            </Tooltip>
                        </TooltipProvider>
                    </CardHeader>
                </Card>
                
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>Invitar Nuevo Usuario</DialogTitle>
                        <DialogDescription>
                            Introduce el email del usuario que quieres invitar a tu empresa. El usuario podrá registrarse y se unirá automáticamente a tu equipo.
                        </DialogDescription>
                    </DialogHeader>
                    <div className="py-4">
                        <Label htmlFor="invite-email">Email del Usuario</Label>
                        <Input 
                            id="invite-email" 
                            type="email" 
                            value={emailToInvite}
                            onChange={(e) => setEmailToInvite(e.target.value)}
                            placeholder="usuario@ejemplo.com"
                        />
                    </div>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setIsInviteDialogOpen(false)}>Cancelar</Button>
                        <Button onClick={handleInviteUser} disabled={isInviting}>
                            {isInviting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                            Enviar Invitación
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
            
            <UserManagementTable key={fetchDataTrigger} onDataChange={() => setFetchDataTrigger(prev => prev + 1)} />
        </div>
    );
}
