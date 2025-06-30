

"use client";

import React, { useMemo, useState, useCallback, useEffect } from 'react';
import { CheckCircle, XCircle, Sparkles } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import { auth } from '@/lib/firebase';
import { Loader2 } from 'lucide-react';
import { Checkbox } from '@/components/ui/checkbox';
import { ContentImage } from '@/lib/types';


interface SeoAnalyzerPost {
  title: string;
  content: string; 
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
}

const CheckItem = ({ check }: { check: SeoCheck }) => {
  const Icon = check.pass ? CheckCircle : XCircle;
  const color = check.pass ? 'text-green-600' : 'text-amber-600';

  return (
    <li className="flex items-start justify-between gap-3 border-b pb-3">
      <div className="flex items-start gap-3">
        <Icon className={cn("h-5 w-5 flex-shrink-0 mt-0.5", color)} />
        <span className="text-sm text-muted-foreground">{check.text}</span>
      </div>
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

  const handleImageAltChange = useCallback((imageId: string, newAlt: string) => {
    if (!post) return;

    setContentImages(prevImages => 
        prevImages.map((img) => img.id === imageId ? { ...img, alt: newAlt } : img)
    );
    
    setPost(prevPost => {
        if (!prevPost) return null;
        const tempDiv = document.createElement('div');
        tempDiv.innerHTML = prevPost.content;
        const imageToUpdate = tempDiv.querySelector(`img[src="${CSS.escape(imageId)}"]`);
        if (imageToUpdate) {
            imageToUpdate.setAttribute('alt', newAlt);
        } else {
             console.warn(`Could not find image with src="${imageId}" to update alt text.`);
        }
        return { ...prevPost, content: tempDiv.innerHTML };
    });
  }, [post, setContentImages, setPost]);

  const autoGenerateKeyword = useCallback(async () => {
    if (post && !post.meta._yoast_wpseo_focuskw && post.content && !hasTriggeredAutoKeyword.current) {
        hasTriggeredAutoKeyword.current = true;
        setIsLoading(true);
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
        } catch (e) { console.error(e) } finally { setIsLoading(false) }
    }
  }, [post, setPost, toast, setIsLoading]);

  useEffect(() => { autoGenerateKeyword(); }, [autoGenerateKeyword]);

  const handleGenerateImageAlts = useCallback(async () => {
    if (!post) return;
    setIsLoading(true);
    try {
        const user = auth.currentUser; if (!user) throw new Error("No autenticado.");
        const token = await user.getIdToken();
        const payload = { mode: 'generate_image_meta', language: 'Spanish', existingTitle: post.title, existingContent: post.content };
        const response = await fetch('/api/generate-blog-post', { method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` }, body: JSON.stringify(payload) });
        if (!response.ok) throw new Error((await response.json()).error || 'La IA falló al generar metadatos.');
        const aiContent = await response.json();
        const newImages = contentImages.map(img => !img.alt ? { ...img, alt: aiContent.imageAltText } : img);
        const tempDiv = document.createElement('div'); tempDiv.innerHTML = post.content;
        newImages.forEach((updatedImage) => {
           if (!updatedImage.alt) return;
           const imageElement = tempDiv.querySelector(`img[src="${CSS.escape(updatedImage.id)}"]`);
           if (imageElement && !imageElement.hasAttribute('alt')) imageElement.setAttribute('alt', updatedImage.alt);
        });
        setPost(p => p ? { ...p, content: tempDiv.innerHTML } : null);
        setContentImages(newImages);
        toast({ title: 'Textos alternativos generados', description: "Se ha añadido 'alt text' a las imágenes que no lo tenían." });
    } catch (e: any) {
        toast({ title: 'Error de IA', description: e.message, variant: "destructive" });
    } finally { setIsLoading(false); }
  }, [post, toast, setIsLoading, setPost, setContentImages, contentImages]);

  const handleMetaChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!post) return;
    const { name, value } = e.target;
    setPost(prev => prev ? { ...prev, meta: { ...prev.meta, [name]: value } } : null);
  };


  const checks = useMemo<SeoCheck[]>(() => {
    if (!post || !post.meta) return [];
    const keyword = (post.meta._yoast_wpseo_focuskw || '').trim().toLowerCase();
    if (!keyword) return [];
    const seoTitle = (post.meta._yoast_wpseo_title || '').trim();
    const metaDescription = (post.meta._yoast_wpseo_metadesc || '').trim();
    const plainContent = (post.content || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
    const firstParagraph = plainContent.substring(0, 600).toLowerCase();
    return [
      { id: 'keywordInTitle', pass: seoTitle.toLowerCase().includes(keyword), text: <>La palabra clave (<strong>{keyword}</strong>) aparece en el <strong>título SEO</strong>.</> },
      { id: 'titleLength', pass: seoTitle.length >= 30 && seoTitle.length <= 65, text: <>El título SEO tiene una longitud adecuada ({seoTitle.length} de 30-65 caracteres).</> },
      { id: 'keywordInMetaDesc', pass: metaDescription.toLowerCase().includes(keyword), text: <>La palabra clave aparece en la <strong>meta descripción</strong>.</> },
      { id: 'metaDescLength', pass: metaDescription.length >= 50 && metaDescription.length <= 160, text: <>La meta descripción tiene una longitud adecuada ({metaDescription.length} de 50-160 caracteres).</> },
      { id: 'keywordInIntro', pass: firstParagraph.includes(keyword), text: <>La palabra clave se encuentra en la <strong>introducción</strong> (primeros párrafos).</> },
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
    <>
        <Card>
            <CardHeader>
                <CardTitle>Checklist SEO Accionable</CardTitle>
                <CardDescription>Completa estas tareas para mejorar el SEO on-page de tu contenido.</CardDescription>
            </CardHeader>
            <CardContent>
                <div className="mb-4">
                    <Label htmlFor="focusKeyword">Palabra Clave Principal</Label>
                    <Input id="focusKeyword" name="_yoast_wpseo_focuskw" value={keyword} onChange={handleMetaChange} />
                </div>
                {isLoading && !keyword ? <div className="flex items-center justify-center p-4"><Loader2 className="h-6 w-6 animate-spin mr-2" /> Sugiriendo palabra clave...</div> :
                !keyword ? <p className="text-sm text-muted-foreground p-4 text-center border-dashed border rounded-md">Introduce una palabra clave principal para empezar.</p> :
                <ul className="space-y-3">
                    {checks.map(check => ( <CheckItem key={check.id} check={check}/> ))}
                </ul>
                }
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
                                {img.id.split('/').pop()}
                            </div>
                            <div className="flex items-center gap-2">
                               <div className="h-2 w-2 rounded-full" style={{ backgroundColor: img.alt ? 'hsl(var(--primary))' : 'hsl(var(--destructive))' }} />
                               <Input 
                                 value={img.alt}
                                 onChange={(e) => handleImageAltChange(img.id, e.target.value)}
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
    </>
  );
}
