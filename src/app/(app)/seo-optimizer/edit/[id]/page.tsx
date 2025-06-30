

"use client";

import React, { useEffect, useState, Suspense, useCallback, useRef } from 'react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import Image from 'next/image';

import { Button, buttonVariants } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Loader2, Sparkles, Wand2, Tags, ArrowLeft, ExternalLink, ImageIcon, Copy, Check, Edit } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { auth } from '@/lib/firebase';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import type { WordPressPostCategory, WordPressUser } from '@/lib/types';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { SeoAnalyzer } from '@/components/features/blog/seo-analyzer';
import { GoogleSnippetPreview } from '@/components/features/blog/google-snippet-preview';
import { Checkbox } from '@/components/ui/checkbox';


interface PostEditState {
  title: string;
  content: string; 
  status: 'publish' | 'draft' | 'pending' | 'future' | 'private';
  author: number | null;
  category: number | null;
  tags: string;
  metaDescription: string;
  focusKeyword: string;
  isElementor: boolean;
  elementorEditLink: string | null;
  featuredImageUrl?: string | null;
  featuredMediaId?: number | null;
  translations?: Record<string, number>;
}

interface ParsedImage {
  src: string;
  alt: string;
}

function EditPageContent() {
  const params = useParams();
  const router = useRouter();
  const searchParams = useSearchParams();

  const postId = Number(params.id);
  const postType = searchParams.get('type');
    
  const [post, setPost] = useState<PostEditState | null>(null);
  const [imageMetas, setImageMetas] = useState<ParsedImage[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isAiLoading, setIsAiLoading] = useState(false);
  const [suggestedImageMeta, setSuggestedImageMeta] = useState<{title: string, altText: string} | null>(null);
  const [applyMetaToFeatured, setApplyMetaToFeatured] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [categories, setCategories] = useState<WordPressPostCategory[]>([]);
  const [authors, setAuthors] = useState<WordPressUser[]>([]);
  const [syncSeo, setSyncSeo] = useState(true);

  const { toast } = useToast();

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    if (!post) return;
    setPost({ ...post, [e.target.name]: e.target.value });
  };
  
  const handleSelectChange = (name: 'status' | 'category' | 'author', value: string) => {
    if (!post) return;
    const finalValue = (name === 'category' || name === 'author') ? (value ? parseInt(value, 10) : null) : value;
    setPost({ ...post, [name]: finalValue as any });
  };
  
  const handleAiGeneration = useCallback(async (mode: 'enhance_title' | 'suggest_keywords' | 'generate_meta_description' | 'generate_image_meta' | 'generate_focus_keyword') => {
        setIsAiLoading(true);
        setSuggestedImageMeta(null);
        setApplyMetaToFeatured(false);

        if (!post) {
            setIsAiLoading(false);
            return;
        }
        try {
            const user = auth.currentUser;
            if (!user) throw new Error("No autenticado.");
            const token = await user.getIdToken();
            
            const payload = { 
                mode, 
                language: 'Spanish',
                existingTitle: post.title,
                existingContent: post.content
            };
            
            if (!payload.existingTitle || !payload.existingContent) {
                 throw new Error("El título y el contenido son necesarios para esta acción.");
            }

            const response = await fetch('/api/generate-blog-post', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
                body: JSON.stringify(payload)
            });

            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.error || "La IA no pudo procesar la solicitud.");
            }

            const aiContent = await response.json();

            if (mode === 'enhance_title') {
                setPost(prev => prev ? { ...prev, title: aiContent.title } : null);
                toast({ title: "Título mejorado", description: "Se ha actualizado el título de la entrada." });
            } else if (mode === 'generate_meta_description') {
                setPost(prev => prev ? { ...prev, metaDescription: aiContent.metaDescription } : null);
                toast({ title: "Meta descripción generada", description: "El campo para buscadores ha sido actualizado." });
            } else if (mode === 'generate_image_meta') {
                setSuggestedImageMeta({ title: aiContent.imageTitle, altText: aiContent.imageAltText });
                toast({ title: "Metadatos de imagen sugeridos", description: "Puedes aplicarlos a la imagen destacada o copiarlos." });
            } else if (mode === 'generate_focus_keyword') {
                 setPost(prev => prev ? { ...prev, focusKeyword: aiContent.focusKeyword } : null);
                toast({ title: "Palabra clave sugerida", description: "Se ha rellenado el campo de palabra clave principal." });
            } else { // suggest_keywords
                setPost(prev => prev ? { ...prev, tags: aiContent.suggestedKeywords } : null);
                toast({ title: "Etiquetas sugeridas", description: "Se han actualizado las etiquetas." });
            }

        } catch (error: any) {
            toast({ title: "Error de IA", description: error.message, variant: "destructive" });
        } finally {
            setIsAiLoading(false);
        }
    }, [post, toast]);

    const handleSaveChanges = async () => {
    setIsSaving(true);
    const user = auth.currentUser;
    if (!user || !post) {
      toast({ title: 'Error', description: 'No se puede guardar la entrada.', variant: 'destructive' });
      setIsSaving(false);
      return;
    }

    try {
        const token = await user.getIdToken();
        
        const payload: any = {
            title: post.title,
            // The content itself is not edited here, but we pass it back to not delete it
            content: post.content, 
            status: post.status,
            author: post.author,
            metaDescription: post.metaDescription,
            focusKeyword: post.focusKeyword,
            imageMetas: imageMetas, // Send updated image metadata
        };
        
        if (postType === 'Post') {
            payload.categories = post.category ? [post.category] : [];
            payload.tags = post.tags;
        }

        if (applyMetaToFeatured && suggestedImageMeta) {
            payload.featured_image_metadata = {
                title: suggestedImageMeta.title,
                alt_text: suggestedImageMeta.altText,
            };
        }
        
        const apiPath = postType === 'Post' ? `/api/wordpress/posts/${postId}` : `/api/wordpress/pages/${postId}`;

        const response = await fetch(apiPath, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
            body: JSON.stringify(payload)
        });

        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.error || 'Failed to save changes.');
        }
        
        toast({ title: '¡Éxito!', description: `La entrada ha sido actualizada en WordPress.` });
        
        if (syncSeo && post.translations && Object.keys(post.translations).length > 1) {
            toast({ title: "Sincronizando SEO...", description: "Aplicando mejoras a las traducciones. Esto puede tardar." });
            const syncPayload = {
                sourcePostId: postId, postType: postType, translations: post.translations,
                metaDescription: post.metaDescription, focusKeyword: post.focusKeyword
            };
            fetch('/api/seo/sync-translations', { method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` }, body: JSON.stringify(syncPayload) })
            .then(r => r.json()).then(res => toast({ title: res.success ? "Sincronización SEO completada" : "Error de sincronización SEO", description: res.message }));
        }
        
    } catch (e: any) {
        toast({ title: 'Error al Guardar', description: e.message, variant: 'destructive' });
    } finally {
        setIsSaving(false);
    }
  };

  useEffect(() => {
    const fetchInitialData = async () => {
      setIsLoading(true);
      setError(null);
      const user = auth.currentUser;
      if (!user) {
        setError('Authentication required.');
        setIsLoading(false);
        return;
      }
      
      if (isNaN(postId) || (postType !== 'Post' && postType !== 'Page')) {
        setError('El ID o el tipo de contenido no son válidos.');
        setIsLoading(false);
        return;
      }

      try {
        const token = await user.getIdToken();
        const apiPath = postType === 'Post' ? `/api/wordpress/posts/${postId}` : `/api/wordpress/pages/${postId}`;

        const postResponsePromise = fetch(`${apiPath}?_embed=true`, { headers: { 'Authorization': `Bearer ${token}` }});
        const categoriesResponsePromise = postType === 'Post' ? fetch('/api/wordpress/post-categories', { headers: { 'Authorization': `Bearer ${token}` }}) : Promise.resolve(null);
        const authorsResponsePromise = fetch('/api/wordpress/users', { headers: { 'Authorization': `Bearer ${token}` }});
        
        const [postResponse, categoriesResponse, authorsResponse] = await Promise.all([
          postResponsePromise, categoriesResponsePromise, authorsResponsePromise
        ]);

        if (!postResponse.ok) {
          const errorData = await postResponse.json();
          throw new Error(errorData.error || `Failed to fetch ${postType} data.`);
        }
        const postData = await postResponse.json();
        
        if (categoriesResponse?.ok) setCategories(await categoriesResponse.json());
        if (authorsResponse.ok) setAuthors(await authorsResponse.json());
        
        setPost({
          title: postData.title.rendered || '',
          content: postData.content.rendered || '',
          status: postData.status || 'draft',
          author: postData.author || null,
          category: postData.categories?.[0] || null,
          tags: postData._embedded?.['wp:term']?.[1]?.map((t: any) => t.name).join(', ') || '',
          metaDescription: postData.meta?._yoast_wpseo_metadesc || '',
          focusKeyword: postData.meta?._yoast_wpseo_focuskw || '',
          isElementor: postData.isElementor || false,
          elementorEditLink: postData.elementorEditLink || null,
          featuredImageUrl: postData.featured_image_url || null,
          featuredMediaId: postData.featured_media || null,
          translations: postData.translations || {},
        });

      } catch (e: any) {
        setError(e.message);
      } finally {
        setIsLoading(false);
      }
    };
    if(postId && postType) fetchInitialData();
  }, [postId, postType]);

  useEffect(() => {
    if (post?.content) {
      const parser = new DOMParser();
      const doc = parser.parseFromString(post.content, 'text/html');
      const images = Array.from(doc.querySelectorAll('img')).map(img => ({
        src: img.getAttribute('src') || '',
        alt: img.getAttribute('alt') || '',
      }));
      setImageMetas(images);
    }
  }, [post?.content]);

    const handleImageMetaChange = (src: string, newAlt: string) => {
        setImageMetas(prevMetas => 
            prevMetas.map(meta => 
                meta.src === src ? { ...meta, alt: newAlt } : meta
            )
        );
    };

    const handleCopyText = (textToCopy: string) => {
        navigator.clipboard.writeText(textToCopy);
        toast({
            title: "Copiado al portapapeles",
        });
    };
  

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
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                    <div>
                        <CardTitle>Centro de Acción SEO</CardTitle>
                        <CardDescription>Editando: {post.title}</CardDescription>
                    </div>
                    <div className="flex gap-2">
                        <Button variant="outline" onClick={() => router.push('/seo-optimizer')}>
                            <ArrowLeft className="mr-2 h-4 w-4" /> Volver
                        </Button>
                        <Button onClick={handleSaveChanges} disabled={isSaving}>
                            {isSaving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />} Guardar Cambios
                        </Button>
                    </div>
                </div>
            </CardHeader>
        </Card>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start">
          <div className="lg:col-span-2 space-y-6">
            <Card>
              <CardHeader><CardTitle>Contenido y SEO Principal</CardTitle></CardHeader>
              <CardContent className="space-y-6">
                <div><Label htmlFor="title">Título SEO</Label><Input id="title" name="title" value={post.title} onChange={handleInputChange} /></div>
                <div><Label htmlFor="focusKeyword">Palabra Clave Principal</Label><Input id="focusKeyword" name="focusKeyword" value={post.focusKeyword} onChange={handleInputChange} /></div>
                <div><Label htmlFor="metaDescription">Meta Descripción (para Google)</Label><Textarea id="metaDescription" name="metaDescription" value={post.metaDescription} onChange={handleInputChange} maxLength={165} rows={3} /></div>
                
                {post.isElementor ? (
                    <Alert>
                        <ExternalLink className="h-4 w-4" />
                        <AlertTitle>Página de Elementor Detectada</AlertTitle>
                        <AlertDescription>
                            Para editar el contenido y la estructura de encabezados, debes usar el editor de Elementor.
                        </AlertDescription>
                        <Button asChild className="mt-2" size="sm" variant="secondary">
                            <Link href={post.elementorEditLink!} target="_blank" rel="noopener noreferrer">
                                <ExternalLink className="mr-2 h-4 w-4" />
                                Abrir con Elementor
                            </Link>
                        </Button>
                    </Alert>
                ) : (
                    <Alert>
                        <Edit className="h-4 w-4" />
                        <AlertTitle>Editar Contenido Completo</AlertTitle>
                        <AlertDescription>
                            Para modificar el cuerpo del texto y la estructura de encabezados (H2, H3...), utiliza el editor de entradas completo.
                        </AlertDescription>
                        <Button asChild className="mt-2" size="sm" variant="secondary">
                            <Link href={`/blog/edit/${postId}`}>
                                <ExternalLink className="mr-2 h-4 w-4" />
                                Abrir Editor de Entradas
                            </Link>
                        </Button>
                    </Alert>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader><CardTitle>Análisis y Auditoría SEO</CardTitle></CardHeader>
              <CardContent><GoogleSnippetPreview title={post.title} description={post.metaDescription} url={''} /><SeoAnalyzer title={post.title} content={post.content} focusKeyword={post.focusKeyword} metaDescription={post.metaDescription} /></CardContent>
            </Card>
            
            <Card>
                <CardHeader><CardTitle className="flex items-center gap-2"><ImageIcon /> Editor de Metadatos de Imágenes</CardTitle></CardHeader>
                <CardContent className="space-y-4">
                     {suggestedImageMeta && (
                        <Alert>
                            <AlertTitle>Sugerencias de la IA</AlertTitle>
                            <AlertDescription className="space-y-2 mt-2">
                                <div className="flex justify-between items-center"><p className="text-sm p-2 bg-muted rounded-md flex-1">{suggestedImageMeta.altText}</p><Button variant="ghost" size="icon" onClick={() => handleCopyText(suggestedImageMeta.altText)}><Copy className="h-4 w-4" /></Button></div>
                                <div className="flex items-center space-x-2 pt-2">
                                  <Checkbox id="apply-meta" checked={applyMetaToFeatured} onCheckedChange={(checked) => setApplyMetaToFeatured(!!checked)} disabled={!post.featuredMediaId} />
                                  <Label htmlFor="apply-meta" className="text-sm font-normal cursor-pointer">Aplicar a la imagen destacada al guardar</Label>
                                </div>
                                {!post.featuredMediaId && <p className="text-xs text-destructive">Esta entrada no tiene imagen destacada para aplicar los cambios.</p>}
                            </AlertDescription>
                        </Alert>
                     )}
                    {imageMetas.length > 0 ? (
                        <div className="space-y-3 max-h-96 overflow-y-auto pr-2">
                            {imageMetas.map((image, index) => (
                                <div key={index} className="flex flex-col sm:flex-row items-center gap-3 p-2 border rounded-md">
                                    <Image src={image.src} alt="Vista previa" width={64} height={64} className="w-16 h-16 object-cover rounded-md flex-shrink-0" />
                                    <div className="w-full space-y-1">
                                        <p className="text-xs text-muted-foreground truncate" title={image.src}>{image.src}</p>
                                        <Input
                                            aria-label={`Texto alternativo para ${image.src}`}
                                            placeholder="Introduce el texto alternativo..."
                                            value={image.alt}
                                            onChange={(e) => handleImageMetaChange(image.src, e.target.value)}
                                        />
                                    </div>
                                </div>
                            ))}
                        </div>
                    ) : (
                        <p className="text-sm text-muted-foreground text-center py-4">No se encontraron imágenes en el contenido.</p>
                    )}
                </CardContent>
            </Card>
          </div>
          
          <div className="space-y-6">
            <Card><CardHeader><CardTitle>Asistente IA</CardTitle></CardHeader>
                <CardContent className="flex flex-col gap-2">
                  <Button onClick={() => handleAiGeneration('enhance_title')} disabled={isAiLoading}><Wand2 className="mr-2 h-4 w-4" /> Mejorar Título</Button>
                  <Button onClick={() => handleAiGeneration('generate_focus_keyword')} disabled={isAiLoading} variant="outline"><Sparkles className="mr-2 h-4 w-4" /> Sugerir Palabra Clave</Button>
                  <Button onClick={() => handleAiGeneration('generate_meta_description')} disabled={isAiLoading} variant="outline"><Sparkles className="mr-2 h-4 w-4" /> Generar Meta Descripción</Button>
                  <Button onClick={() => handleAiGeneration('generate_image_meta')} disabled={isAiLoading} variant="outline"><ImageIcon className="mr-2 h-4 w-4" /> Sugerir Meta de Imagen</Button>
                   {postType === 'Post' && (<Button onClick={() => handleAiGeneration('suggest_keywords')} disabled={isAiLoading} variant="outline"><Tags className="mr-2 h-4 w-4" /> Sugerir Etiquetas</Button>)}
                </CardContent>
            </Card>

            <Card>
              <CardHeader><CardTitle>Publicación y Sincronización</CardTitle></CardHeader>
              <CardContent className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div><Label>Autor</Label><Select name="author" value={post.author?.toString() || ''} onValueChange={(v) => handleSelectChange('author', v)}><SelectTrigger><SelectValue/></SelectTrigger><SelectContent>{authors.map(a => <SelectItem key={a.id} value={a.id.toString()}>{a.name}</SelectItem>)}</SelectContent></Select></div>
                    <div><Label>Estado</Label><Select name="status" value={post.status} onValueChange={(v) => handleSelectChange('status', v)}><SelectTrigger><SelectValue/></SelectTrigger><SelectContent><SelectItem value="publish">Publicado</SelectItem><SelectItem value="draft">Borrador</SelectItem><SelectItem value="pending">Pendiente</SelectItem><SelectItem value="private">Privado</SelectItem><SelectItem value="future">Programado</SelectItem></SelectContent></Select></div>
                  </div>
                  {postType === 'Post' && (
                    <>
                      <div><Label>Categoría</Label><Select name="category" value={post.category?.toString() || ''} onValueChange={(v) => handleSelectChange('category', v)}><SelectTrigger><SelectValue/></SelectTrigger><SelectContent>{categories.map(c => <SelectItem key={c.id} value={c.id.toString()}>{c.name}</SelectItem>)}</SelectContent></Select></div>
                      <div><Label>Etiquetas (separadas por comas)</Label><Input name="tags" value={post.tags} onChange={handleInputChange} /></div>
                    </>
                  )}
                  {post.translations && Object.keys(post.translations).length > 1 && (
                      <div className="space-y-3 pt-4 border-t">
                        <div className="flex items-center space-x-2"><Checkbox id="sync-seo" checked={syncSeo} onCheckedChange={(checked) => setSyncSeo(!!checked)} /><Label htmlFor="sync-seo" className="font-normal text-sm cursor-pointer">Sincronizar SEO con las traducciones</Label></div>
                      </div>
                  )}
              </CardContent>
            </Card>
          </div>
        </div>
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
