

"use client";

import React, { useEffect, useState, Suspense, useCallback } from 'react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Loader2, Sparkles, Wand2, Tags, ArrowLeft, ExternalLink, Image as ImageIcon, Copy } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { auth } from '@/lib/firebase';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import type { WordPressPostCategory, WordPressUser, ProductPhoto } from '@/lib/types';
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
  translations?: Record<string, number>;
}

interface ParsedImage {
  src: string;
  alt: string;
}

function EditPageContent() {
  const params = useParams();
  const searchParams = useSearchParams();
  const router = useRouter();

  const postId = Number(params.id);
  const postType = searchParams.get('type') as 'Post' | 'Page';
    
  const [post, setPost] = useState<PostEditState | null>(null);
  const [imagesInContent, setImagesInContent] = useState<ParsedImage[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isAiLoading, setIsAiLoading] = useState(false);
  const [suggestedImageMeta, setSuggestedImageMeta] = useState<{title: string, altText: string} | null>(null);
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
  
  const handleAiGeneration = useCallback(async (mode: 'enhance_content' | 'suggest_keywords' | 'generate_meta_description' | 'generate_image_meta' | 'generate_focus_keyword') => {
        setIsAiLoading(true);
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

            if (mode === 'enhance_content') {
                setPost(prev => prev ? { ...prev, title: aiContent.title } : null);
                toast({ title: "Título mejorado", description: "Se ha actualizado el título de la entrada." });
            } else if (mode === 'generate_meta_description') {
                setPost(prev => prev ? { ...prev, metaDescription: aiContent.metaDescription } : null);
                toast({ title: "Meta descripción generada", description: "El campo para buscadores ha sido actualizado." });
            } else if (mode === 'generate_image_meta') {
                setSuggestedImageMeta({ title: aiContent.imageTitle, altText: aiContent.imageAltText });
                toast({ title: "Metadatos de imagen sugeridos", description: "Copia y pega los resultados en tu biblioteca de medios." });
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
            status: post.status,
            author: post.author,
            metaDescription: post.metaDescription,
            focusKeyword: post.focusKeyword,
        };
        
        if (postType === 'Post') {
            payload.categories = post.category ? [post.category] : [];
            payload.tags = post.tags;
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
        
        toast({ title: '¡Éxito!', description: `La entrada ha sido actualizada en ${postType === 'Post' ? 'WordPress' : 'la base de datos'}.` });
        
        if (syncSeo && post.translations && Object.keys(post.translations).length > 1) {
            toast({ title: "Sincronizando SEO...", description: "Aplicando mejoras a las traducciones. Esto puede tardar." });
            const syncPayload = {
                sourcePostId: postId,
                postType: postType,
                translations: post.translations,
                metaDescription: post.metaDescription,
                focusKeyword: post.focusKeyword
            };
            
            fetch('/api/seo/sync-translations', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
                body: JSON.stringify(syncPayload)
            }).then(async (syncResponse) => {
                const syncResult = await syncResponse.json();
                if (syncResponse.ok) {
                    toast({ title: "Sincronización SEO completada", description: syncResult.message });
                } else {
                     toast({ title: "Error en la sincronización SEO", description: syncResult.message || "No se pudieron actualizar todas las traducciones.", variant: "destructive" });
                }
            });
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
      try {
        const token = await user.getIdToken();
        const apiPath = postType === 'Post' ? `/api/wordpress/posts/${postId}` : `/api/wordpress/pages/${postId}`;

        const postResponsePromise = fetch(`${apiPath}?_embed=true`, { headers: { 'Authorization': `Bearer ${token}` }});
        const categoriesResponsePromise = fetch('/api/wordpress/post-categories', { headers: { 'Authorization': `Bearer ${token}` }});
        const authorsResponsePromise = fetch('/api/wordpress/users', { headers: { 'Authorization': `Bearer ${token}` }});
        
        const [postResponse, categoriesResponse, authorsResponse] = await Promise.all([
          postResponsePromise,
          categoriesResponsePromise,
          authorsResponsePromise
        ]);

        if (!postResponse.ok) {
          const errorData = await postResponse.json();
          throw new Error(errorData.error || `Failed to fetch ${postType} data.`);
        }
        const postData = await postResponse.json();
        
        if (categoriesResponse.ok) setCategories(await categoriesResponse.json());
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
          translations: postData.translations || {},
        });

      } catch (e: any) {
        setError(e.message);
      } finally {
        setIsLoading(false);
      }
    };
    if(postId && postType) fetchInitialData();
  }, [postId, postType, toast]);

  useEffect(() => {
    if (post?.content) {
      const parser = new DOMParser();
      const doc = parser.parseFromString(post.content, 'text/html');
      const images = Array.from(doc.querySelectorAll('img')).map(img => ({
        src: img.getAttribute('src') || '',
        alt: img.getAttribute('alt') || '',
      }));
      setImagesInContent(images);
    }
  }, [post?.content]);
  

  if (isLoading) {
    return <div className="flex items-center justify-center min-h-[calc(100vh-8rem)] w-full"><Loader2 className="h-10 w-10 animate-spin text-primary" /></div>;
  }
  
  if (error) {
     return <div className="container mx-auto py-8"><Alert variant="destructive"><AlertTitle>Error al Cargar</AlertTitle><AlertDescription>{error}</AlertDescription></Alert></div>;
  }
  
  if (!post) {
       return <div className="container mx-auto py-8"><Alert variant="destructive"><AlertTitle>Error</AlertTitle><AlertDescription>No se pudo cargar la información del contenido.</AlertDescription></Alert></div>;
  }
  
  const imagesWithoutAlt = imagesInContent.filter(img => !img.alt);

  return (
    <div className="container mx-auto py-8 space-y-6">
        <Card>
            <CardHeader>
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                    <div>
                        <CardTitle>Optimizador SEO</CardTitle>
                        <CardDescription>Editando: {post.title}</CardDescription>
                    </div>
                    <div className="flex gap-2">
                        <Button variant="outline" onClick={() => router.push('/seo-optimizer')}>
                            <ArrowLeft className="mr-2 h-4 w-4" />
                            Volver al Optimizador
                        </Button>
                        <Button onClick={handleSaveChanges} disabled={isSaving}>
                            {isSaving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                            Guardar Cambios
                        </Button>
                    </div>
                </div>
            </CardHeader>
        </Card>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start">
          {/* Main Column */}
          <div className="lg:col-span-2 space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>SEO Principal</CardTitle>
                <CardDescription>Optimiza los elementos más importantes para los motores de búsqueda.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div>
                    <Label htmlFor="title">Título SEO</Label>
                    <Input id="title" name="title" value={post.title} onChange={handleInputChange} />
                </div>
                <div>
                    <Label htmlFor="focusKeyword">Palabra Clave Principal</Label>
                    <Input id="focusKeyword" name="focusKeyword" value={post.focusKeyword} onChange={handleInputChange} />
                </div>
                <div>
                    <Label htmlFor="metaDescription">Meta Descripción (para Google)</Label>
                    <Textarea id="metaDescription" name="metaDescription" value={post.metaDescription} onChange={handleInputChange} maxLength={165} rows={4} />
                </div>
                 {post.isElementor && post.elementorEditLink && (
                        <Alert className="mt-4">
                            <ExternalLink className="h-4 w-4" />
                            <AlertTitle>Página de Elementor</AlertTitle>
                            <AlertDescription>
                                El contenido de esta página se edita con Elementor. Usa este botón para abrir el editor visual y modificar el contenido y los textos alternativos de las imágenes.
                            </AlertDescription>
                            <Button asChild className="mt-4" size="sm">
                                <Link href={post.elementorEditLink} target="_blank" rel="noopener noreferrer">
                                    <ExternalLink className="mr-2 h-4 w-4" />
                                    Abrir con Elementor
                                </Link>
                            </Button>
                        </Alert>
                    )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Análisis y Auditoría SEO</CardTitle>
                <CardDescription>Recomendaciones basadas en el contenido y los metadatos actuales.</CardDescription>
              </CardHeader>
              <CardContent>
                <GoogleSnippetPreview title={post.title} description={post.metaDescription} url={''} />
                <SeoAnalyzer title={post.title} content={post.content} focusKeyword={post.focusKeyword} metaDescription={post.metaDescription} />
              </CardContent>
            </Card>
            
            <Card>
                <CardHeader>
                    <CardTitle className="flex items-center gap-2"><ImageIcon /> Optimización de Imágenes</CardTitle>
                    <CardDescription>El texto alternativo es crucial. Aquí puedes identificar imágenes sin él y generar sugerencias con IA.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                     <Button onClick={() => handleAiGeneration('generate_image_meta')} disabled={isAiLoading || !post.content}>
                        {isAiLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Sparkles className="mr-2 h-4 w-4" />}
                        Sugerir Metadatos con IA
                    </Button>
                     {suggestedImageMeta && (
                        <Alert>
                            <AlertTitle>Sugerencias de la IA</AlertTitle>
                            <AlertDescription>
                                <div className="space-y-2 mt-2">
                                    <div>
                                        <div className="flex justify-between items-center">
                                            <Label className="text-xs">Título de Imagen Sugerido</Label>
                                            <Button variant="ghost" size="icon-sm" onClick={() => navigator.clipboard.writeText(suggestedImageMeta.title)}><Copy className="h-3 w-3" /></Button>
                                        </div>
                                        <p className="text-sm p-2 bg-muted rounded-md">{suggestedImageMeta.title}</p>
                                    </div>
                                     <div>
                                        <div className="flex justify-between items-center">
                                            <Label className="text-xs">Texto Alternativo (Alt) Sugerido</Label>
                                            <Button variant="ghost" size="icon-sm" onClick={() => navigator.clipboard.writeText(suggestedImageMeta.altText)}><Copy className="h-3 w-3" /></Button>
                                        </div>
                                        <p className="text-sm p-2 bg-muted rounded-md">{suggestedImageMeta.altText}</p>
                                    </div>
                                    <p className="text-xs text-muted-foreground">Usa estas sugerencias como base en tu biblioteca de medios de WordPress.</p>
                                </div>
                            </AlertDescription>
                        </Alert>
                     )}
                     {imagesWithoutAlt.length > 0 && (
                        <div>
                            <h4 className="font-semibold mb-2">Imágenes sin `alt` text:</h4>
                            <div className="max-h-48 overflow-y-auto space-y-2 p-2 border rounded-md">
                                {imagesWithoutAlt.map((img, i) => (
                                    <div key={i} className="text-xs text-destructive truncate">
                                       <span className="font-mono">{img.src}</span>
                                    </div>
                                ))}
                            </div>
                        </div>
                     )}
                     {imagesInContent.length > 0 && imagesWithoutAlt.length === 0 && (
                        <Alert variant="default" className="border-green-500/50">
                            <AlertTitle className="text-green-600">¡Buen trabajo!</AlertTitle>
                            <AlertDescription>Todas las {imagesInContent.length} imágenes encontradas en el contenido tienen texto alternativo.</AlertDescription>
                        </Alert>
                     )}
                </CardContent>
            </Card>

          </div>
          
          {/* Sidebar Column */}
          <div className="space-y-6">
            <Card>
                <CardHeader>
                <CardTitle>Asistente IA</CardTitle>
                <CardDescription>Usa la IA para acelerar la optimización de los campos de texto.</CardDescription>
                </CardHeader>
                <CardContent className="flex flex-col gap-2">
                  <Button onClick={() => handleAiGeneration('enhance_content')} disabled={isAiLoading || !post.content}>
                      {isAiLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Wand2 className="mr-2 h-4 w-4" />}
                      Mejorar Título con IA
                  </Button>
                  <Button onClick={() => handleAiGeneration('generate_focus_keyword')} disabled={isAiLoading || !post.content} variant="outline">
                      {isAiLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Sparkles className="mr-2 h-4 w-4" />}
                      Sugerir Palabra Clave Principal
                  </Button>
                  <Button onClick={() => handleAiGeneration('generate_meta_description')} disabled={isAiLoading || !post.content} variant="outline">
                      {isAiLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Sparkles className="mr-2 h-4 w-4" />}
                      Generar Meta Descripción con IA
                  </Button>
                   {postType === 'Post' && (
                        <Button onClick={() => handleAiGeneration('suggest_keywords')} disabled={isAiLoading || !post.content} variant="outline">
                            {isAiLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Tags className="mr-2 h-4 w-4" />}
                            Sugerir Etiquetas con IA
                        </Button>
                    )}
                </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Publicación y Organización</CardTitle>
              </CardHeader>
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
                      <div className="flex items-center space-x-2 pt-4 border-t">
                          <Checkbox id="sync-seo" checked={syncSeo} onCheckedChange={(checked) => setSyncSeo(!!checked)} />
                          <Label htmlFor="sync-seo" className="font-normal text-sm cursor-pointer">
                              Sincronizar SEO con las traducciones
                          </Label>
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
