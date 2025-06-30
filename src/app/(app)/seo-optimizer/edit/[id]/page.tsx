

"use client";

import React, { useEffect, useState, Suspense, useCallback, useRef } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Image from 'next/image';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Loader2, ArrowLeft, Edit, Sparkles, Image as ImageIcon, Checkbox } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { auth } from '@/lib/firebase';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { SeoAnalyzer } from '@/components/features/blog/seo-analyzer';


interface PostEditState {
  title: string;
  content: string; 
  status: 'publish' | 'draft' | 'pending' | 'future' | 'private';
  author: number | null;
  category: number | null;
  tags: string;
  meta: {
      _yoast_wpseo_metadesc?: string;
      _yoast_wpseo_focuskw?: string;
  };
  isElementor: boolean;
  elementorEditLink: string | null;
  featuredImageUrl?: string | null;
  featuredMediaId?: number | null;
  translations?: Record<string, number>;
}

interface ContentImage {
    src: string;
    alt: string;
}

function EditPageContent() {
  const params = useParams();
  const router = useRouter();

  const postId = Number(params.id);
  const postType = params.type?.[0]?.toUpperCase() + params.type?.slice(1) || 'Post';
    
  const [post, setPost] = useState<PostEditState | null>(null);
  const [contentImages, setContentImages] = useState<ContentImage[]>([]);
  const [applyAiMetaToFeatured, setApplyAiMetaToFeatured] = useState(false);
  
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isAiLoading, setIsAiLoading] = useState(false);

  const [error, setError] = useState<string | null>(null);
  const { toast } = useToast();
  
  const hasTriggeredAutoKeyword = useRef(false);

  const fetchInitialData = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    hasTriggeredAutoKeyword.current = false;
    const user = auth.currentUser;
    if (!user) {
      setError('Authentication required.');
      setIsLoading(false);
      return;
    }
    
    if (isNaN(postId)) {
      setError('El ID del contenido no es válido.');
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
        status: postData.status || 'draft',
        author: postData.author || null,
        category: postData.categories?.[0] || null,
        tags: postData._embedded?.['wp:term']?.[1]?.map((t: any) => t.name).join(', ') || '',
        meta: {
            _yoast_wpseo_metadesc: postData.meta?._yoast_wpseo_metadesc || '',
            _yoast_wpseo_focuskw: postData.meta?._yoast_wpseo_focuskw || '',
        },
        isElementor: postData.isElementor || false,
        elementorEditLink: postData.elementorEditLink || null,
        featuredImageUrl: postData.featured_image_url || null,
        featuredMediaId: postData.featured_media || null,
        translations: postData.translations || {},
      };
      setPost(loadedPost);
      
      if (loadedPost.content) {
        const tempDiv = document.createElement('div');
        tempDiv.innerHTML = loadedPost.content;
        const images = Array.from(tempDiv.querySelectorAll('img')).map(img => ({
            src: img.getAttribute('src') || '',
            alt: img.getAttribute('alt') || '',
        })).filter(img => img.src);
        setContentImages(images);
      } else {
        setContentImages([]);
      }

    } catch (e: any) {
      setError(e.message);
    } finally {
      setIsLoading(false);
    }
  }, [postId, postType]);


  useEffect(() => {
    fetchInitialData();
  }, [fetchInitialData]);
  
  const autoGenerateKeyword = useCallback(async () => {
    if (post && !post.meta._yoast_wpseo_focuskw && post.content && !hasTriggeredAutoKeyword.current) {
        hasTriggeredAutoKeyword.current = true;
        setIsAiLoading(true);
        try {
            const user = auth.currentUser; if (!user) return;
            const token = await user.getIdToken();
            const payload = { mode: 'generate_focus_keyword', language: 'Spanish', existingTitle: post.title, existingContent: post.content };
            const response = await fetch('/api/generate-blog-post', { method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` }, body: JSON.stringify(payload) });
            if (response.ok) {
                const aiContent = await response.json();
                setPost(prev => prev ? { ...prev, meta: { ...prev.meta, _yoast_wpseo_focuskw: aiContent.focusKeyword } } : null);
                toast({ title: "Sugerencia de IA", description: "Se ha sugerido una palabra clave principal para empezar." });
            }
        } catch (e) { console.error(e) } finally { setIsAiLoading(false) }
    }
  }, [post, toast]);

  useEffect(() => {
    if(!isLoading && post) {
        autoGenerateKeyword();
    }
  }, [isLoading, post, autoGenerateKeyword]);
  
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
            content: post.content, // Send content back so backend can update alt tags
        };
        
        if (applyAiMetaToFeatured && post.featuredMediaId) {
            payload.featured_image_metadata = {
                title: post.title, // Example, could be more specific
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
        toast({ title: '¡Éxito!', description: 'Los cambios SEO han sido guardados.' });
    } catch (e: any) {
        toast({ title: 'Error al Guardar', description: e.message, variant: 'destructive' });
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
            existingContent: post.content.substring(0, 1000), // Send a summary
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
        toast({ title: 'Error de IA', description: e.message, variant: 'destructive' });
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
                            <ArrowLeft className="mr-2 h-4 w-4" /> Volver al Informe
                        </Button>
                         <Button onClick={handleSaveChanges} disabled={isSaving}>
                            {isSaving && <Loader2 className="mr-2 h-4 w-4 animate-spin"/>} Guardar Cambios SEO
                        </Button>
                    </div>
                </div>
            </CardHeader>
        </Card>

        {post.isElementor && (
             <Alert>
                <Edit className="h-4 w-4" />
                <AlertTitle>Página de Elementor</AlertTitle>
                <AlertDescription>
                   Para editar los encabezados y el contenido, debes usar el editor de Elementor. Esta herramienta te permite editar los metadatos y optimizar las imágenes.
                </AlertDescription>
            </Alert>
        )}
        
        <SeoAnalyzer
            post={post}
            setPost={setPost}
            postId={postId}
            postType={postType}
            isLoading={isAiLoading}
        />

        <Card>
            <CardHeader>
                <CardTitle className="flex items-center gap-2"><ImageIcon className="h-5 w-5 text-primary" /> Optimización de Imágenes</CardTitle>
                <CardDescription>Revisa el texto alternativo de las imágenes de tu contenido.</CardDescription>
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
                            <div className="flex-1 text-sm text-muted-foreground truncate">
                                {img.src}
                            </div>
                            <div className="flex items-center gap-2">
                                <span className={img.alt ? 'text-green-600' : 'text-destructive'}>{img.alt ? "✓ 'alt' presente" : "✗ 'alt' ausente"}</span>
                                {img.alt && (
                                    <div className="h-2 w-2 rounded-full bg-green-500" />
                                )}
                                {!img.alt && (
                                     <div className="h-2 w-2 rounded-full bg-destructive" />
                                )}
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
