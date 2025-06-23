
"use client";

import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Bell, Loader2, Inbox } from "lucide-react";
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
                    // Sort notifications on the client-side
                    const sortedNotifications = data.notifications.sort((a: UserNotification, b: UserNotification) =>
                        new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
                    );
                    setNotifications(sortedNotifications);
                } catch (error: any) {
                    toast({ title: 'Error', description: error.message, variant: 'destructive' });
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
                                <Link key={notification.id} href={notification.link || '#'} className="block">
                                    <div className={cn(
                                        "p-4 border rounded-lg transition-colors cursor-pointer",
                                        notification.read ? 'bg-card hover:bg-muted/50' : 'bg-primary/10 hover:bg-primary/20 border-primary/50'
                                    )}>
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
                                    </div>
                                </Link>
                            ))}
                        </div>
                    )}
                </CardContent>
            </Card>
        </div>
    );
}
