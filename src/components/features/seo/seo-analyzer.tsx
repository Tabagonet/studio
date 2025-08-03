
"use client";

import React, { useMemo, useCallback } from 'react';
import { CheckCircle, XCircle, Sparkles, ExternalLink } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { auth } from '@/lib/firebase';
import { Loader2 } from 'lucide-react';
import type { PostEditState } from '@/app/(app)/pages/edit/[id]/page';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';

interface SeoAnalyzerProps {
  post: PostEditState | null;
  setPost: React.Dispatch<React.SetStateAction<PostEditState | null>>;
  isLoading: boolean;
  setIsLoading: React.Dispatch<React.SetStateAction<boolean>>;
  contentImages: any[]; // Use any to avoid dependency cycle if ContentImage is complex
  setContentImages: React.Dispatch<React.SetStateAction<any[]>>;
  applyAiMetaToFeatured: boolean;
  setApplyAiMetaToFeatured: React.Dispatch<React.SetStateAction<boolean>>;
  postId: number;
}

interface SeoCheck {
  id: string;
  pass: boolean;
  text: React.ReactNode;
  fixable?: boolean;
  aiMode?: 'enhance_title' | 'generate_meta_description';
  editLink?: string | null;
}

const CheckItem = ({ check, onFix, isAiLoading }: { check: SeoCheck, onFix: (mode: SeoCheck['aiMode'], editLink?: string | null) => void; isAiLoading: boolean; }) => {
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
           {isAiLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin"/>}
           {!isAiLoading && (check.aiMode ? <Sparkles className="mr-2 h-4 w-4" /> : <ExternalLink className="mr-2 h-4 w-4" />)}
           {check.aiMode ? "Arreglar" : "Editar"}
         </Button>
      )}
    </li>
  );
};

