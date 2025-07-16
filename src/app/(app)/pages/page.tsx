
"use client";

import React, { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { FileText, Loader2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { auth, onAuthStateChanged } from "@/lib/firebase";
import { PageDataTable } from "./page-data-table";
import type { ContentItem, HierarchicalContentItem } from '@/lib/types';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import Link from 'next/link';

export default function PagesManagementPage() {
  const [data, setData] = useState<HierarchicalContentItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isAnalyzingId, setIsAnalyzingId] = useState<number | null>(null);

  const router = useRouter();
  const { toast } = useToast();

  const fetchContentData = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    const user = auth.currentUser;
    if (!user) {
        setError("Debes iniciar sesión para usar esta función.");
        setIsLoading(false);
        return;
    }
    try {
        const token = await user.getIdToken();
        const response = await fetch(`/api/wordpress/content-list`, { headers: { 'Authorization': `Bearer ${token}` } });
        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.error || 'No se pudo cargar el contenido del sitio.');
        }
        const apiData: { content: ContentItem[] } = await response.json();
        const pagesOnly = apiData.content.filter(item => item.type === 'Page');
        
        const itemsById = new Map<number, HierarchicalContentItem>(pagesOnly.map((p) => [p.id, { ...p, subRows: [] }]));
        const roots: HierarchicalContentItem[] = [];
        
        pagesOnly.forEach(item => {
            if (item.parent && itemsById.has(item.parent)) {
                const parent = itemsById.get(item.parent);
                parent?.subRows?.push(itemsById.get(item.id)!);
            } else {
                roots.push(itemsById.get(item.id)!);
            }
        });

        setData(roots);

    } catch (err: any) {
        setError(err.message);
        setData([]);
    } finally {
        setIsLoading(false);
    }
  }, []);
  
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
        if (user) fetchContentData();
    });
    window.addEventListener('connections-updated', fetchContentData);
    return () => {
        unsubscribe();
        window.removeEventListener('connections-updated', fetchContentData);
    };
  }, [fetchContentData]);
  
  const handleAnalyze = async (item: ContentItem) => {
    setIsAnalyzingId(item.id);
    const user = auth.currentUser;
    if (!user) {
        toast({ title: "No autenticado", variant: "destructive" });
        setIsAnalyzingId(null);
        return;
    }
    try {
        const token = await user.getIdToken();
        await fetch('/api/seo/analyze-url', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
            body: JSON.stringify({ url: item.link, postId: item.id, postType: item.type }),
        });
        toast({ title: "Análisis en progreso", description: "Redirigiendo a la página del informe..." });
        router.push(`/seo-optimizer?id=${item.id}&type=${item.type}`);
    } catch (err: any) {
        toast({ title: 'Error al analizar', description: err.message, variant: 'destructive' });
    } finally {
         setIsAnalyzingId(null);
    }
  };

  const handleEdit = (item: ContentItem) => {
      router.push(`/seo-optimizer/edit/${item.id}?type=${item.type}`);
  };

  return (
    <div className="container mx-auto py-8 space-y-6">
      <Card>
        <CardHeader>
            <div className="flex items-center space-x-3">
                <FileText className="h-8 w-8 text-primary" />
                <div>
                    <CardTitle>Gestión de Páginas</CardTitle>
                    <CardDescription>Visualiza, filtra y gestiona todas las páginas de tu sitio WordPress.</CardDescription>
                </div>
            </div>
        </CardHeader>
      </Card>
      
      {error && !isLoading && (
          <Alert variant="destructive">
            <AlertTitle>No se pudo cargar la lista de páginas</AlertTitle>
            <AlertDescription>
                {error} Revisa que la API de WordPress esté configurada en <Link href="/settings/connections" className="underline font-semibold">Ajustes</Link>.
            </AlertDescription>
          </Alert>
      )}

      {isLoading ? (
          <div className="flex justify-center items-center h-64 border rounded-md">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
      ) : !error && (
           <PageDataTable data={data} isLoading={isLoading} onAnalyzePage={handleAnalyze} onEditPage={handleEdit} isAnalyzingId={isAnalyzingId} />
      )}
    </div>
  );
}
