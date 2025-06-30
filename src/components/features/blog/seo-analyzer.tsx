

"use client";

import React, { useMemo, useState, useCallback, useEffect } from 'react';
import Link from 'next/link';
import { CheckCircle, XCircle, Lightbulb, Edit, ExternalLink, Loader2, Sparkles } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/hooks/use-toast';
import { auth } from '@/lib/firebase';
import { GoogleSnippetPreview } from './google-snippet-preview';

interface SeoAnalyzerProps {
  post: {
    title: string;
    content: string;
    focusKeyword: string;
    metaDescription: string;
    isElementor: boolean;
    elementorEditLink: string | null;
  },
  postId: number;
  postType: 'Post' | 'Page';
}

interface SeoCheck {
  id: string;
  pass: boolean;
  text: React.ReactNode;
  fixable?: boolean;
  aiMode?: 'enhance_title' | 'generate_meta_description';
  editLink?: string;
}

const CheckItem = ({ check, onFix }: { check: SeoCheck, onFix: (mode: SeoCheck['aiMode'], editLink?: string) => void }) => {
  const Icon = check.pass ? CheckCircle : XCircle;
  const color = check.pass ? 'text-green-600' : 'text-amber-600';

  return (
    <li className="flex items-start justify-between gap-3 border-b pb-3">
      <div className="flex items-start gap-3">
        <Icon className={cn("h-5 w-5 flex-shrink-0 mt-0.5", color)} />
        <span className="text-sm text-muted-foreground">{check.text}</span>
      </div>
      {!check.pass && check.fixable && (
         <Button size="sm" variant="outline" onClick={() => onFix(check.aiMode, check.editLink)}>
           {check.aiMode ? <Sparkles className="mr-2 h-4 w-4" /> : <Edit className="mr-2 h-4 w-4" />}
           Arreglar
         </Button>
      )}
    </li>
  );
};

