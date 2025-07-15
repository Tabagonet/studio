
"use client";

import React, { useState, useEffect, useCallback } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Lightbulb, Loader2, Sparkles, Wand2, Newspaper, Trash2 } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { auth, onAuthStateChanged } from "@/lib/firebase";
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { deleteStrategyPlanAction } from './actions';


interface KeywordCluster {
  topic: string;
  intent: 'Informativa' | 'Comercial' | 'Transaccional' | 'Navegacional';
  articles: {
    title: string;
    keywords: string[];
  }[];
}

export interface StrategyPlan {
  id?: string;
  businessContext: string;
  url?: string | null;
  createdAt?: string;
  pillarContent: {
    title: string;
    description: string;
  };
  keywordClusters: KeywordCluster[];
}


const PlanHistory = ({ history, onViewPlan, onDeletePlan }: { history: StrategyPlan[], onViewPlan: (plan: StrategyPlan) => void, onDeletePlan: (planId: string) => void }) => {
    if (history.length === 0) return null;

    return (
        <Card>
            <CardHeader>
                <CardTitle>Historial de Planes</CardTitle>
                <CardDescription>Consulta o elimina los planes que has generado anteriormente.</CardDescription>
            </CardHeader>
            <CardContent>
                <Table>
                    <TableHeader>
                        <TableRow>
                            <TableHead>Contexto Utilizado</TableHead>
                            <TableHead>Fecha</TableHead>
                            <TableHead className="text-right">Acciones</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {history.map((item) => (
                            <TableRow key={item.id}>
                                <TableCell className="font-medium max-w-sm truncate">{item.businessContext}</TableCell>
                                <TableCell>{item.createdAt ? format(new Date(item.createdAt), "d MMM yyyy, HH:mm", { locale: es }) : 'N/A'}</TableCell>
                                <TableCell className="text-right">
                                    <div className="flex gap-2 justify-end">
                                      <Button variant="outline" size="sm" onClick={() => onViewPlan(item)}>Ver Plan</Button>
                                       <AlertDialog>
                                            <AlertDialogTrigger asChild>
                                                <Button variant="ghost" size="icon" className="text-destructive"><Trash2 className="h-4 w-4" /></Button>
                                            </AlertDialogTrigger>
                                            <AlertDialogContent>
                                                <AlertDialogHeader>
                                                    <AlertDialogTitle>¿Confirmar eliminación?</AlertDialogTitle>
                                                    <AlertDialogDescription>Esta acción no se puede deshacer. Se eliminará permanentemente este plan estratégico.</AlertDialogDescription>
                                                </AlertDialogHeader>
                                                <AlertDialogFooter>
                                                    <AlertDialogCancel>Cancelar</AlertDialogCancel>
                                                    <AlertDialogAction onClick={() => onDeletePlan(item.id!)} className="bg-destructive hover:bg-destructive/90">Sí, eliminar</AlertDialogAction>
                                                </AlertDialogFooter>
                                            </AlertDialogContent>
                                        </AlertDialog>
                                    </div>
                                </TableCell>
                            </TableRow>
                        ))}
                    </TableBody>
                </Table>
            </CardContent>
        </Card>
    )
}

const PlanView = ({ plan, onReset }: { plan: StrategyPlan, onReset: () => void }) => {
    return (
        <div className="space-y-6">
            <Card>
                <CardHeader>
                     <div className="flex items-center justify-between">
                        <div>
                            <CardTitle>Tu Plan Estratégico de Contenidos</CardTitle>
                            {plan.url && <CardDescription>Estrategia generada para: {plan.url}</CardDescription>}
                        </div>
                         <Button onClick={onReset} variant="outline"><Newspaper className="mr-2 h-4 w-4"/>Crear Nuevo Plan</Button>
                    </div>
                </CardHeader>
                <CardContent className="space-y-6">
                    <Alert>
                        <AlertTitle className="font-bold text-lg">Contenido Pilar: {plan.pillarContent.title}</AlertTitle>
                        <AlertDescription>{plan.pillarContent.description}</AlertDescription>
                    </Alert>

                    <div className="space-y-4">
                        {plan.keywordClusters.map((cluster, index) => (
                            <Card key={index}>
                                <CardHeader>
                                    <CardTitle className="text-xl">Cluster Temático: {cluster.topic}</CardTitle>
                                    <CardDescription>Intención de búsqueda: <strong>{cluster.intent}</strong></CardDescription>
                                </CardHeader>
                                <CardContent>
                                    <ul className="list-disc list-inside space-y-2">
                                        {cluster.articles.map((article, i) => (
                                            <li key={i}>
                                                <span className="font-semibold">{article.title}</span>
                                                <p className="text-sm text-muted-foreground pl-4">Palabras clave: {article.keywords.join(', ')}</p>
                                            </li>
                                        ))}
                                    </ul>
                                </CardContent>
                            </Card>
                        ))}
                    </div>
                </CardContent>
            </Card>
        </div>
    )
}


