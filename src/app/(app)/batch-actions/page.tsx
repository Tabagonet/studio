
"use client";

import React, { useState, useEffect, useCallback } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Wand2, Loader2, Sparkles, AlertCircle, Info, CheckCircle } from "lucide-react";
import { useToast } from '@/hooks/use-toast';
import { auth, onAuthStateChanged } from "@/lib/firebase";
import { BatchActionsTable } from './actions-table';
import type { ContentItem } from '@/lib/types';

interface BatchActionStatus {
    id: number;
    title: string;
    status: 'pending' | 'processing' | 'success' | 'failed';
    message: string;
}

export default function BatchActionsPage() {
    const [contentList, setContentList] = useState<ContentItem[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [rowSelection, setRowSelection] = React.useState<Record<string, boolean>>({});
    const [isActionRunning, setIsActionRunning] = useState(false);
    const [actionStatus, setActionStatus] = useState<BatchActionStatus[]>([]);

    const { toast } = useToast();

    const fetchContentData = useCallback(async () => {
        setIsLoading(true);
        const user = auth.currentUser;
        if (!user) {
            setIsLoading(false);
            return;
        }
        try {
            const token = await user.getIdToken();
            const response = await fetch(`/api/wordpress/content-list`, { headers: { 'Authorization': `Bearer ${token}` } });
            if (!response.ok) throw new Error((await response.json()).error || 'No se pudo cargar el contenido.');
            
            const data = await response.json();
            setContentList(data.content.filter((item: ContentItem) => item.type === 'Post' || item.type === 'Page'));
        } catch (error: any) {
            toast({ title: 'Error al Cargar Contenido', description: error.message, variant: 'destructive' });
        } finally {
            setIsLoading(false);
        }
    }, [toast]);
    
    useEffect(() => {
        const unsubscribe = onAuthStateChanged(auth, user => {
            if (user) fetchContentData();
        });
        window.addEventListener('connections-updated', fetchContentData);
        return () => {
            unsubscribe();
            window.removeEventListener('connections-updated', fetchContentData);
        };
    }, [fetchContentData]);
    
    const handleBatchSeoMeta = async () => {
        const selectedRows = Object.keys(rowSelection).map(index => contentList[Number(index)]);
        if (selectedRows.length === 0) {
            toast({ title: "Nada seleccionado", description: "Por favor, selecciona al menos un elemento.", variant: "destructive" });
            return;
        }
        setIsActionRunning(true);
        setActionStatus(selectedRows.map(item => ({ 
            id: item.id, 
            title: item.title,
            status: 'pending', 
            message: 'En cola...' 
        })));
        
        const user = auth.currentUser;
        if (!user) return;
        const token = await user.getIdToken();
        
        for (const item of selectedRows) {
            setActionStatus(prev => prev.map(s => s.id === item.id ? { ...s, status: 'processing', message: 'Generando con IA...' } : s));

            try {
                const response = await fetch('/api/batch-actions/seo-meta', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
                    body: JSON.stringify({ postId: item.id, postType: item.type })
                });

                if (!response.ok) {
                    const errorData = await response.json();
                    throw new Error(errorData.error || 'Error en el servidor');
                }
                const result = await response.json();
                setActionStatus(prev => prev.map(s => s.id === item.id ? { ...s, status: 'success', message: result.message } : s));
            } catch (error: any) {
                setActionStatus(prev => prev.map(s => s.id === item.id ? { ...s, status: 'failed', message: error.message } : s));
            }
        }
        
        toast({ title: "Proceso completado", description: "La generación de metadatos SEO ha finalizado." });
        setIsActionRunning(false);
    };

  return (
    <div className="container mx-auto py-8 space-y-6">
      <Card>
        <CardHeader>
            <div className="flex items-center space-x-3">
                <Wand2 className="h-8 w-8 text-primary" />
                <div>
                    <CardTitle>Procesamiento por Lotes</CardTitle>
                    <CardDescription>Aplica acciones de IA a múltiples entradas y páginas de forma masiva.</CardDescription>
                </div>
            </div>
        </CardHeader>
      </Card>
      
       <Alert>
         <Info className="h-4 w-4" />
        <AlertTitle>¿Cómo funciona esta herramienta?</AlertTitle>
        <AlertDescription>
          Selecciona las entradas y páginas de la tabla de abajo. Luego, elige la acción de IA que quieres aplicar desde el menú de acciones. La herramienta procesará cada elemento uno por uno.
        </AlertDescription>
      </Alert>

      <Card>
        <CardHeader>
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                <div>
                    <CardTitle>1. Selecciona el Contenido</CardTitle>
                    <CardDescription>Elige las entradas y páginas que quieres procesar.</CardDescription>
                </div>
                {isLoading && <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />}
            </div>
        </CardHeader>
        <CardContent>
            <BatchActionsTable data={contentList} isLoading={isLoading} rowSelection={rowSelection} setRowSelection={setRowSelection} />
        </CardContent>
      </Card>
      
       <Card>
        <CardHeader>
          <CardTitle>2. Aplica la Acción de IA</CardTitle>
        </CardHeader>
        <CardContent>
            <Button onClick={handleBatchSeoMeta} disabled={isActionRunning || Object.keys(rowSelection).length === 0}>
                {isActionRunning ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Sparkles className="mr-2 h-4 w-4" />}
                Generar Título y Descripción SEO para ({Object.keys(rowSelection).length}) elementos
            </Button>
        </CardContent>
      </Card>

      {actionStatus.length > 0 && (
         <Card>
            <CardHeader><CardTitle>3. Resultados del Proceso</CardTitle></CardHeader>
            <CardContent>
                <div className="space-y-3 max-h-96 overflow-y-auto pr-2">
                    {actionStatus.map(item => (
                        <div key={item.id} className="flex items-center gap-3 p-2 border rounded-md">
                             {item.status === 'processing' && <Loader2 className="h-4 w-4 animate-spin text-primary" />}
                             {item.status === 'success' && <CheckCircle className="h-4 w-4 text-green-500" />}
                             {item.status === 'failed' && <AlertCircle className="h-4 w-4 text-destructive" />}
                             {item.status === 'pending' && <Loader2 className="h-4 w-4 text-muted-foreground" />}
                             <div className="flex-1">
                                <p className="font-medium text-sm">{item.title}</p>
                                <p className="text-xs text-muted-foreground">{item.message}</p>
                             </div>
                        </div>
                    ))}
                </div>
            </CardContent>
         </Card>
      )}

    </div>
  );
}
