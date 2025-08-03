
"use client";

import React, { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { FileText, Loader2, RefreshCw } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { auth, onAuthStateChanged } from "@/lib/firebase";
import { PageDataTable } from "./page-data-table";
import type { ContentItem } from '@/lib/types';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import Link from 'next/link';
import { Button } from '@/components/ui/button';

export default function PagesManagementPage() {
  const [data, setData] = useState<ContentItem[]>([]);
  const [scores, setScores] = useState<Record<number, number>>({});
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const router = useRouter();
  const { toast } = useToast();

  const fetchData = useCallback(async (token: string, forceRefresh = false) => {
    setIsLoading(true);
    setError(null);
    try {
        const params = new URLSearchParams();
        if (forceRefresh) {
            params.set('cache_bust', Date.now().toString());
        }

        const contentResponse = await fetch(`/api/wordpress/content-list?${params.toString()}`, { headers: { 'Authorization': `Bearer ${token}` } });

        if (!contentResponse.ok) {
            const errorData = await contentResponse.json();
            throw new Error(errorData.error || 'No se pudo cargar el contenido del sitio.');
        }
        const contentData = await contentResponse.json();
        setData(contentData.content);

        const scoresResponse = await fetch('/api/seo/latest-scores', { headers: { 'Authorization': `Bearer ${token}` } });
        if (scoresResponse.ok) {
            const scoresData = await scoresResponse.json();
            const scoresByUrl: Record<string, number> = scoresData.scores || {};
            const scoresById: Record<number, number> = {};
            const normalizeUrl = (url: string | null) => {
                if(!url) return null;
                try {
                    const parsed = new URL(url);
                    return `${parsed.protocol}//${parsed.hostname}${parsed.pathname.replace(/\/$/, '')}`;
                } catch { return url; }
            };
            const normalizedScoresMap = new Map<string, number>();
            for (const [url, score] of Object.entries(scoresByUrl)) {
                normalizedScoresMap.set(normalizeUrl(url)!, score);
            }
            contentData.content.forEach((item: ContentItem) => {
                if (item.link) {
                  const normalizedItemLink = normalizeUrl(item.link);
                  if (normalizedItemLink && normalizedScoresMap.has(normalizedItemLink)) {
                      scoresById[item.id] = normalizedScoresMap.get(normalizedItemLink)!;
                  }
                }
            });
            setScores(scoresById);
        }

    } catch (err: any) {
        setError(err.message);
        setData([]);
    } finally {
        setIsLoading(false);
    }
  }, []);
  
  const handleRefresh = () => {
    const user = auth.currentUser;
    if (user) {
        toast({ title: "Actualizando...", description: "Sincronizando el contenido con tu sitio de WordPress." });
        user.getIdToken().then(token => fetchData(token, true));
    }
  };

  useEffect(() => {
    const handleAuth = (user: import('firebase/auth').User | null) => {
        if (user) {
            user.getIdToken().then(token => fetchData(token, false));
        } else {
            setIsLoading(false);
            setError("Debes iniciar sesión para usar esta función.");
        }
    };
    const unsubscribe = onAuthStateChanged(auth, handleAuth);
    const handleConnectionsUpdate = () => { if (auth.currentUser) auth.currentUser.getIdToken().then(token => fetchData(token, true)); };
    window.addEventListener('connections-updated', handleConnectionsUpdate);
    return () => {
        unsubscribe();
        window.removeEventListener('connections-updated', handleConnectionsUpdate);
    };
  }, [fetchData]);

  return (
    <div className="container mx-auto py-8 space-y-6">
      <Card>
        <CardHeader className="flex flex-row items-start justify-between">
            <div className="flex items-center space-x-3">
                <FileText className="h-8 w-8 text-primary" />
                <div>
                    <CardTitle>Gestión de Contenido</CardTitle>
                    <CardDescription>Visualiza, filtra y gestiona tus páginas. Haz clic en una fila para optimizar su SEO.</CardDescription>
                </div>
            </div>
            <Button variant="outline" size="sm" onClick={handleRefresh} disabled={isLoading}>
                <RefreshCw className={`mr-2 h-4 w-4 ${isLoading ? 'animate-spin' : ''}`} />
                Refrescar Contenido
            </Button>
        </CardHeader>
      </Card>
      
      {error && !isLoading && (
          <Alert variant="destructive">
            <AlertTitle>No se pudo cargar el contenido</AlertTitle>
            <AlertDescription>
                {error} Revisa que la API de WordPress esté configurada en <Link href="/settings/connections" className="underline font-semibold">Ajustes</Link>.
            </AlertDescription>
          </Alert>
      )}
      
       <PageDataTable 
         data={data} 
         scores={scores}
         isLoading={isLoading} 
         onDataChange={(token: string) => fetchData(token, true)}
       />
    </div>
  );
}
