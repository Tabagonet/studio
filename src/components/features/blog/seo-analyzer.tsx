

"use client";

import React, { useMemo, useState, useCallback, useEffect } from 'react';
import { CheckCircle, XCircle, Edit, Loader2, Sparkles } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/hooks/use-toast';
import { auth } from '@/lib/firebase';
import { GoogleSnippetPreview } from './google-snippet-preview';

// Define the shape of the post object this component expects
interface SeoAnalyzerPost {
  title: string;
  content: string;
  meta: {
    _yoast_wpseo_metadesc: string;
    _yoast_wpseo_focuskw: string;
  };
  isElementor: boolean;
  elementorEditLink: string | null;
}

interface SeoAnalyzerProps {
  post: SeoAnalyzerPost | null;
  setPost: React.Dispatch<React.SetStateAction<SeoAnalyzerPost | null>>;
  postId: number;
  postType: 'Post' | 'Page';
  isLoading: boolean;
  setIsLoading: React.Dispatch<React.SetStateAction<boolean>>;
}

interface SeoCheck {
  id: string;
  pass: boolean;
  text: React.ReactNode;
  fixable?: boolean;
  aiMode?: 'enhance_title' | 'generate_meta_description';
  editLink?: string;
}

const CheckItem = ({ check, onFix, isAiLoading }: { check: SeoCheck, onFix: (mode: SeoCheck['aiMode'], editLink?: string) => void; isAiLoading: boolean; }) => {
  const Icon = check.pass ? CheckCircle : XCircle;
  const color = check.pass ? 'text-green-600' : 'text-amber-600';

  return (
    <li className="flex items-start justify-between gap-3 border-b pb-3">
      <div className="flex items-start gap-3">
        <Icon className={cn("h-5 w-5 flex-shrink-0 mt-0.5", color)} />
        <span className="text-sm text-muted-foreground">{check.text}</span>
      </div>
      {!check.pass && check.fixable && (
         <Button size="sm" variant="outline" onClick={() => onFix(check.aiMode, check.editLink)} disabled={isAiLoading}>
           {check.aiMode ? <Sparkles className="mr-2 h-4 w-4" /> : <Edit className="mr-2 h-4 w-4" />}
           Arreglar
         </Button>
      )}
    </li>
  );
};

