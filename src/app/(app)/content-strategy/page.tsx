
"use client";

import React, { useState, useCallback } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Lightbulb, Loader2, Sparkles, Wand2 } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { auth, onAuthStateChanged } from '@/lib/firebase';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Input } from '@/components/ui/input';

interface KeywordCluster {
  topic: string;
  intent: 'Informativa' | 'Comercial' | 'Transaccional' | 'Navegacional';
  articles: {
    title: string;
    keywords: string[];
  }[];
}

interface StrategyPlan {
  pillarContent: {
    title: string;
    description: string;
  };
  keywordClusters: KeywordCluster[];
}


export default function ContentStrategyPage() {
  const [context, setContext] = useState('');
  const [url, setUrl] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isFetchingContext, setIsFetchingContext] = useState(false);
  const [strategyPlan, setStrategyPlan] = useState<StrategyPlan | null>(null);
  const { toast } = useToast();

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
    } catch (error: any) {
        toast({ title: "Error al generar el plan", description: error.message, variant: "destructive" });
    } finally {
        setIsLoading(false);
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
                    Autocompletar con la web conectada
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

       {strategyPlan && (
        <Card>
            <CardHeader>
                <CardTitle>Tu Plan Estratégico de Contenidos</CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
                <Alert>
                    <AlertTitle className="font-bold text-lg">Contenido Pilar: {strategyPlan.pillarContent.title}</AlertTitle>
                    <AlertDescription>
                        {strategyPlan.pillarContent.description}
                    </AlertDescription>
                </Alert>

                <div className="space-y-4">
                    {strategyPlan.keywordClusters.map((cluster, index) => (
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
       )}

    </div>
  );
}
