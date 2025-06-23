
"use client";

import React, { useState, useEffect, useMemo } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Loader2, LineChart, History } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { auth } from "@/lib/firebase";
import type { ActivityLog } from '@/lib/types';
import { formatDistanceToNow, parseISO } from 'date-fns';
import { es } from 'date-fns/locale';
import Image from 'next/image';

interface UserStat {
    userId: string;
    displayName: string;
    email: string;
    photoURL: string;
    productCount: number;
    connections: Set<string>;
}

export default function AdminActivityPage() {
    const [logs, setLogs] = useState<ActivityLog[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const { toast } = useToast();

    useEffect(() => {
        const fetchLogs = async () => {
            setIsLoading(true);
            const user = auth.currentUser;
            if (!user) {
                toast({ title: "No autenticado", variant: "destructive" });
                setIsLoading(false);
                return;
            }

            try {
                const token = await user.getIdToken();
                const response = await fetch('/api/admin/activity-logs', {
                    headers: { 'Authorization': `Bearer ${token}` }
                });

                if (!response.ok) {
                    const errorData = await response.json();
                    throw new Error(errorData.error || 'Failed to fetch logs.');
                }

                const data = await response.json();
                setLogs(data.logs);
            } catch (error: any) {
                toast({ title: "Error al Cargar Registros", description: error.message, variant: "destructive" });
            } finally {
                setIsLoading(false);
            }
        };

        const unsubscribe = auth.onAuthStateChanged((user) => {
            if (user) {
                fetchLogs();
            } else {
                setIsLoading(false);
                setLogs([]);
            }
        });
        return () => unsubscribe();
    }, [toast]);

    const userStats = useMemo(() => {
        const stats: Record<string, UserStat> = {};
        logs.forEach(log => {
            if (log.action === 'PRODUCT_CREATED') {
                if (!stats[log.userId]) {
                    stats[log.userId] = {
                        userId: log.userId,
                        displayName: log.user.displayName,
                        email: log.user.email,
                        photoURL: log.user.photoURL,
                        productCount: 0,
                        connections: new Set<string>(),
                    };
                }
                stats[log.userId].productCount++;
                if (log.details.connectionKey) {
                    stats[log.userId].connections.add(log.details.connectionKey);
                }
            }
        });
        return Object.values(stats).sort((a,b) => b.productCount - a.productCount);
    }, [logs]);


    if (isLoading) {
        return (
            <div className="flex justify-center items-center h-64 border rounded-md">
                <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                <p className="ml-3 text-muted-foreground">Cargando registros de actividad...</p>
            </div>
        );
    }
    
    return (
        <div className="space-y-6">
            <Card>
                <CardHeader>
                    <div className="flex items-center space-x-3">
                        <LineChart className="h-8 w-8 text-primary" />
                        <div>
                            <CardTitle>Resumen de Actividad por Usuario</CardTitle>
                            <CardDescription>Estadísticas de creación de productos por cada usuario.</CardDescription>
                        </div>
                    </div>
                </CardHeader>
                <CardContent>
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead>Usuario</TableHead>
                                <TableHead className="text-center">Productos Creados</TableHead>
                                <TableHead>Webs Utilizadas</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {userStats.length > 0 ? userStats.map(stat => (
                                <TableRow key={stat.userId}>
                                    <TableCell>
                                        <div className="flex items-center gap-3">
                                            <Image src={stat.photoURL || `https://placehold.co/40x40.png`} alt={stat.displayName} width={32} height={32} className="rounded-full" />
                                            <div>
                                                <div className="font-medium">{stat.displayName}</div>
                                                <div className="text-xs text-muted-foreground">{stat.email}</div>
                                            </div>
                                        </div>
                                    </TableCell>
                                    <TableCell className="text-center font-bold text-lg">{stat.productCount}</TableCell>
                                    <TableCell>
                                        <div className="flex flex-col gap-1">
                                            {Array.from(stat.connections).map(conn => (
                                                <Badge key={conn} variant="secondary">{conn}</Badge>
                                            ))}
                                        </div>
                                    </TableCell>
                                </TableRow>
                            )) : (
                                <TableRow>
                                    <TableCell colSpan={3} className="h-24 text-center">
                                        No hay estadísticas de creación de productos todavía.
                                    </TableCell>
                                </TableRow>
                            )}
                        </TableBody>
                    </Table>
                </CardContent>
            </Card>

            <Card>
                <CardHeader>
                    <div className="flex items-center space-x-3">
                        <History className="h-8 w-8 text-primary" />
                        <div>
                            <CardTitle>Registro de Actividad Detallado</CardTitle>
                            <CardDescription>Las 200 acciones más recientes realizadas en la aplicación.</CardDescription>
                        </div>
                    </div>
                </CardHeader>
                <CardContent>
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead>Usuario</TableHead>
                                <TableHead>Acción</TableHead>
                                <TableHead>Detalles</TableHead>
                                <TableHead className="text-right">Fecha</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {logs.length > 0 ? logs.map(log => (
                                <TableRow key={log.id}>
                                    <TableCell>
                                        <div className="flex items-center gap-2">
                                             <Image src={log.user.photoURL || `https://placehold.co/40x40.png`} alt={log.user.displayName} width={24} height={24} className="rounded-full" />
                                            <span className="font-medium">{log.user.displayName}</span>
                                        </div>
                                    </TableCell>
                                    <TableCell>
                                        <Badge variant="outline">{log.action}</Badge>
                                    </TableCell>
                                    <TableCell className="text-sm text-muted-foreground">
                                        {log.action === 'PRODUCT_CREATED' && (
                                            `Creó "${log.details.productName}" en ${log.details.connectionKey} (desde ${log.details.source})`
                                        )}
                                    </TableCell>
                                    <TableCell className="text-right text-xs text-muted-foreground">
                                        {formatDistanceToNow(parseISO(log.timestamp), { addSuffix: true, locale: es })}
                                    </TableCell>
                                </TableRow>
                            )) : (
                                <TableRow>
                                    <TableCell colSpan={4} className="h-24 text-center">
                                        No hay registros de actividad.
                                    </TableCell>
                                </TableRow>
                            )}
                        </TableBody>
                    </Table>
                </CardContent>
            </Card>
        </div>
    );
}