export function SeoAnalyzer({ 
    post, 
    setPost, 
    isLoading, 
    setIsLoading,
}: SeoAnalyzerProps) {
  const { toast } = useToast();

  const handleFixWithAI = useCallback(async (mode: SeoCheck['aiMode'], editLink?: string | null) => {
    if (editLink) {
        window.open(editLink, '_blank');
        return;
    }
    if (!mode || !post) return;
    setIsLoading(true);

    try {
        const user = auth.currentUser;
        if (!user) throw new Error("No autenticado.");
        const token = await user.getIdToken();
        
        const payload: any = { 
            mode, 
            language: post.lang || 'es',
            existingTitle: post.meta._yoast_wpseo_title || post.title,
            existingContent: typeof post.content === 'string' ? post.content : post.content.map(w => w.text).join('\n'),
            keywords: post.meta._yoast_wpseo_focuskw || '',
        };
        const response = await fetch('/api/generate-blog-post', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
            body: JSON.stringify(payload)
        });
        if (!response.ok) throw new Error((await response.json()).error || "La IA falló.");
        const aiContent = await response.json();
        
        if (mode === 'enhance_title' && aiContent.title) {
            setPost(prev => prev ? {...prev, meta: {...prev.meta, _yoast_wpseo_title: aiContent.title}} : null);
            toast({ title: "Título mejorado con IA" });
        } else if (mode === 'generate_meta_description' && aiContent.metaDescription) {
            setPost(prev => prev ? {...prev, meta: {...prev.meta, _yoast_wpseo_metadesc: aiContent.metaDescription}} : null);
            toast({ title: "Meta descripción generada con IA" });
        }
    } catch (e: any) {
        toast({ title: "Error de IA", description: e.message, variant: "destructive" });
    } finally {
        setIsLoading(false);
    }
  }, [post, setPost, toast, setIsLoading]);

  const autoGenerateKeyword = useCallback(async () => {
    if (post && !post.meta._yoast_wpseo_focuskw && post.content) {
        setIsLoading(true);
        try {
            const user = auth.currentUser; if (!user) return;
            const token = await user.getIdToken();

            const payload = { mode: 'generate_focus_keyword', language: post.lang || 'es', existingTitle: post.title, existingContent: typeof post.content === 'string' ? post.content : '' };
            const response = await fetch('/api/generate-blog-post', { method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` }, body: JSON.stringify(payload) });
            if (response.ok) {
                const aiContent = await response.json();
                setPost(prev => (prev ? {...prev, meta: {...prev.meta, _yoast_wpseo_focuskw: aiContent.focusKeyword}} : null));
                toast({ title: "Sugerencia de IA", description: "Se ha sugerido una palabra clave principal para empezar." });
            }
        } catch (e) { console.error(e) } finally { setIsLoading(false) }
    }
  }, [post, setPost, toast, setIsLoading]);

  useEffect(() => {
    autoGenerateKeyword();
  }, [autoGenerateKeyword]);


  const checks = useMemo<SeoCheck[]>(() => {
    if (!post || !post.meta) return [];
    
    const keyword = (post.meta._yoast_wpseo_focuskw || '').trim().toLowerCase();
    if (!keyword) return [];
    
    const seoTitle = (post.meta._yoast_wpseo_title || '').trim();
    const metaDescription = (post.meta._yoast_wpseo_metadesc || '').trim();
    const contentText = typeof post.content === 'string' ? post.content : post.content.map(w => w.text).join(' ');
    const plainContent = contentText.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
    const firstParagraph = plainContent.substring(0, 600).toLowerCase();
    const editLink = post.isElementor ? post.elementorEditLink : post.adminEditLink;

    return [
      {
        id: 'keywordInTitle',
        pass: seoTitle.toLowerCase().includes(keyword),
        text: <>La palabra clave (<strong>{keyword}</strong>) aparece en el <strong>título SEO</strong>.</>,
        fixable: true,
        aiMode: 'enhance_title'
      },
      {
        id: 'titleLength',
        pass: seoTitle.length >= 30 && seoTitle.length <= 65,
        text: <>El título SEO tiene una longitud adecuada ({seoTitle.length} de 30-65 caracteres).</>,
        fixable: true,
        aiMode: 'enhance_title'
      },
      {
        id: 'keywordInMetaDesc',
        pass: metaDescription.toLowerCase().includes(keyword),
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
        editLink: editLink
      },
    ];
  }, [post]);

  if (!post) {
      return (
        <Card>
            <CardHeader><CardTitle>Optimizador SEO</CardTitle></CardHeader>
            <CardContent><div className="flex items-center justify-center p-4"><Loader2 className="h-6 w-6 animate-spin mr-2" /> Cargando datos...</div></CardContent>
        </Card>
      )
  }
  
  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    if (!post) return;
    const { name, value } = e.target;
    setPost({ ...post, meta: { ...post.meta, [name]: value } });
  };
  
  const keyword = post.meta?._yoast_wpseo_focuskw || '';

  return (
    <div className="space-y-6">
        <Card>
            <CardHeader>
              <CardTitle>Edición SEO</CardTitle>
              <CardDescription>Modifica los campos clave para el posicionamiento en buscadores.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
               <div>
                  <Label htmlFor="_yoast_wpseo_focuskw">Palabra Clave Principal</Label>
                  <Input id="_yoast_wpseo_focuskw" name="_yoast_wpseo_focuskw" value={post.meta._yoast_wpseo_focuskw} onChange={handleInputChange} />
               </div>
               <div>
                  <Label htmlFor="_yoast_wpseo_title">Título SEO</Label>
                  <Input id="_yoast_wpseo_title" name="_yoast_wpseo_title" value={post.meta._yoast_wpseo_title} onChange={handleInputChange} />
               </div>
               <div>
                   <Label htmlFor="_yoast_wpseo_metadesc">Meta Descripción</Label>
                   <Input id="_yoast_wpseo_metadesc" name="_yoast_wpseo_metadesc" value={post.meta._yoast_wpseo_metadesc} onChange={handleInputChange} />
               </div>
            </CardContent>
        </Card>

        <Card>
            <CardHeader>
                <CardTitle>Checklist SEO Accionable</CardTitle>
                <CardDescription>Completa estas tareas para mejorar el SEO on-page de tu contenido.</CardDescription>
            </CardHeader>
            <CardContent>
                {!keyword ? (
                  <p className="text-sm text-muted-foreground p-4 text-center border-dashed border rounded-md">
                    Introduce una Palabra Clave Principal para empezar el análisis.
                  </p>
                ) : (
                  <ul className="space-y-3">
                      {checks.map(check => (
                          <CheckItem key={check.id} check={check} onFix={handleFixWithAI} isAiLoading={isLoading}/>
                      ))}
                  </ul>
                )}
            </CardContent>
        </Card>
    </div>
  );
}
