
"use client";

import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from '@/components/ui/button';
import { Bell, Loader2, Inbox, Trash2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { auth, onAuthStateChanged } from "@/lib/firebase";
import type { UserNotification } from '@/lib/types';
import Link from 'next/link';
import { cn } from '@/lib/utils';
import { formatDistanceToNow } from 'date-fns';
import { es } from 'date-fns/locale';

export default function NotificationsPage() {
    const [notifications, setNotifications] = useState<UserNotification[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [isDeleting, setIsDeleting] = useState<string | null>(null);
    const { toast } = useToast();

    useEffect(() => {
        const unsubscribe = onAuthStateChanged(auth, async (user) => {
            if (user) {
                setIsLoading(true);
                try {
                    const token = await user.getIdToken();
                    const response = await fetch('/api/notifications', {
                        headers: { 'Authorization': `Bearer ${token}` }
                    });
                    if (!response.ok) {
                        throw new Error('Failed to load notifications.');
                    }
                    const data = await response.json();
                    const sortedNotifications = data.notifications.sort((a: UserNotification, b: UserNotification) =>
                        new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
                    );
                    setNotifications(sortedNotifications);
                } catch (error) {
                    const errorMessage = error instanceof Error ? error.message : String(error);
                    toast({ title: 'Error', description: errorMessage, variant: 'destructive' });
                } finally {
                    setIsLoading(false);
                }
            } else {
                setIsLoading(false);
                setNotifications([]);
            }
        });
        return () => unsubscribe();
    }, [toast]);

    const handleDelete = async (notificationId: string) => {
        setIsDeleting(notificationId);
        
        // Optimistic UI update
        const originalNotifications = [...notifications];
        setNotifications(prev => prev.filter(n => n.id !== notificationId));

        const user = auth.currentUser;
        if (!user) {
            toast({ title: "No autenticado", variant: "destructive" });
            setNotifications(originalNotifications);
            setIsDeleting(null);
            return;
        }

        try {
            const token = await user.getIdToken();
            const response = await fetch(`/api/notifications/${notificationId}`, {
                method: 'DELETE',
                headers: { 'Authorization': `Bearer ${token}` }
            });

            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.error || 'No se pudo eliminar la notificación.');
            }

            toast({ title: "Notificación eliminada" });
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            toast({ title: "Error al eliminar", description: errorMessage, variant: "destructive" });
            // Rollback on error
            setNotifications(originalNotifications);
        } finally {
            setIsDeleting(null);
        }
    };


    return (
        <div className="container mx-auto py-8">
            <Card>
                <CardHeader>
                    <div className="flex items-center space-x-3">
                        <Bell className="h-8 w-8 text-primary" />
                        <div>
                            <CardTitle>Centro de Notificaciones</CardTitle>
                            <CardDescription>Aquí están todas tus notificaciones.</CardDescription>
                        </div>
                    </div>
                </CardHeader>
                <CardContent>
                    {isLoading ? (
                        <div className="min-h-[200px] flex items-center justify-center">
                            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                        </div>
                    ) : notifications.length === 0 ? (
                        <div className="min-h-[300px] flex flex-col items-center justify-center text-center text-muted-foreground border border-dashed rounded-md py-12">
                            <Inbox className="h-12 w-12 mb-4" />
                            <h3 className="text-lg font-semibold">Tu bandeja de entrada está vacía</h3>
                            <p className="text-sm">Las notificaciones importantes de la aplicación aparecerán aquí.</p>
                        </div>
                    ) : (
                        <div className="space-y-3">
                            {notifications.map(notification => (
                                <div 
                                    key={notification.id} 
                                    className={cn(
                                        "flex items-center gap-4 p-4 border rounded-lg transition-colors",
                                        notification.read ? 'bg-card hover:bg-muted/50' : 'bg-primary/10 hover:bg-primary/20 border-primary/50'
                                    )}
                                >
                                    <Link href={notification.link || '#'} className="flex-grow">
                                        <div className="flex justify-between items-start">
                                            <div className="flex items-center gap-3">
                                                {!notification.read && (
                                                    <div className="h-2.5 w-2.5 rounded-full bg-primary flex-shrink-0" title="No leído" />
                                                )}
                                                <div>
                                                    <p className="font-semibold">{notification.title}</p>
                                                    <p className="text-sm text-muted-foreground">{notification.message}</p>
                                                </div>
                                            </div>
                                            <p className="text-xs text-muted-foreground flex-shrink-0 ml-4">
                                                {formatDistanceToNow(new Date(notification.createdAt), { addSuffix: true, locale: es })}
                                            </p>
                                        </div>
                                    </Link>
                                    <Button 
                                        variant="ghost" 
                                        size="icon" 
                                        className="text-muted-foreground hover:text-destructive flex-shrink-0"
                                        onClick={() => handleDelete(notification.id)}
                                        disabled={isDeleting === notification.id}
                                        aria-label="Eliminar notificación"
                                    >
                                        {isDeleting === notification.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                                    </Button>
                                </div>
                            ))}
                        </div>
                    )}
                </CardContent>
            </Card>
        </div>
    );
}
