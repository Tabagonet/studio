
"use client";

import React, { useState, useEffect, useMemo } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Loader2, LineChart, History, Calendar, Download } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { auth } from "@/lib/firebase";
import type { ActivityLog } from '@/lib/types';
import { formatDistanceToNow, parseISO, subDays, startOfMonth } from 'date-fns';
import { es } from 'date-fns/locale';
import Image from 'next/image';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import Papa from 'papaparse';


interface UserStat {
    userId: string;
    displayName: string;
    email: string;
    photoURL: string;
    productCount: number;
    connections: Set<string>;
    companyName: string | null;
}

type GroupedUserStats = {
    companyName: string;
    users: UserStat[];
}

type FilterType = 'this_month' | 'last_30_days' | 'all_time';

export default function AdminActivityPage() {
    const [logs, setLogs] = useState<ActivityLog[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [filter, setFilter] = useState<FilterType>('this_month');
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
                // Sorting is now done on the server, but we can keep client sort as a fallback
                const sortedLogs = data.logs.sort((a: ActivityLog, b: ActivityLog) => 
                   new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
                );
                setLogs(sortedLogs);
            } catch (error) {
                const errorMessage = error instanceof Error ? error.message : String(error);
                toast({ title: "Error al Cargar Registros", description: errorMessage, variant: "destructive" });
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
    
    const filteredLogs = useMemo(() => {
        const now = new Date();
        if (filter === 'this_month') {
            const startOfThisMonth = startOfMonth(now);
            return logs.filter(log => parseISO(log.timestamp) >= startOfThisMonth);
        }
        if (filter === 'last_30_days') {
            const thirtyDaysAgo = subDays(now, 30);
            return logs.filter(log => parseISO(log.timestamp) >= thirtyDaysAgo);
        }
        return logs;
    }, [logs, filter]);
    
    const filterOptions: { value: FilterType; label: string }[] = [
        { value: 'this_month', label: 'Este Mes' },
        { value: 'last_30_days', label: 'Últimos 30 Días' },
        { value: 'all_time', label: 'Desde Siempre' },
    ];

    const userStats = useMemo(() => {
        const productCreationLogs = filteredLogs.filter(log => log.action === 'PRODUCT_CREATED');
        const stats: Record<string, UserStat> = {};
        
        productCreationLogs.forEach(log => {
            if (!stats[log.userId]) {
                stats[log.userId] = {
                    userId: log.userId,
                    displayName: log.user.displayName,
                    email: log.user.email,
                    photoURL: log.user.photoURL,
                    productCount: 0,
                    connections: new Set<string>(),
                    companyName: log.user.companyName || null,
                };
            }
            stats[log.userId].productCount++;
            if (log.details.connectionKey) {
                stats[log.userId].connections.add(log.details.connectionKey);
            }
        });
        return Object.values(stats);
    }, [filteredLogs]);
    
    const groupedUserStats = useMemo((): GroupedUserStats[] => {
        if (userStats.length === 0) return [];
        
        const groups: Record<string, UserStat[]> = {};
        
        userStats.forEach(stat => {
            const companyKey = stat.companyName || 'Sin Empresa Asignada';
            if (!groups[companyKey]) {
                groups[companyKey] = [];
            }
            groups[companyKey].push(stat);
        });

        return Object.entries(groups).map(([companyName, users]) => ({
            companyName,
            users: users.sort((a,b) => b.productCount - a.productCount)
        })).sort((a,b) => {
            if (a.companyName === 'Sin Empresa Asignada') return 1;
            if (b.companyName === 'Sin Empresa Asignada') return -1;
            return a.companyName.localeCompare(b.companyName);
        });
    }, [userStats]);

    const handleExportUserStats = () => {
        if (userStats.length === 0) {
            toast({ title: 'Nada que exportar', description: 'No hay estadísticas de usuario para el periodo seleccionado.', variant: "destructive" });
            return;
        }

        const dataToExport = userStats.map(stat => ({
            'Usuario': stat.displayName,
            'Email': stat.email,
            'Empresa': stat.companyName || 'N/A',
            'Productos Creados': stat.productCount,
            'Webs Utilizadas': Array.from(stat.connections).join(', '),
        }));

        const csv = Papa.unparse(dataToExport);
        const blob = new Blob(["\uFEFF" + csv], { type: 'text/csv;charset=utf-8;' });
        const link = document.createElement("a");
        const url = URL.createObjectURL(blob);
        link.setAttribute("href", url);
        const formattedDate = new Date().toISOString().split('T')[0];
        link.setAttribute("download", `reporte-actividad-usuarios-${formattedDate}.csv`);
        link.style.visibility = 'hidden';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
    };

    const handleExportDetailedLogs = () => {
        if (logs.length === 0) {
            toast({ title: 'Nada que exportar', description: 'No hay registros detallados para exportar.', variant: "destructive" });
            return;
        }

        const dataToExport = logs.map(log => ({
            'Fecha': new Date(log.timestamp).toLocaleString('es-ES'),
            'Usuario': log.user.displayName,
            'Empresa': log.user.companyName || 'N/A',
            'Acción': log.action,
            'Detalles': log.action === 'PRODUCT_CREATED' 
                ? `Creó "${log.details.productName}" en ${log.details.connectionKey} (desde ${log.details.source})`
                : JSON.stringify(log.details)
        }));

        const csv = Papa.unparse(dataToExport);
        const blob = new Blob(["\uFEFF" + csv], { type: 'text/csv;charset=utf-8;' });
        const link = document.createElement("a");
        const url = URL.createObjectURL(blob);
        link.setAttribute("href", url);
        const formattedDate = new Date().toISOString().split('T')[0];
        link.setAttribute("download", `reporte-detallado-actividad-${formattedDate}.csv`);
        link.style.visibility = 'hidden';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
    };


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
                    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                        <div className="flex items-center space-x-3">
                            <LineChart className="h-8 w-8 text-primary" />
                            <div>
                                <CardTitle>Resumen de Actividad por Usuario</CardTitle>
                                <CardDescription>Estadísticas de creación de productos por cada usuario, agrupadas por empresa.</CardDescription>
                            </div>
                        </div>
                        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
                            <Select value={filter} onValueChange={(value: FilterType) => setFilter(value)}>
                                <SelectTrigger className="w-full sm:w-[200px]">
                                    <Calendar className="mr-2 h-4 w-4" />
                                    <SelectValue placeholder="Seleccionar periodo" />
                                </SelectTrigger>
                                <SelectContent>
                                    {filterOptions.map(option => (
                                        <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                             <Button variant="outline" onClick={handleExportUserStats}>
                                <Download className="mr-2 h-4 w-4" />
                                Exportar Resumen
                            </Button>
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
                            {groupedUserStats.length > 0 ? groupedUserStats.map(group => (
                                <React.Fragment key={group.companyName}>
                                    <TableRow className="bg-muted/50 hover:bg-muted/50">
                                        <TableCell colSpan={3} className="font-semibold text-primary">
                                            {group.companyName}
                                        </TableCell>
                                    </TableRow>
                                    {group.users.map(stat => (
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
                                    ))}
                                </React.Fragment>
                            )) : (
                                <TableRow>
                                    <TableCell colSpan={3} className="h-24 text-center">
                                        No hay estadísticas de creación de productos para el periodo seleccionado.
                                    </TableCell>
                                </TableRow>
                            )}
                        </TableBody>
                    </Table>
                </CardContent>
            </Card>

            <Card>
                <CardHeader>
                     <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                        <div className="flex items-center space-x-3">
                            <History className="h-8 w-8 text-primary" />
                            <div>
                                <CardTitle>Registro de Actividad Detallado</CardTitle>
                                <CardDescription>Las 200 acciones más recientes realizadas en la aplicación.</CardDescription>
                            </div>
                        </div>
                        <Button variant="outline" onClick={handleExportDetailedLogs}>
                            <Download className="mr-2 h-4 w-4" />
                            Exportar Registros
                        </Button>
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
