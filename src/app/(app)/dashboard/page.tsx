
"use client";

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { PlusCircle, UploadCloud, History, BarChart3, Layers, Loader2, Link as LinkIcon, Calendar, Download, Newspaper, BrainCircuit, PlayCircle } from "lucide-react";
import Link from "next/link";
import { useToast } from '@/hooks/use-toast';
import { auth, onAuthStateChanged, type FirebaseUser } from '@/lib/firebase';
import type { ActivityLog } from '@/lib/types';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { formatDistanceToNow, parseISO, subDays, startOfMonth } from 'date-fns';
import { es } from 'date-fns/locale';
import Papa from 'papaparse';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';
import { APP_NAME } from '@/lib/constants';
import { Skeleton } from '@/components/ui/skeleton';
import { ShopifyIcon } from '@/components/core/icons';
import { useRouter } from 'next/navigation';

type FilterType = 'this_month' | 'last_30_days' | 'all_time';

interface ConfigStatus {
  wooCommerceConfigured: boolean;
  wordPressConfigured: boolean;
  shopifyConfigured: boolean;
  shopifyPartnerConfigured: boolean; // Added this property
  aiUsageCount?: number;
}

interface UserData {
  role: string | null;
  platform: 'woocommerce' | 'shopify' | null;
  companyPlatform: 'woocommerce' | 'shopify' | null;
  companyName?: string | null;
}

