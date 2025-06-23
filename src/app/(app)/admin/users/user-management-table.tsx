
"use client";

import React, { useState, useEffect, useCallback } from 'react';
import { useToast } from '@/hooks/use-toast';
import { auth } from '@/lib/firebase';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Loader2, UserCheck, UserX } from 'lucide-react';
import Image from 'next/image';

interface User {
  uid: string;
  email: string;
  displayName: string;
  photoURL: string;
  role: 'admin' | 'user' | 'pending';
  status: 'active' | 'rejected' | 'pending_approval';
}

export function UserManagementTable() {
    const [users, setUsers] = useState<User[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [isUpdating, setIsUpdating] = useState<string | null>(null); // store UID of user being updated
    const { toast } = useToast();

    const fetchUsers = useCallback(async () => {
        setIsLoading(true);
        const user = auth.currentUser;
        if (!user) {
            toast({ title: "No autenticado", variant: "destructive" });
            setIsLoading(false);
            return;
        }

        try {
            const token = await user.getIdToken();
            const response = await fetch('/api/admin/users', {
                headers: { 'Authorization': `Bearer ${token}` }
            });

            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.error || 'Failed to fetch users.');
            }

            const data = await response.json();
            setUsers(data.users);

        } catch (error: any) {
            toast({ title: "Error al Cargar Usuarios", description: error.message, variant: "destructive" });
        } finally {
            setIsLoading(false);
        }
    }, [toast]);

    useEffect(() => {
        const unsubscribe = auth.onAuthStateChanged((user) => {
            if (user) {
                fetchUsers();
            } else {
                setIsLoading(false);
                setUsers([]);
            }
        });
        return () => unsubscribe();
    }, [fetchUsers]);
    
    const handleUpdateStatus = async (targetUid: string, newStatus: 'active' | 'rejected') => {
        setIsUpdating(targetUid);
        const user = auth.currentUser;
        if (!user) {
            toast({ title: "No autenticado", variant: "destructive" });
            setIsUpdating(null);
            return;
        }

        try {
            const token = await user.getIdToken();
            const response = await fetch(`/api/admin/users/${targetUid}/update-status`, {
                method: 'POST',
                headers: { 
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}` 
                },
                body: JSON.stringify({ status: newStatus })
            });

            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.error || 'Failed to update user status.');
            }
            
            toast({ title: "Usuario actualizado", description: "El estado del usuario ha sido cambiado con éxito." });
            fetchUsers(); // Refresh the list

        } catch (error: any) {
            toast({ title: "Error al Actualizar", description: error.message, variant: "destructive" });
        } finally {
            setIsUpdating(null);
        }
    };

    const getStatusBadge = (status: User['status']) => {
        switch (status) {
            case 'active': return <Badge variant="default" className="bg-green-600 hover:bg-green-700">Activo</Badge>;
            case 'pending_approval': return <Badge variant="secondary" className="bg-amber-500 hover:bg-amber-600 text-white">Pendiente</Badge>;
            case 'rejected': return <Badge variant="destructive">Rechazado</Badge>;
            default: return <Badge variant="outline">{status}</Badge>;
        }
    };
    
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
            <Table>
                <TableHeader>
                    <TableRow>
                        <TableHead className="w-[300px]">Usuario</TableHead>
                        <TableHead>Email</TableHead>
                        <TableHead>Rol</TableHead>
                        <TableHead>Estado</TableHead>
                        <TableHead className="text-right w-[250px]">Acciones</TableHead>
                    </TableRow>
                </TableHeader>
                <TableBody>
                    {users.length > 0 ? users.map((u) => (
                        <TableRow key={u.uid}>
                            <TableCell>
                                <div className="flex items-center gap-3">
                                    <Image src={u.photoURL || `https://placehold.co/40x40.png`} alt={u.displayName} width={32} height={32} className="rounded-full" />
                                    <span className="font-medium">{u.displayName}</span>
                                </div>
                            </TableCell>
                            <TableCell className="text-muted-foreground">{u.email}</TableCell>
                            <TableCell><Badge variant="outline" className="capitalize">{u.role}</Badge></TableCell>
                            <TableCell>{getStatusBadge(u.status)}</TableCell>
                            <TableCell className="text-right">
                                {isUpdating === u.uid ? (
                                    <div className="flex justify-end">
                                        <Loader2 className="h-5 w-5 animate-spin" />
                                    </div>
                                ) : (
                                    u.status === 'pending_approval' && (
                                        <div className="flex justify-end gap-2">
                                            <Button size="sm" variant="outline" onClick={() => handleUpdateStatus(u.uid, 'active')}>
                                                <UserCheck className="mr-2 h-4 w-4" /> Aprobar
                                            </Button>
                                            <Button size="sm" variant="destructive" onClick={() => handleUpdateStatus(u.uid, 'rejected')}>
                                                <UserX className="mr-2 h-4 w-4" /> Rechazar
                                            </Button>
                                        </div>
                                    )
                                )}
                            </TableCell>
                        </TableRow>
                    )) : (
                        <TableRow>
                            <TableCell colSpan={5} className="h-24 text-center">
                                No se encontraron usuarios.
                            </TableCell>
                        </TableRow>
                    )}
                </TableBody>
            </Table>
        </div>
    );
}
