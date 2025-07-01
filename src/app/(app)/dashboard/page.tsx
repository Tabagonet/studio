
"use client";

import React, { useState, useEffect, useMemo } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { PlusCircle, UploadCloud, History, BarChart3, Layers, Loader2, Link as LinkIcon, Calendar, Download, Newspaper, BrainCircuit } from "lucide-react";
import Link from "next/link";
import { useToast } from '@/hooks/use-toast';
import { auth, onAuthStateChanged } from '@/lib/firebase';
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

type FilterType = 'this_month' | 'last_30_days' | 'all_time';

interface ConfigStatus {
  wooCommerceConfigured: boolean;
  wordPressConfigured: boolean;
  aiUsageCount?: number; // Now optional
}


export default function DashboardPage() {
  const [logs, setLogs] = useState<ActivityLog[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [filter, setFilter] = useState<FilterType>('this_month');
  const { toast } = useToast();

  const [configStatus, setConfigStatus] = useState<ConfigStatus | null>(null);
  const [isLoadingConfig, setIsLoadingConfig] = useState(true);

  useEffect(() => {
    const handleAuthChange = async (user: import('firebase/auth').User | null) => {
      if (user) {
        setIsLoading(true);
        setIsLoadingConfig(true);
        
        try {
          const token = await user.getIdToken();
          
          // Fetch activity logs
          const logsPromise = fetch('/api/user/activity-logs', {
            headers: { 'Authorization': `Bearer ${token}` }
          });
          
          // Fetch config status
          const configPromise = fetch('/api/check-config', {
            headers: { 'Authorization': `Bearer ${token}` }
          });

          const [logsResponse, configResponse] = await Promise.all([logsPromise, configPromise]);

          if (!logsResponse.ok) throw new Error('No se pudo cargar la actividad.');
          const logsData = await logsResponse.json();
          const sortedLogs = logsData.logs.sort((a: ActivityLog, b: ActivityLog) => 
            new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
          );
          setLogs(sortedLogs);
          
          if (!configResponse.ok) throw new Error('No se pudo verificar la configuración.');
          setConfigStatus(await configResponse.json());

        } catch (error: any) {
          toast({ title: 'Error', description: error.message, variant: 'destructive' });
        } finally {
          setIsLoading(false);
          setIsLoadingConfig(false);
        }
      } else {
        setIsLoading(false);
        setIsLoadingConfig(false);
        setLogs([]);
        setConfigStatus(null);
      }
    };

    const unsubscribe = onAuthStateChanged(auth, handleAuthChange);
    
    // Also re-check config when connections are updated
    const handleConnectionsUpdate = () => {
        if (auth.currentUser) handleAuthChange(auth.currentUser);
    };
    window.addEventListener('connections-updated', handleConnectionsUpdate);

    return () => {
      unsubscribe();
      window.removeEventListener('connections-updated', handleConnectionsUpdate);
    };
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
    return logs; // 'all_time'
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

  const renderStats = () => {
    if (isLoading) {
      return (
        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4">
            <Card><CardHeader><CardTitle className="text-sm font-medium">Productos Creados</CardTitle></CardHeader><CardContent><Loader2 className="h-6 w-6 animate-spin" /></CardContent></Card>
            <Card><CardHeader><CardTitle className="text-sm font-medium">Total de Productos</CardTitle></CardHeader><CardContent><Loader2 className="h-6 w-6 animate-spin" /></CardContent></Card>
            <Card><CardHeader><CardTitle className="text-sm font-medium">Webs Utilizadas</CardTitle></CardHeader><CardContent><Loader2 className="h-6 w-6 animate-spin" /></CardContent></Card>
            <Card><CardHeader><CardTitle className="text-sm font-medium">Uso de IA</CardTitle></CardHeader><CardContent><Loader2 className="h-6 w-6 animate-spin" /></CardContent></Card>
        </div>
      );
    }
    return (
        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Productos Creados</CardTitle>
              <BarChart3 className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats.productsInPeriod}</div>
              <p className="text-xs text-muted-foreground">
                {filterOptions.find(f => f.value === filter)?.label}
              </p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Total Productos Histórico</CardTitle>
              <Layers className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats.totalProducts}</div>
              <p className="text-xs text-muted-foreground">Creados con la aplicación</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Webs Utilizadas</CardTitle>
              <LinkIcon className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats.connectionsUsed}</div>
              <p className="text-xs text-muted-foreground">Conexiones API activas usadas</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Generaciones con IA</CardTitle>
              <BrainCircuit className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{configStatus?.aiUsageCount || 0}</div>
              <p className="text-xs text-muted-foreground">Total de usos de la API de IA</p>
            </CardContent>
          </Card>
        </div>
    );
  }

  const renderRecentActivity = () => {
     if (isLoading) {
        return (
            <div className="flex items-center justify-center min-h-[200px]">
                <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
        );
    }
    if (logs.length === 0) {
        return <p className="text-muted-foreground p-4 text-center">Aún no hay actividad reciente. ¡Crea tu primer producto!</p>;
    }
    return (
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Producto</TableHead>
            <TableHead>Conexión</TableHead>
            <TableHead>Origen</TableHead>
            <TableHead className="text-right">Fecha</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {logs.slice(0, 5).map(log => (
            <TableRow key={log.id}>
              <TableCell className="font-medium">{log.details.productName || 'N/A'}</TableCell>
              <TableCell><Badge variant="outline">{log.details.connectionKey || 'N/A'}</Badge></TableCell>
              <TableCell className="capitalize">{log.details.source || 'Desconocido'}</TableCell>
              <TableCell className="text-right text-xs text-muted-foreground">
                {formatDistanceToNow(parseISO(log.timestamp), { addSuffix: true, locale: es })}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    );
  }

  const wooConfigured = !isLoadingConfig && !!configStatus?.wooCommerceConfigured;
  const wpConfigured = !isLoadingConfig && !!configStatus?.wordPressConfigured;
  
  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-bold tracking-tight text-foreground font-headline">Panel de Control</h1>
        <p className="text-muted-foreground">Bienvenido a {APP_NAME}. Gestiona tus productos y automatizaciones.</p>
      </div>

      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
        <TooltipProvider>
            <Tooltip delayDuration={100}>
              <TooltipTrigger asChild>
                <div className={cn(!wooConfigured && "cursor-not-allowed")}>
                  <Card className={cn("shadow-lg hover:shadow-xl transition-shadow duration-300 flex flex-col", !wooConfigured && "bg-muted/50")}>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                      <CardTitle className="text-lg font-medium">Crear Nuevo Producto</CardTitle>
                      <PlusCircle className="h-6 w-6 text-primary" />
                    </CardHeader>
                    <CardContent className="flex flex-col flex-grow">
                      <CardDescription className="mb-4 text-sm">
                        Inicia el asistente para añadir productos simples o variables a tu tienda WooCommerce.
                      </CardDescription>
                      <Button asChild className="w-full mt-auto" disabled={!wooConfigured}>
                        <Link href="/wizard" className={cn(!wooConfigured && "pointer-events-none")}>Iniciar Asistente</Link>
                      </Button>
                    </CardContent>
                  </Card>
                </div>
              </TooltipTrigger>
              {!wooConfigured && (
                <TooltipContent>
                  <p>Configuración de WooCommerce incompleta. Ve a Ajustes.</p>
                </TooltipContent>
              )}
            </Tooltip>
        </TooltipProvider>

        <TooltipProvider>
            <Tooltip delayDuration={100}>
              <TooltipTrigger asChild>
                <div className={cn(!wooConfigured && "cursor-not-allowed")}>
                  <Card className={cn("shadow-lg hover:shadow-xl transition-shadow duration-300 flex flex-col", !wooConfigured && "bg-muted/50")}>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                      <CardTitle className="text-lg font-medium">Procesamiento en Lotes</CardTitle>
                      <UploadCloud className="h-6 w-6 text-primary" />
                    </CardHeader>
                    <CardContent className="flex flex-col flex-grow">
                      <CardDescription className="mb-4 text-sm">
                        Sube imágenes y un archivo CSV para crear productos de forma masiva y eficiente.
                      </CardDescription>
                      <Button asChild variant="outline" className="w-full mt-auto" disabled={!wooConfigured}>
                        <Link href="/batch-process" className={cn(!wooConfigured && "pointer-events-none")}>Iniciar Procesamiento</Link>
                      </Button>
                    </CardContent>
                  </Card>
                </div>
              </TooltipTrigger>
              {!wooConfigured && (
                <TooltipContent>
                  <p>Configuración de WooCommerce incompleta. Ve a Ajustes.</p>
                </TooltipContent>
              )}
            </Tooltip>
        </TooltipProvider>

        <TooltipProvider>
            <Tooltip delayDuration={100}>
              <TooltipTrigger asChild>
                <div className={cn(!wpConfigured && "cursor-not-allowed")}>
                  <Card className={cn("shadow-lg hover:shadow-xl transition-shadow duration-300 flex flex-col", !wpConfigured && "bg-muted/50")}>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                      <CardTitle className="text-lg font-medium">Crear Nueva Entrada</CardTitle>
                      <Newspaper className="h-6 w-6 text-primary" />
                    </CardHeader>
                    <CardContent className="flex flex-col flex-grow">
                      <CardDescription className="mb-4 text-sm">
                        Usa el asistente con IA para generar nuevo contenido y traducciones para tu blog.
                      </CardDescription>
                      <Button asChild variant="secondary" className="w-full mt-auto" disabled={!wpConfigured}>
                         <Link href="/blog-creator" className={cn(!wpConfigured && "pointer-events-none")}>Crear Entrada</Link>
                      </Button>
                    </CardContent>
                  </Card>
                </div>
              </TooltipTrigger>
              {!wpConfigured && (
                <TooltipContent>
                  <p>Configuración de WordPress incompleta. Ve a Ajustes.</p>
                </TooltipContent>
              )}
            </Tooltip>
        </TooltipProvider>
      </div>

      <section aria-labelledby="statistics-title">
        <div className="flex justify-between items-center mb-4">
            <h2 id="statistics-title" className="text-xl font-semibold text-foreground font-headline">Tu Actividad</h2>
            <Select value={filter} onValueChange={(value: FilterType) => setFilter(value)}>
                <SelectTrigger className="w-[180px]">
                    <Calendar className="mr-2 h-4 w-4" />
                    <SelectValue placeholder="Seleccionar periodo" />
                </SelectTrigger>
                <SelectContent>
                    {filterOptions.map(option => (
                        <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>
                    ))}
                </SelectContent>
            </Select>
        </div>
        {renderStats()}
      </section>

      <section aria-labelledby="recent-activity-title">
        <h2 id="recent-activity-title" className="text-xl font-semibold mb-4 text-foreground font-headline">Actividad Reciente</h2>
        <Card className="shadow-lg rounded-lg">
            <CardHeader className="flex flex-row items-center justify-between">
                 <CardTitle className="text-lg font-medium">Últimos Productos Procesados</CardTitle>
                 <Button variant="outline" size="sm" onClick={handleExportCsv}>
                    <Download className="mr-2 h-4 w-4" />
                    Exportar Actividad
                 </Button>
            </CardHeader>
            <CardContent className="p-0">
                {renderRecentActivity()}
            </CardContent>
        </Card>
      </section>
    </div>
  );
}