export default function DashboardPage() {
  const router = useRouter();
  const [userData, setUserData] = useState<UserData | null>(null);
  const [logs, setLogs] = useState<ActivityLog[]>([]);
  const [configStatus, setConfigStatus] = useState<ConfigStatus | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  
  const [filter, setFilter] = useState<FilterType>('this_month');
  const [isTestRunning, setIsTestRunning] = useState(false);
  const { toast } = useToast();
  
  const fetchData = useCallback(async (user: FirebaseUser) => {
    setIsLoading(true);
    try {
        const token = await user.getIdToken();
        const [userResponse, configResponse, logsResponse] = await Promise.all([
            fetch('/api/user/verify', { headers: { 'Authorization': `Bearer ${token}` } }),
            fetch('/api/check-config', { headers: { 'Authorization': `Bearer ${token}` } }),
            fetch('/api/user/activity-logs', { headers: { 'Authorization': `Bearer ${token}` } })
        ]);

        if (!userResponse.ok) throw new Error('No se pudo verificar el usuario.');
        const fetchedUserData = await userResponse.json();
        setUserData(fetchedUserData);

        if (!configResponse.ok) throw new Error('No se pudo verificar la configuración.');
        setConfigStatus(await configResponse.json());
        
        if (!logsResponse.ok) throw new Error('No se pudo cargar la actividad.');
        const logsData = await logsResponse.json();
        setLogs(logsData.logs.sort((a: ActivityLog, b: ActivityLog) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()));

    } catch (error: any) {
        toast({ title: 'Error al cargar el panel', description: error.message, variant: 'destructive' });
        setUserData(null); setConfigStatus(null); setLogs([]);
    } finally {
        setIsLoading(false);
    }
  }, [toast]);
  
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
        if (user) {
            fetchData(user);
        } else {
            setIsLoading(false);
        }
    });

    const handleConnectionsUpdate = () => {
        if (auth.currentUser) fetchData(auth.currentUser);
    };
    window.addEventListener('connections-updated', handleConnectionsUpdate);

    return () => {
        unsubscribe();
        window.removeEventListener('connections-updated', handleConnectionsUpdate);
    };
  }, [fetchData]);

  const handleRunTest = async () => {
    setIsTestRunning(true);
    console.log('[Paso 1] Iniciando prueba de creación de tienda...');
    
    const user = auth.currentUser;
    if (!user) {
        toast({ title: 'Error de Autenticación', description: 'Por favor, inicia sesión para realizar esta acción.', variant: 'destructive' });
        setIsTestRunning(false);
        return;
    }

    try {
        console.log('[Paso 2] Obteniendo token y llamando a la API...');
        const token = await user.getIdToken();
        
        const response = await fetch('/api/shopify/trigger-test-creation', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`,
            }
        });

        const result = await response.json();

        if (response.ok) {
          console.log('[Paso 3] Éxito. La API respondió:', result);
          toast({ title: '¡Éxito!', description: '¡Trabajo de creación de tienda enviado! Revisa el progreso en la sección de Trabajos.' });
          router.push('/shopify/jobs');
        } else {
          console.error('[ERROR] La API falló:', result.error);
          throw new Error(result.error || `La API respondió con un estado inesperado: ${response.status}`);
        }

    } catch(error: any) {
        console.error('Error al iniciar la prueba de creación de tienda:', error);
        toast({ title: 'Error en la Prueba', description: error.message, variant: 'destructive', duration: 10000 });
    } finally {
        setIsTestRunning(false);
    }
  }

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

  const stats = useMemo(() => {
    const productCreationLogs = logs.filter(log => log.action === 'PRODUCT_CREATED');
    const connections = new Set(productCreationLogs.map(log => log.details.connectionKey).filter(Boolean));
    return {
      totalProducts: productCreationLogs.length,
      connectionsUsed: connections.size,
      productsInPeriod: filteredLogs.filter(log => log.action === 'PRODUCT_CREATED').length,
    };
  }, [logs, filteredLogs]);

  const filterOptions: { value: FilterType; label: string }[] = [
    { value: 'this_month', label: 'Este Mes' },
    { value: 'last_30_days', label: 'Últimos 30 Días' },
    { value: 'all_time', label: 'Desde Siempre' },
  ];
  
  const handleExportCsv = () => {
    if (logs.length === 0) {
        toast({ title: 'Nada que exportar', description: 'No tienes registros de actividad para exportar.', variant: "destructive" });
        return;
    }
    
    const dataToExport = logs.map(log => ({
        'Fecha': new Date(log.timestamp).toLocaleString('es-ES'),
        'Producto': log.details.productName || 'N/A',
        'Conexión': log.details.connectionKey || 'N/A',
        'Origen': log.details.source || 'Desconocido',
    }));

    const csv = Papa.unparse(dataToExport);
    const blob = new Blob(["\uFEFF" + csv], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement("a");
    const url = URL.createObjectURL(blob);
    link.setAttribute("href", url);
    const formattedDate = new Date().toISOString().split('T')[0];
    link.setAttribute("download", `mi-actividad-autopress-ai-${formattedDate}.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };
  
  const getStatsTitle = () => {
    if (userData?.role === 'super_admin') return "Actividad Global de la Plataforma";
    if (userData?.role === 'admin') return `Actividad de la Empresa: ${userData.companyName || ''}`;
    return "Tu Actividad";
  };

  const getStatsSubtitle = (period: string | undefined) => {
    const periodText = period || '';
    if (userData?.role === 'super_admin') return `En toda la plataforma (${periodText})`;
    if (userData?.role === 'admin') return `En tu empresa (${periodText})`;
    return periodText;
  }
  
  const getTotalSubtitle = () => {
    if (userData?.role === 'super_admin') return "En toda la plataforma";
    if (userData?.role === 'admin') return "En tu empresa";
    return "Creados con la aplicación";
  }

  const getRecentActivityTitle = () => {
      if (userData?.role === 'super_admin') return "Actividad Reciente Global";
      if (userData?.role === 'admin') return "Actividad Reciente de la Empresa";
      return "Tu Actividad Reciente";
  };

  const isSuperAdmin = userData?.role === 'super_admin';
  const effectivePlatform = userData?.companyPlatform || userData?.platform;
  const showWooCommerce = isSuperAdmin || effectivePlatform === 'woocommerce';
  const showShopify = isSuperAdmin || effectivePlatform === 'shopify';

  const wooConfigured = !!configStatus?.wooCommerceConfigured;
  const wpConfigured = !!configStatus?.wordPressConfigured;
  const wooWpConfigured = wooConfigured && wpConfigured;

  const shopifyPartnerConfigured = !!configStatus?.shopifyPartnerConfigured;

  if (isLoading) {
    return (
        <div className="space-y-8">
            <Skeleton className="h-24 w-full" />
            <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
                <Skeleton className="h-48 w-full" />
                <Skeleton className="h-48 w-full" />
                <Skeleton className="h-48 w-full" />
            </div>
            <Skeleton className="h-64 w-full" />
        </div>
    );
  }

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-bold tracking-tight text-foreground font-headline">Panel de Control</h1>
        <p className="text-muted-foreground">Bienvenido a {APP_NAME}. Gestiona tus automatizaciones y contenidos.</p>
      </div>

      {showWooCommerce && (
        <section aria-labelledby="woocommerce-tools-title">
          {isSuperAdmin && <h2 id="woocommerce-tools-title" className="text-lg font-semibold mb-4 text-primary">Herramientas WooCommerce/WordPress</h2>}
          <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
            <TooltipProvider>
                <Tooltip delayDuration={100}>
                  <TooltipTrigger asChild>
                    <div className={cn(!wooWpConfigured && "cursor-not-allowed")}>
                      <Card className={cn("shadow-lg hover:shadow-xl transition-shadow duration-300 flex flex-col", !wooWpConfigured && "bg-muted/50")}>
                        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2"><CardTitle className="text-lg font-medium">Crear Nuevo Producto</CardTitle><PlusCircle className="h-6 w-6 text-primary" /></CardHeader>
                        <CardContent className="flex flex-col flex-grow">
                          <CardDescription className="mb-4 text-sm">Inicia el asistente para añadir productos a tu tienda WooCommerce.</CardDescription>
                          <Button asChild className="w-full mt-auto" disabled={!wooWpConfigured}><Link href="/wizard" className={cn(!wooWpConfigured && "pointer-events-none")}>Iniciar Asistente</Link></Button>
                        </CardContent>
                      </Card>
                    </div>
                  </TooltipTrigger>
                  {!wooWpConfigured && (<TooltipContent><p>Configuración de WooCommerce/WordPress incompleta.</p></TooltipContent>)}
                </Tooltip>
            </TooltipProvider>
            <TooltipProvider>
              <Tooltip delayDuration={100}>
                <TooltipTrigger asChild>
                  <div className={cn(!wooWpConfigured && "cursor-not-allowed")}>
                    <Card className={cn("shadow-lg hover:shadow-xl transition-shadow duration-300 flex flex-col", !wooWpConfigured && "bg-muted/50")}>
                      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2"><CardTitle className="text-lg font-medium">Procesamiento en Lotes</CardTitle><UploadCloud className="h-6 w-6 text-primary" /></CardHeader>
                      <CardContent className="flex flex-col flex-grow">
                        <CardDescription className="mb-4 text-sm">Sube un CSV para crear productos de forma masiva y eficiente.</CardDescription>
                        <Button asChild variant="outline" className="w-full mt-auto" disabled={!wooWpConfigured}><Link href="/batch-process" className={cn(!wooWpConfigured && "pointer-events-none")}>Iniciar Procesamiento</Link></Button>
                      </CardContent>
                    </Card>
                  </div>
                </TooltipTrigger>
                {!wooWpConfigured && (<TooltipContent><p>Configuración de WooCommerce/WordPress incompleta.</p></TooltipContent>)}
              </Tooltip>
            </TooltipProvider>
            <TooltipProvider>
              <Tooltip delayDuration={100}>
                <TooltipTrigger asChild>
                  <div className={cn(!wpConfigured && "cursor-not-allowed")}>
                    <Card className={cn("shadow-lg hover:shadow-xl transition-shadow duration-300 flex flex-col", !wpConfigured && "bg-muted/50")}>
                      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2"><CardTitle className="text-lg font-medium">Crear Nueva Entrada</CardTitle><Newspaper className="h-6 w-6 text-primary" /></CardHeader>
                      <CardContent className="flex flex-col flex-grow">
                        <CardDescription className="mb-4 text-sm">Usa el asistente con IA para generar contenido para tu blog.</CardDescription>
                        <Button asChild variant="secondary" className="w-full mt-auto" disabled={!wpConfigured}><Link href="/blog-creator" className={cn(!wpConfigured && "pointer-events-none")}>Crear Entrada</Link></Button>
                      </CardContent>
                    </Card>
                  </div>
                </TooltipTrigger>
                {!wpConfigured && (<TooltipContent><p>Configuración de WordPress incompleta.</p></TooltipContent>)}
              </Tooltip>
            </TooltipProvider>
          </div>
        </section>
      )}

      {showShopify && (
         <section aria-labelledby="shopify-tools-title">
          {isSuperAdmin && <h2 id="shopify-tools-title" className="text-lg font-semibold my-4 text-[#7ab55c]">Herramientas Shopify</h2>}
          <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
             <TooltipProvider>
                <Tooltip delayDuration={100}>
                  <TooltipTrigger asChild>
                    <div className={cn(!configStatus?.shopifyPartnerConfigured && "cursor-not-allowed")}>
                      <Card className={cn("shadow-lg hover:shadow-xl transition-shadow duration-300 flex flex-col", !configStatus?.shopifyPartnerConfigured && "bg-muted/50")}>
                        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2"><CardTitle className="text-lg font-medium">Prueba de Creación de Tienda</CardTitle><PlayCircle className="h-6 w-6 text-[#7ab55c]" /></CardHeader>
                        <CardContent className="flex flex-col flex-grow">
                          <CardDescription className="mb-4 text-sm">Ejecuta una prueba completa del flujo de creación de tiendas de desarrollo con datos de ejemplo.</CardDescription>
                          <Button onClick={handleRunTest} disabled={isTestRunning || !configStatus?.shopifyPartnerConfigured}>
                            {isTestRunning ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <ShopifyIcon className="mr-2 h-4 w-4" />}
                            {isTestRunning ? 'Ejecutando...' : 'Iniciar Prueba'}
                          </Button>
                        </CardContent>
                      </Card>
                    </div>
                  </TooltipTrigger>
                  {!configStatus?.shopifyPartnerConfigured && (<TooltipContent><p>La conexión global de Shopify Partner no está configurada.</p></TooltipContent>)}
                </Tooltip>
            </TooltipProvider>
          </div>
        </section>
      )}
      
      {showWooCommerce && (
        <>
          <section aria-labelledby="statistics-title">
            <div className="flex justify-between items-center mb-4">
                <h2 id="statistics-title" className="text-xl font-semibold text-foreground font-headline">{getStatsTitle()}</h2>
                <Select value={filter} onValueChange={(value: FilterType) => setFilter(value)}>
                    <SelectTrigger className="w-[180px]"><Calendar className="mr-2 h-4 w-4" /><SelectValue placeholder="Seleccionar periodo" /></SelectTrigger>
                    <SelectContent>{filterOptions.map(option => (<SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>))}</SelectContent>
                </Select>
            </div>
            <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4">
              <Card><CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2"><CardTitle className="text-sm font-medium">Productos Creados</CardTitle><BarChart3 className="h-4 w-4 text-muted-foreground" /></CardHeader><CardContent><div className="text-2xl font-bold">{stats.productsInPeriod}</div><p className="text-xs text-muted-foreground">{getStatsSubtitle(filterOptions.find(f => f.value === filter)?.label)}</p></CardContent></Card>
              <Card><CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2"><CardTitle className="text-sm font-medium">Total Productos Histórico</CardTitle><Layers className="h-4 w-4 text-muted-foreground" /></CardHeader><CardContent><div className="text-2xl font-bold">{stats.totalProducts}</div><p className="text-xs text-muted-foreground">{getTotalSubtitle()}</p></CardContent></Card>
              <Card><CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2"><CardTitle className="text-sm font-medium">Webs Utilizadas</CardTitle><LinkIcon className="h-4 w-4 text-muted-foreground" /></CardHeader><CardContent><div className="text-2xl font-bold">{stats.connectionsUsed}</div><p className="text-xs text-muted-foreground">Conexiones API activas usadas</p></CardContent></Card>
              <Card><CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2"><CardTitle className="text-sm font-medium">{userData?.role === 'user' ? 'Generaciones con IA' : 'Tus Generaciones con IA'}</CardTitle><BrainCircuit className="h-4 w-4 text-muted-foreground" /></CardHeader><CardContent><div className="text-2xl font-bold">{configStatus?.aiUsageCount || 0}</div><p className="text-xs text-muted-foreground">{userData?.role === 'user' ? 'Total de usos de la API de IA' : 'Esta es una métrica personal'}</p></CardContent></Card>
            </div>
          </section>

          <section aria-labelledby="recent-activity-title">
            <h2 id="recent-activity-title" className="text-xl font-semibold mb-4 text-foreground font-headline">{getRecentActivityTitle()}</h2>
            <Card className="shadow-lg rounded-lg">
                <CardHeader className="flex flex-row items-center justify-between">
                     <CardTitle className="text-lg font-medium">Últimos Productos Procesados</CardTitle>
                     <Button variant="outline" size="sm" onClick={handleExportCsv}><Download className="mr-2 h-4 w-4" />Exportar Actividad</Button>
                </CardHeader>
                <CardContent className="p-0">
                    {logs.length === 0 ? <p className="text-muted-foreground p-4 text-center">Aún no hay actividad reciente.</p> : (
                      <Table>
                        <TableHeader><TableRow><TableHead>Producto</TableHead><TableHead>Conexión</TableHead><TableHead>Origen</TableHead><TableHead className="text-right">Fecha</TableHead></TableRow></TableHeader>
                        <TableBody>
                          {logs.slice(0, 5).map(log => (
                            <TableRow key={log.id}>
                              <TableCell className="font-medium">{log.details.productName || 'N/A'}</TableCell>
                              <TableCell><Badge variant="outline">{log.details.connectionKey || 'N/A'}</Badge></TableCell>
                              <TableCell className="capitalize">{log.details.source || 'Desconocido'}</TableCell>
                              <TableCell className="text-right text-xs text-muted-foreground">{formatDistanceToNow(parseISO(log.timestamp), { addSuffix: true, locale: es })}</TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    )}
                </CardContent>
            </Card>
          </section>
        </>
      )}
    </div>
  );
}