export function SeoAnalyzer({ post, postId, postType }: SeoAnalyzerProps) {
  const [internalPost, setInternalPost] = useState(post);
  const [isAiLoading, setIsAiLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const { toast } = useToast();
  const hasTriggeredAutoKeyword = React.useRef(false);

  useEffect(() => {
    setInternalPost(post);
  }, [post]);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    setInternalPost(prev => ({ ...prev, [e.target.name]: e.target.value }));
  };

  const handleFixWithAI = useCallback(async (mode: SeoCheck['aiMode'], editLink?: string) => {
    if (editLink) {
        window.open(editLink, '_blank');
        return;
    }
    if (!mode) return;
    setIsAiLoading(true);

    try {
        const user = auth.currentUser;
        if (!user) throw new Error("No autenticado.");
        const token = await user.getIdToken();
        const payload = { 
            mode, 
            language: 'Spanish',
            existingTitle: internalPost.title,
            existingContent: internalPost.content,
            focusKeyword: internalPost.focusKeyword,
        };
        const response = await fetch('/api/generate-blog-post', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
            body: JSON.stringify(payload)
        });
        if (!response.ok) throw new Error((await response.json()).error || "La IA falló.");
        const aiContent = await response.json();
        
        if (mode === 'enhance_title') {
            setInternalPost(prev => ({...prev, title: aiContent.title}));
            toast({ title: "Título mejorado con IA" });
        } else if (mode === 'generate_meta_description') {
            setInternalPost(prev => ({...prev, metaDescription: aiContent.metaDescription}));
            toast({ title: "Meta descripción generada con IA" });
        }
    } catch (e: any) {
        toast({ title: "Error de IA", description: e.message, variant: "destructive" });
    } finally {
        setIsAiLoading(false);
    }
  }, [internalPost, toast]);

  const autoGenerateKeyword = useCallback(async () => {
    if (internalPost && !internalPost.focusKeyword && internalPost.content && !hasTriggeredAutoKeyword.current) {
        hasTriggeredAutoKeyword.current = true;
        setIsAiLoading(true);
        try {
            const user = auth.currentUser; if (!user) return;
            const token = await user.getIdToken();
            const payload = { mode: 'generate_focus_keyword', language: 'Spanish', existingTitle: internalPost.title, existingContent: internalPost.content };
            const response = await fetch('/api/generate-blog-post', { method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` }, body: JSON.stringify(payload) });
            if (response.ok) {
                const aiContent = await response.json();
                setInternalPost(prev => ({ ...prev, focusKeyword: aiContent.focusKeyword }));
                toast({ title: "Sugerencia de IA", description: "Se ha sugerido una palabra clave principal para empezar." });
            }
        } catch (e) { console.error(e) } finally { setIsAiLoading(false) }
    }
  }, [internalPost, toast]);

  useEffect(() => {
    autoGenerateKeyword();
  }, [autoGenerateKeyword]);
  
  const handleSaveChanges = async () => {
    setIsSaving(true);
    const user = auth.currentUser;
    if (!user) {
      toast({ title: 'Error', description: 'No autenticado.', variant: 'destructive' });
      setIsSaving(false); return;
    }

    try {
        const token = await user.getIdToken();
        const payload = {
            title: internalPost.title,
            metaDescription: internalPost.metaDescription,
            focusKeyword: internalPost.focusKeyword,
        };
        const apiPath = postType === 'Post' ? `/api/wordpress/posts/${postId}` : `/api/wordpress/pages/${postId}`;
        const response = await fetch(apiPath, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
            body: JSON.stringify(payload)
        });
        if (!response.ok) throw new Error((await response.json()).error || 'Fallo al guardar.');
        toast({ title: '¡Éxito!', description: 'Los cambios SEO han sido guardados.' });
    } catch (e: any) {
        toast({ title: 'Error al Guardar', description: e.message, variant: 'destructive' });
    } finally {
        setIsSaving(false);
    }
  };

  const checks = useMemo<SeoCheck[]>(() => {
    const keyword = internalPost.focusKeyword.trim().toLowerCase();
    if (!keyword) return [];
    
    const plainContent = internalPost.content.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
    const firstParagraph = plainContent.substring(0, 600).toLowerCase();

    return [
      {
        id: 'keywordInTitle',
        pass: internalPost.title.trim().toLowerCase().includes(keyword),
        text: <>La palabra clave (<strong>{keyword}</strong>) aparece en el <strong>título SEO</strong>.</>,
        fixable: true,
        aiMode: 'enhance_title'
      },
      {
        id: 'titleLength',
        pass: internalPost.title.length >= 30 && internalPost.title.length <= 65,
        text: <>El título SEO tiene una longitud adecuada ({internalPost.title.length} de 30-65 caracteres).</>,
        fixable: true,
        aiMode: 'enhance_title'
      },
      {
        id: 'keywordInMetaDesc',
        pass: internalPost.metaDescription.trim().toLowerCase().includes(keyword),
        text: <>La palabra clave aparece en la <strong>meta descripción</strong>.</>,
        fixable: true,
        aiMode: 'generate_meta_description'
      },
      {
        id: 'metaDescLength',
        pass: internalPost.metaDescription.length >= 50 && internalPost.metaDescription.length <= 160,
        text: <>La meta descripción tiene una longitud adecuada ({internalPost.metaDescription.length} de 50-160 caracteres).</>,
        fixable: true,
        aiMode: 'generate_meta_description'
      },
      {
        id: 'keywordInIntro',
        pass: firstParagraph.includes(keyword),
        text: <>La palabra clave se encuentra en la <strong>introducción</strong> (primeros párrafos).</>,
        fixable: true,
        editLink: `/blog/edit/${postId}`
      },
    ];
  }, [internalPost, postId]);


  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">
        <div className="space-y-6">
            <Card>
                <CardHeader>
                    <CardTitle className="flex items-center gap-2"><Lightbulb className="text-primary"/> Checklist SEO Accionable</CardTitle>
                    <CardDescription>Completa estas tareas para mejorar el SEO on-page de tu contenido.</CardDescription>
                </CardHeader>
                <CardContent>
                    {(isAiLoading && !internalPost.focusKeyword) ? <div className="flex items-center justify-center p-4"><Loader2 className="h-6 w-6 animate-spin mr-2" /> Sugiriendo palabra clave...</div> :
                    !internalPost.focusKeyword ? <p className="text-sm text-muted-foreground p-4 text-center">Introduce una palabra clave principal para empezar.</p> :
                    <ul className="space-y-3">
                        {checks.map(check => (
                            <CheckItem key={check.id} check={check} onFix={handleFixWithAI} />
                        ))}
                    </ul>
                    }
                </CardContent>
            </Card>

            <Card>
              <CardHeader><CardTitle>Edición SEO</CardTitle></CardHeader>
              <CardContent className="space-y-4">
                <div><Label htmlFor="focusKeyword">Palabra Clave Principal</Label><Input id="focusKeyword" name="focusKeyword" value={internalPost.focusKeyword} onChange={handleInputChange} /></div>
                <div><Label htmlFor="title">Título SEO</Label><Input id="title" name="title" value={internalPost.title} onChange={handleInputChange} /></div>
                <div><Label htmlFor="metaDescription">Meta Descripción (para Google)</Label><Textarea id="metaDescription" name="metaDescription" value={internalPost.metaDescription} onChange={handleInputChange} maxLength={165} rows={3} /></div>
                <div className="flex justify-end">
                    <Button onClick={handleSaveChanges} disabled={isSaving}>
                        {isSaving && <Loader2 className="mr-2 h-4 w-4 animate-spin"/>} Guardar Cambios SEO
                    </Button>
                </div>
              </CardContent>
            </Card>

        </div>
        <div className="sticky top-20 space-y-6">
             <GoogleSnippetPreview title={internalPost.title} description={internalPost.metaDescription} url={''} />
        </div>
    </div>
  );
}

