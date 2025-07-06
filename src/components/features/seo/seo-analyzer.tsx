
"use client";

import React, { useMemo, useState, useCallback, useEffect } from 'react';
import { CheckCircle, XCircle, Sparkles, ExternalLink, Image as ImageIcon } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import { auth } from '@/lib/firebase';
import { Loader2 } from 'lucide-react';
import { Checkbox } from '@/components/ui/checkbox';
import type { ContentImage, ExtractedWidget } from '@/lib/types';

interface SeoAnalyzerPost {
  title: string;
  content: string | ExtractedWidget[];
  short_description?: string;
  meta: {
      _yoast_wpseo_title: string;
      _yoast_wpseo_metadesc: string;
      _yoast_wpseo_focuskw: string;
  };
  isElementor: boolean;
  elementorEditLink: string | null;
  adminEditLink?: string | null;
  featuredImageUrl?: string | null;
  link?: string;
  postType: 'Post' | 'Page' | 'Producto';
}

interface SeoAnalyzerProps {
  post: SeoAnalyzerPost | null;
  setPost: React.Dispatch<React.SetStateAction<SeoAnalyzerPost | null>>;
  isLoading: boolean;
  setIsLoading: React.Dispatch<React.SetStateAction<boolean>>;
  contentImages: ContentImage[];
  setContentImages: React.Dispatch<React.SetStateAction<ContentImage[]>>;
  applyAiMetaToFeatured: boolean;
  setApplyAiMetaToFeatured: React.Dispatch<React.SetStateAction<boolean>>;
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
           {check.aiMode ? "Arreglar con IA" : "Editar"}
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
    contentImages,
    setContentImages,
    applyAiMetaToFeatured,
    setApplyAiMetaToFeatured
}: SeoAnalyzerProps) {
  const { toast } = useToast();
  const hasTriggeredAutoKeyword = React.useRef(false);

  const handleImageAltChange = useCallback((mediaId: number | null, newAlt: string) => {
    if (!mediaId) return;
    setContentImages(prevImages => 
        prevImages.map((img) => img.mediaId === mediaId ? { ...img, alt: newAlt } : img)
    );
  }, [setContentImages]);


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
            language: 'Spanish',
            existingTitle: post.meta._yoast_wpseo_title || post.title,
            existingContent: typeof post.content === 'string' ? post.content : '',
            keywords: post.meta._yoast_wpseo_focuskw || '',
            postType: post.postType,
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
    if (post && !post.meta._yoast_wpseo_focuskw && post.content && !hasTriggeredAutoKeyword.current) {
        hasTriggeredAutoKeyword.current = true;
        setIsLoading(true);
        try {
            const user = auth.currentUser; if (!user) return;
            const token = await user.getIdToken();

            const payload = { mode: 'generate_focus_keyword', language: 'Spanish', existingTitle: post.title, existingContent: typeof post.content === 'string' ? post.content : '' };
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

  const handleGenerateImageAlts = useCallback(async () => {
    if (!post) return;
    setIsLoading(true);
    try {
        const user = auth.currentUser;
        if (!user) throw new Error("No autenticado.");
        const token = await user.getIdToken();
        const payload = {
            mode: 'generate_image_meta',
            language: 'Spanish',
            existingTitle: post.title,
            existingContent: typeof post.content === 'string' ? post.content : '',
        };
        const response = await fetch('/api/generate-blog-post', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
            body: JSON.stringify(payload),
        });
        if (!response.ok) throw new Error((await response.json()).error || 'La IA falló al generar metadatos.');
        
        const aiContent = await response.json();
        
        const newImages = contentImages.map(img => 
            !img.alt ? { ...img, alt: aiContent.imageAltText } : img
        );
        
        setContentImages(newImages);

        toast({ title: 'Textos alternativos generados', description: "Se ha añadido 'alt text' a las imágenes que no lo tenían." });
    } catch (e: any) {
        toast({ title: 'Error de IA', description: e.message, variant: "destructive" });
    } finally {
        setIsLoading(false);
    }
  }, [post, toast, setIsLoading, setContentImages, contentImages]);


  const checks = useMemo<SeoCheck[]>(() => {
    if (!post || !post.meta) return [];
    
    const keyword = (post.meta._yoast_wpseo_focuskw || '').trim().toLowerCase();
    if (!keyword) return [];
    
    const effectiveSeoTitle = (post.meta._yoast_wpseo_title || post.title || '').trim();
    const effectiveMetaDescription = (post.meta._yoast_wpseo_metadesc || (post.postType === 'Producto' ? post.short_description : '') || '').trim();

    const contentText = typeof post.content === 'string' ? post.content : (post.content || []).map(w => w.text).join(' ');
    const plainContent = contentText.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
    const firstParagraph = plainContent.substring(0, 600).toLowerCase();
    const editLink = post.isElementor ? post.elementorEditLink : post.adminEditLink;

    return [
      {
        id: 'keywordInTitle',
        pass: effectiveSeoTitle.toLowerCase().includes(keyword),
        text: <>La palabra clave (<strong>{keyword}</strong>) aparece en el <strong>título SEO</strong>.</>,
        fixable: true,
        aiMode: 'enhance_title'
      },
      {
        id: 'titleLength',
        pass: effectiveSeoTitle.length >= 30 && effectiveSeoTitle.length <= 65,
        text: <>El título SEO tiene una longitud adecuada ({effectiveSeoTitle.length} de 30-65 caracteres).</>,
        fixable: true,
        aiMode: 'enhance_title'
      },
      {
        id: 'keywordInMetaDesc',
        pass: effectiveMetaDescription.toLowerCase().includes(keyword),
        text: <>La palabra clave aparece en la <strong>meta descripción</strong>.</>,
        fixable: true,
        aiMode: 'generate_meta_description'
      },
      {
        id: 'metaDescLength',
        pass: effectiveMetaDescription.length >= 50 && effectiveMetaDescription.length <= 160,
        text: <>La meta descripción tiene una longitud adecuada ({effectiveMetaDescription.length} de 50-160 caracteres).</>,
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

  const keyword = post.meta?._yoast_wpseo_focuskw || '';

  return (
    <div className="space-y-6">
        <Card>
            <CardHeader>
                <CardTitle>Checklist SEO Accionable</CardTitle>
                <CardDescription>Completa estas tareas para mejorar el SEO on-page de tu contenido.</CardDescription>
            </CardHeader>
            <CardContent>
                {!keyword ? (
                  <p className="text-sm text-muted-foreground p-4 text-center border-dashed border rounded-md">
                    Introduce una Palabra Clave Principal en la tarjeta "Edición SEO" para empezar el análisis.
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

        <Card>
            <CardHeader>
                <CardTitle className="flex items-center gap-2"><ImageIcon className="h-5 w-5 text-primary" /> Optimización de Imágenes</CardTitle>
                <CardDescription>Revisa y añade texto alternativo a las imágenes de tu contenido para mejorar el SEO y la accesibilidad.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
                <Button onClick={handleGenerateImageAlts} disabled={isLoading}>
                    {isLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Sparkles className="mr-2 h-4 w-4" />}
                    Generar y Aplicar 'alt text' con IA
                </Button>
                
                 {post.featuredImageUrl && (
                    <div className="flex items-center space-x-2 pt-4 border-t">
                        <Checkbox id="apply-featured" checked={applyAiMetaToFeatured} onCheckedChange={(checked) => setApplyAiMetaToFeatured(!!checked)} />
                        <Label htmlFor="apply-featured" className="text-sm font-normal">
                           Aplicar también el 'alt text' de la palabra clave a la imagen destacada.
                        </Label>
                    </div>
                 )}

                <div className="space-y-2 max-h-72 overflow-y-auto pr-2">
                    {contentImages.map((img) => (
                        <div key={img.id} className="flex items-center gap-3 p-2 border rounded-md">
                            <div className="relative h-10 w-10 flex-shrink-0">
                                <img src={img.src} alt="Vista previa" className="rounded-md object-cover h-full w-full" />
                            </div>
                            <div className="flex-1 text-sm text-muted-foreground truncate" title={img.src}>
                                {img.src.split('/').pop()}
                            </div>
                            <div className="flex items-center gap-2">
                               <div className="h-2 w-2 rounded-full" style={{ backgroundColor: img.alt ? 'hsl(var(--primary))' : 'hsl(var(--destructive))' }} />
                               <Input 
                                 value={img.alt}
                                 onChange={(e) => handleImageAltChange(img.mediaId, e.target.value)}
                                 placeholder="Añade el 'alt text'..."
                                 className="text-xs h-8"
                               />
                            </div>
                        </div>
                    ))}
                    {contentImages.length === 0 && <p className="text-sm text-center text-muted-foreground py-4">No se encontraron imágenes en el contenido.</p>}
                </div>
            </CardContent>
        </Card>
    </div>
  );
}
