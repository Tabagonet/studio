
"use client";

import React, { useState, useEffect, useMemo } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { PlusCircle, UploadCloud, Settings2, History, BarChart3, Layers, Loader2, Link as LinkIcon, Calendar, Download } from "lucide-react";
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

type FilterType = 'this_month' | 'last_30_days' | 'all_time';

export default function DashboardPage() {
  const [logs, setLogs] = useState<ActivityLog[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [filter, setFilter] = useState<FilterType>('this_month');
  const { toast } = useToast();

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      if (user) {
        setIsLoading(true);
        try {
          const token = await user.getIdToken();
          const response = await fetch('/api/user/activity-logs', {
            headers: { 'Authorization': `Bearer ${token}` }
          });
          if (!response.ok) {
            throw new Error('No se pudo cargar la actividad.');
          }
          const data = await response.json();
          const sortedLogs = data.logs.sort((a: ActivityLog, b: ActivityLog) => 
            new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
          );
          setLogs(sortedLogs);
        } catch (error: any) {
          toast({ title: 'Error', description: error.message, variant: 'destructive' });
        } finally {
          setIsLoading(false);
        }
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
    link.setAttribute("download", `mi-actividad-wooautomate-${formattedDate}.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };


  const renderStats = () => {
    if (isLoading) {
      return (
        <div className="grid gap-6 md:grid-cols-3">
            <Card><CardHeader><CardTitle className="text-sm font-medium">Productos Creados</CardTitle></CardHeader><CardContent><Loader2 className="h-6 w-6 animate-spin" /></CardContent></Card>
            <Card><CardHeader><CardTitle className="text-sm font-medium">Total de Productos</CardTitle></CardHeader><CardContent><Loader2 className="h-6 w-6 animate-spin" /></CardContent></Card>
            <Card><CardHeader><CardTitle className="text-sm font-medium">Webs Utilizadas</CardTitle></CardHeader><CardContent><Loader2 className="h-6 w-6 animate-spin" /></CardContent></Card>
        </div>
      );
    }
    return (
        <div className="grid gap-6 md:grid-cols-3">
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
  
  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-bold tracking-tight text-foreground font-headline">Panel de Control</h1>
        <p className="text-muted-foreground">Bienvenido a WooAutomate. Gestiona tus productos y automatizaciones.</p>
      </div>

      <section aria-labelledby="quick-actions-title">
        <h2 id="quick-actions-title" className="text-xl font-semibold mb-4 text-foreground font-headline">Acciones Rápidas</h2>
        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          <Card className="shadow-lg hover:shadow-xl transition-shadow duration-300 rounded-lg">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-lg font-medium">Crear Nuevo Producto</CardTitle>
              <PlusCircle className="h-6 w-6 text-primary" />
            </CardHeader>
            <CardContent>
              <CardDescription className="mb-4 text-sm">
                Inicia el asistente para añadir productos simples o variables a tu tienda WooCommerce.
              </CardDescription>
              <Button asChild className="w-full">
                <Link href="/wizard">Iniciar Asistente</Link>
              </Button>
            </CardContent>
          </Card>

          <Card className="shadow-lg hover:shadow-xl transition-shadow duration-300 rounded-lg">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-lg font-medium">Procesamiento en Lotes</CardTitle>
              <UploadCloud className="h-6 w-6 text-primary" />
            </CardHeader>
            <CardContent>
              <CardDescription className="mb-4 text-sm">
                Sube imágenes y un archivo CSV para crear productos de forma masiva y eficiente.
              </CardDescription>
              <Button asChild variant="outline" className="w-full">
                <Link href="/batch-process">Iniciar Procesamiento</Link>
              </Button>
            </CardContent>
          </Card>

          <Card className="shadow-lg hover:shadow-xl transition-shadow duration-300 rounded-lg">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-lg font-medium">Configuración</CardTitle>
              <Settings2 className="h-6 w-6 text-primary" />
            </CardHeader>
            <CardContent>
              <CardDescription className="mb-4 text-sm">
                Ajusta plantillas, reglas y claves API para personalizar el plugin.
              </CardDescription>
              <Button asChild variant="secondary" className="w-full">
                 <Link href="/settings">Ir a Configuración</Link>
              </Button>
            </CardContent>
          </Card>
        </div>
      </section>

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
