
"use client";

import React, { useEffect, useState, Suspense, useCallback } from 'react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { Button, buttonVariants } from '@/components/ui/button';
import { Loader2, ArrowLeft, Save } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { auth } from '@/lib/firebase';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { ContentImage, ExtractedWidget } from '@/lib/types';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { SeoAnalyzer } from '@/components/features/seo/seo-analyzer';
import { RichTextEditor } from '@/components/features/editor/rich-text-editor';
import { LinkSuggestionsDialog } from '@/components/features/editor/link-suggestions-dialog';
import type { LinkSuggestion, SuggestLinksOutput } from '@/ai/schemas';

export interface PostEditState {
  title: string;
  content: string | ExtractedWidget[]; 
  isElementor: boolean;
  elementorEditLink: string | null;
  adminEditLink?: string | null;
  link?: string;
  postType: 'Post' | 'Page' | 'Producto';
  lang: string;
  meta: {
      _yoast_wpseo_title: string;
      _yoast_wpseo_metadesc: string;
      _yoast_wpseo_focuskw: string;
  };
  featuredImageUrl?: string | null; // Added this property
}

function EditPageContent() {
  const params = useParams();
  const router = useRouter();
  const searchParams = useSearchParams();
  const postId = Number(params.id);
  const postType = searchParams.get('type') || 'Page';
    
  const [post, setPost] = useState<PostEditState | null>(null);
  const [contentImages, setContentImages] = useState<ContentImage[]>([]);
  
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isAiLoading, setIsAiLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  const [applyAiMetaToFeatured, setApplyAiMetaToFeatured] = useState(true);
  const [isSuggestingLinks, setIsSuggestingLinks] = useState(false);
  const [linkSuggestions, setLinkSuggestions] = useState<LinkSuggestion[]>([]);
  
  const { toast } = useToast();

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    if (!post) return;
    const { name, value } = e.target;
    if (name in post.meta) {
      setPost({ ...post, meta: { ...post.meta, [name]: value } });
    } else {
      setPost({ ...post, [name]: value });
    }
  };

  const handleContentChange = (newContent: string) => {
    if (!post) return;
    setPost({ ...post, content: newContent });
  };
  

  const fetchInitialData = useCallback(async () => {
    setIsLoading(true); setError(null);
    const user = auth.currentUser;
    if (!user) { setError('Authentication required.'); setIsLoading(false); return; }
    if (isNaN(postId)) { setError(`El ID del contenido no es válido.`); setIsLoading(false); return; }

    try {
      const token = await user.getIdToken();
      const apiPath = postType === 'Producto' ? `/api/wordpress/products/${postId}` : postType === 'Post' ? `/api/wordpress/posts/${postId}` : `/api/wordpress/pages/${postId}`;
      
      const postResponse = await fetch(`${apiPath}?context=edit&bust=${new Date().getTime()}`, { headers: { 'Authorization': `Bearer ${token}` }, cache: 'no-store' });
      if (!postResponse.ok) throw new Error((await postResponse.json()).error || `Failed to fetch ${postType} data.`);
      
      const postData = await postResponse.json();
      
      const loadedPost: PostEditState = {
        title: postData.title?.rendered || postData.name || '',
        content: postData.content?.rendered || '',
        isElementor: postData.isElementor || false, 
        elementorEditLink: postData.elementorEditLink || null,
        adminEditLink: postData.adminEditLink || null,
        link: postData.link,
        postType: postType as any,
        lang: postData.lang || 'es',
        meta: {
          _yoast_wpseo_title: postData.meta?._yoast_wpseo_title || postData.title?.rendered || postData.name || '',
          _yoast_wpseo_metadesc: postData.meta?._yoast_wpseo_metadesc || postData.excerpt?.rendered.replace(/<[^>]+>/g, '') || '',
          _yoast_wpseo_focuskw: postData.meta?._yoast_wpseo_focuskw || '',
        },
        featuredImageUrl: postData.featured_image_url || null,
      };
      
      setPost(loadedPost);
      if (postData.scrapedImages && Array.isArray(postData.scrapedImages)) {
          setContentImages(postData.scrapedImages);
      } else {
          setContentImages([]);
      }

    } catch (e: any) { setError(e.message);
    } finally { setIsLoading(false); }
  }, [postId, postType]);


  useEffect(() => { fetchInitialData(); }, [fetchInitialData]);
  
  const handleSaveChanges = async () => {
    setIsSaving(true);
    const user = auth.currentUser;
    if (!user || !post) {
      toast({ title: 'Error', description: 'No se puede guardar.', variant: 'destructive' });
      setIsSaving(false);
      return;
    }

    try {
        const token = await user.getIdToken();
        const payload: any = {
            title: post.title,
            content: post.content,
            meta: post.meta,
        };

        if (applyAiMetaToFeatured && post.meta._yoast_wpseo_focuskw) {
             const featuredImageId =
               post.isElementor && Array.isArray(post.content)
                 ? post.content.find(w => w.type === 'image' || w.type === 'featured_image')?.id
                 : typeof post.content === 'string'
                 ? (post.content.match(/wp-image-(\d+)/) || [])[1]
                 : null;

             if (featuredImageId) {
                payload.featured_image_metadata = {
                    media_id: parseInt(featuredImageId, 10),
                    title: post.meta._yoast_wpseo_title || post.title,
                    alt_text: post.meta._yoast_wpseo_focuskw,
                }
             }
        }
        
        const imageUpdates = contentImages
          .map(img => ({ id: img.mediaId, alt: img.alt }))
          .filter(img => img.id !== null);

        if (imageUpdates.length > 0) {
            payload.image_alt_updates = imageUpdates;
        }
        
        const endpoint = post.postType === 'Producto' ? `/api/wordpress/products/${postId}` :
                         post.postType === 'Post' ? `/api/wordpress/posts/${postId}` : `/api/wordpress/pages/${postId}`;


        const response = await fetch(endpoint, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
            body: JSON.stringify(payload)
        });

        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.error || 'Fallo al guardar los cambios');
        }
        
        toast({ title: '¡Éxito!', description: `Los metadatos SEO han sido actualizados.` });
        
    } catch (e: any) {
        toast({ title: 'Error al Guardar', description: e.message, variant: 'destructive' });
    } finally {
        setIsSaving(false);
    }
  };

  const handleSuggestLinks = async () => {
    if (!post || typeof post.content !== 'string') return;
    setIsSuggestingLinks(true);
    try {
        const user = auth.currentUser; if (!user) throw new Error("No autenticado.");
        const token = await user.getIdToken();
        const response = await fetch('/api/ai/suggest-links', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
            body: JSON.stringify({ content: post.content })
        });
        if (!response.ok) throw new Error((await response.json()).message || "La IA falló al sugerir enlaces.");
        
        const data: SuggestLinksOutput = await response.json();
        setLinkSuggestions(data.suggestions || []);

    } catch(e: any) {
        toast({ title: "Error al sugerir enlaces", description: e.message, variant: "destructive" });
        setLinkSuggestions([]);
    } finally {
        setIsSuggestingLinks(false);
    }
  };

  const applyLink = (content: string, suggestion: LinkSuggestion): string => {
    const phrase = suggestion.phraseToLink.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const regex = new RegExp(`(?<!<a[^>]*>)${phrase}(?!<\\/a>)`, '');
    if (content.match(regex)) {
        return content.replace(regex, `<a href="${suggestion.targetUrl}" target="_blank">${suggestion.phraseToLink}</a>`);
    }
    return content;
  };

  const handleApplySuggestion = (suggestion: LinkSuggestion) => {
    if (!post || typeof post.content !== 'string') return;
    const newContent = applyLink(post.content, suggestion);
    if (newContent !== post.content) {
        setPost(p => p ? { ...p, content: newContent } : null);
        toast({ title: "Enlace aplicado", description: `Se ha enlazado la frase "${suggestion.phraseToLink}".` });
        setLinkSuggestions(prev => prev.filter(s => s.phraseToLink !== suggestion.phraseToLink || s.targetUrl !== suggestion.targetUrl));
    } else {
        toast({ title: "No se pudo aplicar", description: "No se encontró la frase exacta o ya estaba enlazada.", variant: "destructive" });
    }
  };

  const handleApplyAllSuggestions = () => {
     if (!post || typeof post.content !== 'string') return;
     let updatedContent = post.content;
     let appliedCount = 0;
     for (const suggestion of linkSuggestions) {
         const newContent = applyLink(updatedContent, suggestion);
         if (newContent !== updatedContent) {
             updatedContent = newContent;
             appliedCount++;
         }
     }
     if (appliedCount > 0) {
        setPost(p => p ? { ...p, content: updatedContent } : null);
        toast({ title: "Enlaces aplicados", description: `Se han aplicado ${appliedCount} sugerencias de enlaces.` });
        setLinkSuggestions([]);
     } else {
        toast({ title: "No se aplicó nada", description: "No se encontraron frases o ya estaban enlazadas.", variant: "destructive" });
     }
  };
  

  if (isLoading) {
    return <div className="flex items-center justify-center min-h-[calc(100vh-8rem)] w-full"><Loader2 className="h-10 w-10 animate-spin text-primary" /></div>;
  }
  
  if (error || !post) {
     return <div className="container mx-auto py-8"><Alert variant="destructive"><AlertTitle>Error al Cargar</AlertTitle><AlertDescription>{error || `No se pudo cargar la información.`}</AlertDescription></Alert></div>;
  }

  return (
    <>
    <div className="container mx-auto py-8 space-y-6">
        <Card>
            <CardHeader>
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                    <div>
                        <CardTitle>Optimizador SEO</CardTitle>
                        <CardDescription>Editando: {post.title}</CardDescription>
                    </div>
                    <div className="flex flex-wrap gap-2">
                        <Button variant="outline" onClick={() => router.push(`/seo-optimizer?id=${postId}&type=${postType}`)}>
                            <ArrowLeft className="mr-2 h-4 w-4" />
                            Volver al Análisis
                        </Button>
                        <Button onClick={handleSaveChanges} disabled={isSaving || isAiLoading}>
                            {isSaving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                            <Save className="mr-2 h-4 w-4" />
                            Guardar Cambios SEO
                        </Button>
                    </div>
                </div>
            </CardHeader>
        </Card>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start">
          <div className="lg:col-span-2 space-y-6">
             <SeoAnalyzer 
                post={post}
                setPost={setPost}
                isLoading={isAiLoading}
                setIsLoading={setIsAiLoading}
                contentImages={contentImages}
                setContentImages={setContentImages}
                applyAiMetaToFeatured={applyAiMetaToFeatured}
                setApplyAiMetaToFeatured={setApplyAiMetaToFeatured}
                postId={postId}
             />
             {!post.isElementor && (
                 <Card>
                    <CardHeader>
                        <CardTitle>Editor de Contenido</CardTitle>
                        <CardDescription>Modifica el contenido principal de la página. Puedes usar los botones de formato y la IA para mejorar tu texto.</CardDescription>
                    </CardHeader>
                    <CardContent>
                         <RichTextEditor
                            content={typeof post.content === 'string' ? post.content : ''}
                            onChange={handleContentChange}
                            onInsertImage={() => {}}
                            onSuggestLinks={handleSuggestLinks}
                            placeholder="Cargando contenido..."
                         />
                    </CardContent>
                 </Card>
             )}
          </div>
          
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
          </div>
        </div>
    </div>
    <LinkSuggestionsDialog
      open={linkSuggestions.length > 0 && !isSuggestingLinks}
      onOpenChange={(open) => { if (!open) setLinkSuggestions([]); }}
      suggestions={linkSuggestions}
      onApplySuggestion={handleApplySuggestion}
      onApplyAll={handleApplyAllSuggestions}
    />
    </>
  );
}

export default function EditPage() {
    return (
        <Suspense fallback={<div className="flex items-center justify-center min-h-[calc(100vh-8rem)] w-full"><Loader2 className="h-10 w-10 animate-spin text-primary" /></div>}>
            <EditPageContent />
        </Suspense>
    )
}
