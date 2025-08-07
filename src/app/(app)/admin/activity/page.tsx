
"use client";

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Loader2, LineChart, History, Calendar, Download, Building, Store, BrainCircuit } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { auth, onAuthStateChanged, type FirebaseUser } from "@/lib/firebase";
import type { ActivityLog, User as AppUser, PlanUsage } from '@/lib/types';
import { formatDistanceToNow, parseISO, subDays, startOfMonth } from 'date-fns';
import { es } from 'date-fns/locale';
import Image from 'next/image';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import Papa from 'papaparse';
import { ShopifyIcon } from '@/components/core/icons';

interface UserData {
  role: string | null;
  companyId: string | null;
  companyName: string | null;
}

interface UserStat {
    userId: string;
    displayName: string;
    email: string;
    photoURL: string;
    productCount: number;
    connections: Set<string>;
    companyName: string | null;
    platform: 'woocommerce' | 'shopify' | null;
    aiUsageCount: number;
}

type GroupedUserStats = {
    companyName: string;
    platform: string | null;
    users: UserStat[];
    aiUsageCount: number;
}

type FilterType = 'this_month' | 'last_30_days' | 'all_time';

export default function AdminActivityPage() {
    const [allUsers, setAllUsers] = useState<AppUser[]>([]);
    const [logs, setLogs] = useState<ActivityLog[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [filter, setFilter] = useState<FilterType>('this_month');
    const { toast } = useToast();
    const [userData, setUserData] = useState<UserData | null>(null);

    const fetchAdminData = useCallback(async (user: FirebaseUser) => {
        setIsLoading(true);
        try {
            const token = await user.getIdToken();
            const [logsResponse, userResponse, allUsersResponse] = await Promise.all([
                 fetch('/api/admin/activity-logs', { headers: { 'Authorization': `Bearer ${token}` } }),
                 fetch('/api/user/verify', { headers: { 'Authorization': `Bearer ${token}` } }),
                 fetch('/api/admin/users', { headers: { 'Authorization': `Bearer ${token}` } })
            ]);

            if (!logsResponse.ok) throw new Error((await logsResponse.json()).error || 'Failed to fetch logs.');
            if (userResponse.ok) setUserData(await userResponse.json());
            if (allUsersResponse.ok) setAllUsers((await allUsersResponse.json()).users);

            const data = await logsResponse.json();
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
    }, [toast]);


    useEffect(() => {
        const unsubscribe = auth.onAuthStateChanged((user) => {
            if (user) {
                fetchAdminData(user);
            } else {
                setIsLoading(false);
                setLogs([]);
            }
        });
        return () => unsubscribe();
    }, [fetchAdminData]);
    
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

    const groupedUserStats = useMemo((): GroupedUserStats[] => {
        const statsByUser: Record<string, UserStat> = {};

        // Initialize all users with 0 product count
        allUsers.forEach(user => {
            statsByUser[user.uid] = {
                userId: user.uid,
                displayName: user.displayName,
                email: user.email,
                photoURL: user.photoURL,
                productCount: 0,
                connections: new Set<string>(),
                companyName: user.companyName || null,
                platform: user.companyPlatform || user.platform || null,
                aiUsageCount: user.aiUsageCount || 0,
            };
        });
        
        // Populate counts and connections from filtered logs
        const productCreationLogs = filteredLogs.filter(log => log.action === 'PRODUCT_CREATED');
        productCreationLogs.forEach(log => {
            if (statsByUser[log.userId]) {
                 statsByUser[log.userId].productCount++;
                if (log.details.connectionKey) {
                    statsByUser[log.userId].connections.add(log.details.connectionKey);
                }
            }
        });

        // Group by company
        const groups: Record<string, { users: UserStat[], aiUsageCount: number, platform: string | null }> = {};
        
        Object.values(statsByUser).forEach(stat => {
            const companyKey = stat.companyName || 'Sin Empresa Asignada';
            if (!groups[companyKey]) {
                groups[companyKey] = { users: [], aiUsageCount: 0, platform: null };
            }
            groups[companyKey].users.push(stat);

            if (stat.companyName && stat.aiUsageCount > groups[companyKey].aiUsageCount) {
                groups[companyKey].aiUsageCount = stat.aiUsageCount;
            }
            if (stat.platform && !groups[companyKey].platform) {
                groups[companyKey].platform = stat.platform;
            }
        });

        return Object.entries(groups).map(([companyName, groupData]) => ({
            companyName,
            platform: groupData.platform,
            users: groupData.users.sort((a,b) => b.productCount - a.productCount),
            aiUsageCount: groupData.aiUsageCount
        })).sort((a,b) => {
            if (a.companyName === 'Sin Empresa Asignada') return 1;
            if (b.companyName === 'Sin Empresa Asignada') return -1;
            return a.companyName.localeCompare(b.companyName);
        });
    }, [allUsers, filteredLogs]);


    const handleExportUserStats = () => {
        const userStats = Object.values(groupedUserStats).flatMap(g => g.users);
        if (userStats.length === 0) {
            toast({ title: 'Nada que exportar', description: 'No hay estadísticas de usuario para el periodo seleccionado.', variant: "destructive" });
            return;
        }

        const dataToExport = userStats.map(stat => ({
            'Usuario': stat.displayName,
            'Email': stat.email,
            'Empresa': stat.companyName || 'N/A',
            'Productos Creados (Periodo)': stat.productCount,
            'Webs Utilizadas': Array.from(stat.connections).join(', '),
            'Creditos IA Usados (Total Mes)': stat.aiUsageCount,
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

    const getSummaryTitle = () => {
        if (userData?.role === 'super_admin') return "Resumen de Actividad Global";
        if (userData?.role === 'admin' && userData.companyId) return `Resumen de Actividad: ${userData.companyName}`;
        return "Resumen de Mi Actividad";
    };
    
    const getSummaryDescription = () => {
        if (userData?.role === 'super_admin') return "Estadísticas de creación de productos de todos los usuarios, agrupadas por empresa.";
        if (userData?.role === 'admin' && userData.companyId) return "Estadísticas de creación de productos de los usuarios de tu empresa.";
        return "Tus estadísticas de creación de productos.";
    };
    
    const getDetailedTitle = () => {
        if (userData?.role === 'super_admin') return "Registro de Actividad Global";
        if (userData?.role === 'admin' && userData.companyId) return `Registro de Actividad de ${userData.companyName}`;
        return "Mi Registro de Actividad";
    }
    
    const getDetailedDescription = () => {
        if (userData?.role === 'super_admin') return "Las 200 acciones más recientes realizadas en toda la aplicación.";
        if (userData?.role === 'admin' && userData.companyId) return "Las 200 acciones más recientes de los usuarios de tu empresa.";
        return "Tus 200 acciones más recientes en la aplicación.";
    }


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
                                <CardTitle>{getSummaryTitle()}</CardTitle>
                                <CardDescription>{getSummaryDescription()}</CardDescription>
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
                                <TableHead className="text-center">Productos Creados (Periodo)</TableHead>
                                <TableHead className="text-center">Créditos IA (Total Mes)</TableHead>
                                <TableHead>Webs Utilizadas</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {groupedUserStats.length > 0 ? groupedUserStats.map(group => (
                                <React.Fragment key={group.companyName}>
                                    <TableRow className="bg-muted/50 hover:bg-muted/50">
                                        <TableCell colSpan={2} className="py-3 text-lg font-semibold text-primary">
                                            <div className="flex items-center gap-2">
                                                <Building className="h-5 w-5" />
                                                {group.companyName}
                                                {group.platform && (
                                                    <Badge variant={group.platform === 'shopify' ? 'default' : 'secondary'} className={group.platform === 'shopify' ? 'bg-[#7ab55c] text-white' : ''}>
                                                        {group.platform === 'shopify' ? <ShopifyIcon className="h-4 w-4 mr-1.5 -ml-0.5" /> : <Store className="h-4 w-4 mr-1.5 -ml-0.5" />}
                                                        {group.platform === 'shopify' ? 'Shopify' : 'WooCommerce'}
                                                    </Badge>
                                                )}
                                            </div>
                                        </TableCell>
                                        <TableCell className="text-center font-bold text-lg text-primary">
                                            <div className="flex items-center justify-center gap-2">
                                                <BrainCircuit className="h-5 w-5" />
                                                <span>{group.aiUsageCount.toLocaleString('es-ES')}</span>
                                            </div>
                                        </TableCell>
                                        <TableCell></TableCell>
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
                                            <TableCell className="text-center font-medium">
                                                {stat.companyName ? <span className="text-muted-foreground">-</span> : stat.aiUsageCount.toLocaleString('es-ES')}
                                            </TableCell>
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
                                    <TableCell colSpan={4} className="h-24 text-center">
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
                                <CardTitle>{getDetailedTitle()}</CardTitle>
                                <CardDescription>{getDetailedDescription()}</CardDescription>
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
                            {logs.length > 0 ? logs.slice(0, 100).map(log => (
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