export default function ContentStrategyPage() {
  const [context, setContext] = useState('');
  const [url, setUrl] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isFetchingContext, setIsFetchingContext] = useState(false);
  const [strategyPlan, setStrategyPlan] = useState<StrategyPlan | null>(null);
  
  const [history, setHistory] = useState<StrategyPlan[]>([]);
  const [isLoadingHistory, setIsLoadingHistory] = useState(true);

  const { toast } = useToast();
  
  const fetchHistory = useCallback(async () => {
    setIsLoadingHistory(true);
    console.log('[Content Strategy Page] Starting to fetch history...');
    const user = auth.currentUser;
    if (!user) {
        setIsLoadingHistory(false);
        setHistory([]);
        console.log('[Content Strategy Page] No user, history fetch aborted.');
        return;
    }
    try {
        const token = await user.getIdToken();
        const response = await fetch('/api/content-strategy/history', { headers: { 'Authorization': `Bearer ${token}` } });
        const data = await response.json();
        
        if (response.ok) {
            console.log(`[Content Strategy Page] Successfully fetched ${data.history?.length || 0} history items.`);
            setHistory(data.history);
        } else {
            console.error('[Content Strategy Page] API error fetching history:', data);
            throw new Error(data.error || 'Failed to fetch history');
        }
    } catch (error: any) {
        console.error('[Content Strategy Page] Catch block error fetching history:', error);
        toast({ title: "Error al cargar historial", description: error.message, variant: "destructive" });
    } finally {
        setIsLoadingHistory(false);
        console.log('[Content Strategy Page] Finished fetching history.');
    }
  }, [toast]);
  
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
        if (user) {
            fetchHistory();
        } else {
            setHistory([]);
            setIsLoadingHistory(false);
        }
    });
    return () => unsubscribe();
  }, [fetchHistory]);

  const fetchContext = async () => {
    setIsFetchingContext(true);
    setContext('');
    const user = auth.currentUser;
    if (!user) {
      toast({ title: "No autenticado", variant: "destructive" });
      setIsFetchingContext(false);
      return;
    }

    try {
      const token = await user.getIdToken();
      const response = await fetch('/api/seo/context-summary', {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (!response.ok) {
        throw new Error((await response.json()).error || "No se pudo generar el contexto.");
      }
      const data = await response.json();
      setContext(data.summary);
      toast({ title: "Contexto Sugerido", description: "Hemos analizado tus páginas y hemos sugerido un contexto inicial." });
    } catch (error: any) {
      toast({ title: "Error al generar contexto", description: error.message, variant: "destructive" });
    } finally {
      setIsFetchingContext(false);
    }
  };
  
  const generatePlan = async () => {
    if (!context.trim()) {
        toast({ title: "Contexto necesario", description: "Por favor, describe tu negocio o genera un contexto automático.", variant: "destructive" });
        return;
    }
    setIsLoading(true);
    setStrategyPlan(null);
    const user = auth.currentUser;
    if (!user) {
      toast({ title: "No autenticado", variant: "destructive" });
      setIsLoading(false);
      return;
    }

    try {
        const token = await user.getIdToken();
        const payload: { businessContext: string; url?: string } = { businessContext: context };
        if (url) {
            payload.url = url;
        }

        const response = await fetch('/api/content-strategy/generate-plan', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
            body: JSON.stringify(payload)
        });
        if (!response.ok) {
            throw new Error((await response.json()).error || "La IA no pudo generar el plan.");
        }
        const plan = await response.json();
        setStrategyPlan(plan);
        fetchHistory();
    } catch (error: any) {
        toast({ title: "Error al generar el plan", description: error.message, variant: "destructive" });
    } finally {
        setIsLoading(false);
    }
  };
  
  const handleDeletePlan = async (planId: string) => {
    const user = auth.currentUser;
    if (!user) {
      toast({ title: 'No autenticado', variant: 'destructive' });
      return;
    }
    try {
      const token = await user.getIdToken();
      const result = await deleteStrategyPlanAction(planId, token);
      if (result.success) {
        toast({ title: 'Plan eliminado' });
        fetchHistory();
      } else {
        throw new Error(result.error || 'No se pudo eliminar el plan.');
      }
    } catch (e: any) {
      toast({ title: 'Error al eliminar', description: e.message, variant: 'destructive' });
    }
  };


  return (
    <div className="container mx-auto py-8 space-y-6">
      <Card>
        <CardHeader>
          <div className="flex items-center space-x-3">
            <Lightbulb className="h-8 w-8 text-primary" />
            <div>
              <CardTitle>Planificador de Palabras Clave y Contenidos</CardTitle>
              <CardDescription>
                Genera una estrategia de contenidos y palabras clave para mejorar el SEO y atraer a tu público objetivo.
              </CardDescription>
            </div>
          </div>
        </CardHeader>
      </Card>
      
      {strategyPlan ? (
        <PlanView plan={strategyPlan} onReset={() => setStrategyPlan(null)} />
      ) : (
        <>
            <Card>
                <CardHeader>
                    <CardTitle>1. Define el Contexto de tu Negocio</CardTitle>
                    <CardDescription>
                        Describe tu negocio o déjanos analizar tu sitio. Una descripción clara y concisa dará los mejores resultados.
                    </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                    <div>
                        <Label htmlFor="url-input">URL del Negocio (Opcional)</Label>
                        <Input
                            id="url-input"
                            value={url}
                            onChange={(e) => setUrl(e.target.value)}
                            placeholder="Ej: https://mi-tienda-de-velas.com"
                            disabled={isLoading}
                        />
                        <p className="text-xs text-muted-foreground mt-1">Si se especifica una URL, la IA la tendrá en cuenta para generar una estrategia más enfocada.</p>
                    </div>
                    <div>
                        <Label htmlFor="business-context">Descripción del negocio y público objetivo</Label>
                        <Textarea
                            id="business-context"
                            value={context}
                            onChange={(e) => setContext(e.target.value)}
                            placeholder="Ej: Somos una tienda online de velas artesanales de soja, dirigida a mujeres de 25-45 años interesadas en el bienestar, la decoración del hogar y productos ecológicos. Nuestro objetivo es posicionarnos como una marca de lujo asequible."
                            rows={6}
                            disabled={isLoading}
                        />
                    </div>
                    <div className="flex flex-col sm:flex-row gap-2">
                        <Button onClick={fetchContext} disabled={isFetchingContext || isLoading}>
                            {isFetchingContext ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Wand2 className="mr-2 h-4 w-4" />}
                            Autocompletar con mis datos
                        </Button>
                    </div>
                </CardContent>
            </Card>

            <div className="flex justify-center">
                <Button size="lg" onClick={generatePlan} disabled={isLoading || !context}>
                    {isLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Sparkles className="mr-2 h-4 w-4" />}
                    Generar Plan de Contenidos
                </Button>
            </div>
            
            {isLoadingHistory ? (
                <div className="flex justify-center items-center h-24"><Loader2 className="h-8 w-8 animate-spin" /></div>
            ) : (
                <PlanHistory history={history} onViewPlan={setStrategyPlan} onDeletePlan={handleDeletePlan} />
            )}
        </>
      )}
    </div>
  );
}
