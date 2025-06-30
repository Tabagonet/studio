
"use client";

import React, { useEffect, useState, Suspense, useCallback } from 'react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import Image from 'next/image';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Loader2, ArrowLeft, Edit, Sparkles, Image as ImageIcon, Checkbox, Save, ExternalLink } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { auth } from '@/lib/firebase';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { SeoAnalyzer } from '@/components/features/blog/seo-analyzer';
import Link from 'next/link';
import type { SeoAnalysisRecord } from '@/lib/types';


interface PostEditState {
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
  featuredMediaId?: number | null;
  link?: string;
}

interface ContentImage {
    src: string;
    alt: string;
}

function EditPageContent() {
  const params = useParams();
  const router = useRouter();
  const searchParams = useSearchParams();

  const postId = Number(params.id);
  const postType = searchParams.get('type') || 'Post';
    
  const [post, setPost] = useState<PostEditState | null>(null);
  const [contentImages, setContentImages] = useState<ContentImage[]>([]);
  const [applyAiMetaToFeatured, setApplyAiMetaToFeatured] = useState(false);
  
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isAiLoading, setIsAiLoading] = useState(false);

  const [error, setError] = useState<string | null>(null);
  const { toast } = useToast();
  
  
  const fetchInitialData = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    const user = auth.currentUser;
    if (!user) {
      setError('Authentication required.');
      setIsLoading(false);
      return;
    }
    
    if (isNaN(postId) || !postType) {
      setError('El ID o el tipo del contenido no es válido.');
      setIsLoading(false);
      return;
    }

    try {
      const token = await user.getIdToken();
      const apiPath = postType === 'Post' ? `/api/wordpress/posts/${postId}` : `/api/wordpress/pages/${postId}`;
      const postResponse = await fetch(`${apiPath}?context=edit`, { headers: { 'Authorization': `Bearer ${token}` }});
      if (!postResponse.ok) throw new Error((await postResponse.json()).error || `Failed to fetch ${postType} data.`);
      
      const postData = await postResponse.json();
      const loadedPost: PostEditState = {
        title: postData.title.rendered || '',
        content: postData.content.rendered || '',
        meta: {
            _yoast_wpseo_title: postData.meta?._yoast_wpseo_title || postData.title.rendered || '',
            _yoast_wpseo_metadesc: postData.meta?._yoast_wpseo_metadesc || '',
            _yoast_wpseo_focuskw: postData.meta?._yoast_wpseo_focuskw || '',
        },
        isElementor: postData.isElementor || false,
        elementorEditLink: postData.elementorEditLink || null,
        adminEditLink: postData.adminEditLink || null,
        featuredImageUrl: postData.featured_image_url || null,
        featuredMediaId: postData.featured_media || null,
        link: postData.link,
      };

      try {
        const historyResponse = await fetch(`/api/seo/history?url=${encodeURIComponent(postData.link)}`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        if (historyResponse.ok) {
            const historyData: { history: SeoAnalysisRecord[] } = await historyResponse.json();
            if (historyData.history && historyData.history.length > 0) {
                const latestAnalysis = historyData.history[0].analysis;
                
                if (!loadedPost.meta._yoast_wpseo_title && latestAnalysis.aiAnalysis.suggested?.title) {
                    loadedPost.meta._yoast_wpseo_title = latestAnalysis.aiAnalysis.suggested.title;
                }
                if (!loadedPost.meta._yoast_wpseo_metadesc && latestAnalysis.aiAnalysis.suggested?.metaDescription) {
                    loadedPost.meta._yoast_wpseo_metadesc = latestAnalysis.aiAnalysis.suggested.metaDescription;
                }
                if (!loadedPost.meta._yoast_wpseo_focuskw && latestAnalysis.aiAnalysis.suggested?.focusKeyword) {
                    loadedPost.meta._yoast_wpseo_focuskw = latestAnalysis.aiAnalysis.suggested.focusKeyword;
                }
            }
        }
      } catch (historyError) {
          console.warn("Could not fetch SEO history for suggestions:", historyError);
      }
      
      setPost(loadedPost);
      
      if (loadedPost.content && loadedPost.link) {
        const tempDiv = document.createElement('div');
        tempDiv.innerHTML = loadedPost.content;
        const siteUrl = new URL(loadedPost.link);

        const images = Array.from(tempDiv.querySelectorAll('img')).map(img => {
            let src = img.getAttribute('src') || '';
            // If src is relative (starts with '/'), make it absolute
            if (src && src.startsWith('/')) {
                src = `${siteUrl.origin}${src}`;
            }
            return {
                src: src,
                alt: img.getAttribute('alt') || '',
            };
        }).filter(img => {
            // Also filter out invalid or non-http URLs before passing to next/image
            if (!img.src) return false;
            try {
                const url = new URL(img.src);
                return url.protocol === 'http:' || url.protocol === 'https:';
            } catch (e) {
                return false; // Invalid URL format
            }
        });
        
        setContentImages(images);
      } else {
        setContentImages([]);
      }

    } catch (e: any) {
      setError(e.message);
    } finally {
      setIsLoading(false);
    }
  }, [postId, postType, toast]);


  useEffect(() => {
    fetchInitialData();
  }, [fetchInitialData]);
  
  const handleSaveChanges = async () => {
    setIsSaving(true);
    const user = auth.currentUser;
    if (!user || !post) {
      toast({ title: 'Error', description: 'No se puede guardar.', variant: 'destructive' });
      setIsSaving(false); return;
    }

    try {
        const token = await user.getIdToken();
        const payload: any = {
            title: post.title,
            meta: post.meta,
            imageMetas: contentImages,
            content: post.content,
        };
        
        if (applyAiMetaToFeatured && post.featuredMediaId) {
            payload.featured_image_metadata = {
                title: post.title,
                alt_text: post.meta._yoast_wpseo_focuskw || post.title
            };
        }

        const apiPath = postType === 'Post' ? `/api/wordpress/posts/${postId}` : `/api/wordpress/pages/${postId}`;
        const response = await fetch(apiPath, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
            body: JSON.stringify(payload)
        });
        if (!response.ok) throw new Error((await response.json()).error || 'Fallo al guardar.');
        toast({ title: '¡Éxito!', description: "Los cambios SEO, incluyendo los textos 'alt' de las imágenes, han sido guardados." });
    } catch (e: any) {
        toast({ title: 'Error al Guardar', description: e.message, variant: "destructive" });
    } finally {
        setIsSaving(false);
    }
  };

  const handleGenerateImageAlts = useCallback(async () => {
    if (!post) return;
    setIsAiLoading(true);
    try {
        const user = auth.currentUser;
        if (!user) throw new Error("No autenticado.");
        const token = await user.getIdToken();
        const payload = {
            mode: 'generate_image_meta',
            language: 'Spanish',
            existingTitle: post.title,
            existingContent: post.content,
        };
        const response = await fetch('/api/generate-blog-post', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
            body: JSON.stringify(payload),
        });
        if (!response.ok) throw new Error((await response.json()).error || 'La IA falló al generar metadatos.');
        
        const aiContent = await response.json();
        
        setContentImages(prevImages =>
            prevImages.map(img =>
                !img.alt ? { ...img, alt: aiContent.imageAltText } : img
            )
        );
        toast({ title: 'Textos alternativos generados', description: "Se ha añadido 'alt text' a las imágenes que no lo tenían." });
    } catch (e: any) {
        toast({ title: 'Error de IA', description: e.message, variant: "destructive" });
    } finally {
        setIsAiLoading(false);
    }
  }, [post, toast]);

  if (isLoading) {
    return <div className="flex items-center justify-center min-h-[calc(100vh-8rem)] w-full"><Loader2 className="h-10 w-10 animate-spin text-primary" /></div>;
  }
  
  if (error || !post) {
     return <div className="container mx-auto py-8"><Alert variant="destructive"><AlertTitle>Error al Cargar</AlertTitle><AlertDescription>{error || `No se pudo cargar la información del ${postType || 'contenido'}.`}</AlertDescription></Alert></div>;
  }

  return (
    <div className="container mx-auto py-8 space-y-6">
        <Card>
            <CardHeader>
                <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
                    <div>
                        <CardTitle>Centro de Acción SEO</CardTitle>
                        <CardDescription>Editando: {post.title}</CardDescription>
                    </div>
                    <div className="flex flex-col sm:flex-row gap-2">
                        <Button variant="outline" onClick={() => router.back()}>
                            <ArrowLeft className="mr-2 h-4 w-4" /> Volver al informe
                        </Button>
                         <Button onClick={handleSaveChanges} disabled={isSaving}>
                            {isSaving ? <Loader2 className="mr-2 h-4 w-4 animate-spin"/> : <Save className="h-4 w-4" /> } Guardar Cambios SEO
                        </Button>
                    </div>
                </div>
            </CardHeader>
        </Card>

        {post.isElementor && (
          <Alert>
            <ExternalLink className="h-4 w-4" />
            <AlertTitle>Página de Elementor Detectada</AlertTitle>
            <AlertDescription>
                Para editar el contenido visual y los encabezados, debes usar el editor de Elementor.
            </AlertDescription>
            <Button asChild className="mt-4" size="sm">
                <Link href={post.elementorEditLink!} target="_blank" rel="noopener noreferrer">
                    <ExternalLink className="mr-2 h-4 w-4" />
                    Abrir con Elementor
                </Link>
            </Button>
          </Alert>
        )}
        
        {!post.isElementor && (
           <Alert>
            <Edit className="h-4 w-4" />
            <AlertTitle>Editar Contenido Completo</AlertTitle>
            <AlertDescription>
              Para modificar los encabezados (H1, H2, etc.) o el cuerpo del texto, puedes usar el editor de WordPress.
            </AlertDescription>
             <Button asChild className="mt-4" size="sm">
                <Link href={post.adminEditLink || '#'} target="_blank" rel="noopener noreferrer">
                    <ExternalLink className="mr-2 h-4 w-4" />
                    Abrir Editor de WordPress
                </Link>
            </Button>
          </Alert>
        )}
        
        <SeoAnalyzer
            post={post}
            setPost={setPost}
            isLoading={isAiLoading}
            setIsLoading={setIsAiLoading}
        />

        <Card>
            <CardHeader>
                <CardTitle className="flex items-center gap-2"><ImageIcon className="h-5 w-5 text-primary" /> Optimización de Imágenes</CardTitle>
                <CardDescription>Revisa y añade texto alternativo a las imágenes de tu contenido para mejorar el SEO y la accesibilidad.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
                <Button onClick={handleGenerateImageAlts} disabled={isAiLoading}>
                    {isAiLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Sparkles className="mr-2 h-4 w-4" />}
                    Generar y Aplicar 'alt text' con IA
                </Button>
                
                 {post.featuredImageUrl && (
                    <div className="flex items-center space-x-2 pt-4 border-t">
                        <Checkbox id="apply-featured" checked={applyAiMetaToFeatured} onCheckedChange={(checked) => setApplyAiMetaToFeatured(!!checked)} />
                        <Label htmlFor="apply-featured" className="text-sm font-normal">
                           Aplicar también los metadatos generados a la imagen destacada.
                        </Label>
                    </div>
                 )}

                <div className="space-y-2 max-h-72 overflow-y-auto pr-2">
                    {contentImages.map((img, index) => (
                        <div key={index} className="flex items-center gap-3 p-2 border rounded-md">
                            <Image src={img.src} alt="Vista previa" width={40} height={40} className="rounded object-cover" />
                            <div className="flex-1 text-sm text-muted-foreground truncate" title={img.src}>
                                {img.src.split('/').pop()}
                            </div>
                            <div className="flex items-center gap-2">
                               <div className="h-2 w-2 rounded-full" style={{ backgroundColor: img.alt ? 'hsl(var(--primary))' : 'hsl(var(--destructive))' }} />
                               <Input 
                                 value={img.alt}
                                 onChange={(e) => setContentImages(prev => prev.map((current, i) => i === index ? { ...current, alt: e.target.value } : current))}
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

export default function SeoEditPage() {
    return (
        <Suspense fallback={<div className="flex items-center justify-center min-h-[calc(100vh-8rem)] w-full"><Loader2 className="h-10 w-10 animate-spin text-primary" /></div>}>
            <EditPageContent />
        </Suspense>
    )
}

    