export function SeoAnalyzer({ post, setPost, postId, postType, isLoading, setIsLoading }: SeoAnalyzerProps) {
  const [isAiLoading, setIsAiLoadingState] = useState(false);
  const { toast } = useToast();
  const hasTriggeredAutoKeyword = React.useRef(false);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setPost(prev => {
        if (!prev) return null;
        if (name === 'title') {
            return { ...prev, title: value };
        }
        if (name === 'focusKeyword') {
            return { ...prev, meta: { ...prev.meta, _yoast_wpseo_focuskw: value } };
        }
        if (name === 'metaDescription') {
            return { ...prev, meta: { ...prev.meta, _yoast_wpseo_metadesc: value } };
        }
        return prev;
    });
  };

  const handleFixWithAI = useCallback(async (mode: SeoCheck['aiMode'], editLink?: string) => {
    if (editLink) {
        window.open(editLink, '_blank');
        return;
    }
    if (!mode || !post) return;
    setIsAiLoadingState(true);

    try {
        const user = auth.currentUser;
        if (!user) throw new Error("No autenticado.");
        const token = await user.getIdToken();
        const payload = { 
            mode, 
            language: 'Spanish',
            existingTitle: post.title,
            // Truncate content to avoid overly large payloads for simple title enhancements
            existingContent: post.content.substring(0, 4000),
        };
        const response = await fetch('/api/generate-blog-post', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
            body: JSON.stringify(payload)
        });
        if (!response.ok) throw new Error((await response.json()).error || "La IA falló.");
        const aiContent = await response.json();
        
        if (mode === 'enhance_title') {
            setPost(prev => prev ? {...prev, title: aiContent.title} : null);
            toast({ title: "Título mejorado con IA" });
        } else if (mode === 'generate_meta_description') {
            setPost(prev => prev ? {...prev, meta: {...prev.meta, _yoast_wpseo_metadesc: aiContent.metaDescription}} : null);
            toast({ title: "Meta descripción generada con IA" });
        }
    } catch (e: any) {
        toast({ title: "Error de IA", description: e.message, variant: "destructive" });
    } finally {
        setIsAiLoadingState(false);
    }
  }, [post, setPost, toast]);

  const autoGenerateKeyword = useCallback(async () => {
    if (post && !post.meta._yoast_wpseo_focuskw && post.content && !hasTriggeredAutoKeyword.current) {
        hasTriggeredAutoKeyword.current = true;
        setIsAiLoadingState(true);
        try {
            const user = auth.currentUser; if (!user) return;
            const token = await user.getIdToken();
            const payload = { mode: 'generate_focus_keyword', language: 'Spanish', existingTitle: post.title, existingContent: post.content };
            const response = await fetch('/api/generate-blog-post', { method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` }, body: JSON.stringify(payload) });
            if (response.ok) {
                const aiContent = await response.json();
                setPost(prev => (prev ? {...prev, meta: {...prev.meta, _yoast_wpseo_focuskw: aiContent.focusKeyword}} : null));
                toast({ title: "Sugerencia de IA", description: "Se ha sugerido una palabra clave principal para empezar." });
            }
        } catch (e) { console.error(e) } finally { setIsAiLoadingState(false) }
    }
  }, [post, setPost, toast]);

  useEffect(() => {
    autoGenerateKeyword();
  }, [autoGenerateKeyword]);

  const checks = useMemo<SeoCheck[]>(() => {
    if (!post || !post.meta) return [];
    
    const keyword = (post.meta._yoast_wpseo_focuskw || '').trim().toLowerCase();
    if (!keyword) return [];
    
    const title = post.title || '';
    const metaDescription = post.meta._yoast_wpseo_metadesc || '';
    const plainContent = (post.content || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
    const firstParagraph = plainContent.substring(0, 600).toLowerCase();

    return [
      {
        id: 'keywordInTitle',
        pass: title.trim().toLowerCase().includes(keyword),
        text: <>La palabra clave (<strong>{keyword}</strong>) aparece en el <strong>título SEO</strong>.</>,
        fixable: true,
        aiMode: 'enhance_title'
      },
      {
        id: 'titleLength',
        pass: title.length >= 30 && title.length <= 65,
        text: <>El título SEO tiene una longitud adecuada ({title.length} de 30-65 caracteres).</>,
        fixable: true,
        aiMode: 'enhance_title'
      },
      {
        id: 'keywordInMetaDesc',
        pass: metaDescription.trim().toLowerCase().includes(keyword),
        text: <>La palabra clave aparece en la <strong>meta descripción</strong>.</>,
        fixable: true,
        aiMode: 'generate_meta_description'
      },
      {
        id: 'metaDescLength',
        pass: metaDescription.length >= 50 && metaDescription.length <= 160,
        text: <>La meta descripción tiene una longitud adecuada ({metaDescription.length} de 50-160 caracteres).</>,
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
  }, [post, postId]);

  if (!post) {
      return (
        <Card>
            <CardHeader><CardTitle>Optimizador SEO</CardTitle></CardHeader>
            <CardContent><div className="flex items-center justify-center p-4"><Loader2 className="h-6 w-6 animate-spin mr-2" /> Cargando datos...</div></CardContent>
        </Card>
      )
  }

  const keyword = (post.meta?._yoast_wpseo_focuskw || '').trim();

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">
        <div className="space-y-6">
            <Card>
                <CardHeader>
                    <CardTitle>Checklist SEO Accionable</CardTitle>
                    <CardDescription>Completa estas tareas para mejorar el SEO on-page de tu contenido.</CardDescription>
                </CardHeader>
                <CardContent>
                    <div className="mb-4">
                        <Label htmlFor="focusKeyword">Palabra Clave Principal</Label>
                        <Input id="focusKeyword" name="focusKeyword" value={keyword} onChange={handleInputChange} />
                    </div>
                    {isAiLoading && !keyword ? <div className="flex items-center justify-center p-4"><Loader2 className="h-6 w-6 animate-spin mr-2" /> Sugiriendo palabra clave...</div> :
                    !keyword ? <p className="text-sm text-muted-foreground p-4 text-center border-dashed border rounded-md">Introduce una palabra clave principal para empezar.</p> :
                    <ul className="space-y-3">
                        {checks.map(check => (
                            <CheckItem key={check.id} check={check} onFix={handleFixWithAI} isAiLoading={isAiLoading}/>
                        ))}
                    </ul>
                    }
                </CardContent>
            </Card>

        </div>
        <div className="sticky top-20 space-y-6">
             <Card>
              <CardHeader><CardTitle>Edición SEO</CardTitle></CardHeader>
              <CardContent className="space-y-4">
                <div><Label htmlFor="title">Título SEO</Label><Input id="title" name="title" value={post.title} onChange={handleInputChange} /></div>
                <div><Label htmlFor="metaDescription">Meta Descripción (para Google)</Label><Textarea id="metaDescription" name="metaDescription" value={post.meta._yoast_wpseo_metadesc || ''} onChange={handleInputChange} maxLength={165} rows={3} /></div>
              </CardContent>
            </Card>
            <GoogleSnippetPreview title={post.title} description={post.meta._yoast_wpseo_metadesc || ''} url={''} />
        </div>
    </div>
  );
}
