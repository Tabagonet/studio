
"use client";

import React, { useEffect, useState, Suspense } from 'react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Loader2, Sparkles, Wand2, Tags, ArrowLeft, ExternalLink } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { auth } from '@/lib/firebase';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import type { WordPressPostCategory, WordPressUser, ProductPhoto } from '@/lib/types';
import { ImageUploader } from '@/components/features/wizard/image-uploader';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { SeoAnalyzer } from '@/components/features/blog/seo-analyzer';
import { GoogleSnippetPreview } from '@/components/features/blog/google-snippet-preview';
import { Checkbox } from '@/components/ui/checkbox';


interface PostEditState {
  title: string;
  content: string; // Keep for analysis, but don't show an editor for it
  status: 'publish' | 'draft' | 'pending' | 'future' | 'private';
  author: number | null;
  category: number | null;
  tags: string;
  featured_media: ProductPhoto | null;
  metaDescription: string;
  focusKeyword: string;
  isElementor: boolean;
  elementorEditLink: string | null;
}

function EditPageContent() {
  const params = useParams();
  const searchParams = useSearchParams();
  const router = useRouter();

  const postId = Number(params.id);
  const postType = searchParams.get('type') as 'Post' | 'Page';
    
  const [post, setPost] = useState<PostEditState | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isAiLoading, setIsAiLoading] = useState(false);
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

  const handlePhotosChange = (updatedPhotos: ProductPhoto[]) => {
      if (!post) return;
      setPost({ ...post, featured_media: updatedPhotos[0] || null });
  };

  const handleAIGeneration = async (mode: 'enhance_content' | 'suggest_keywords' | 'generate_meta_description') => {
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
                setPost({ ...post, title: aiContent.title });
                toast({ title: "Título mejorado", description: "Se ha actualizado el título de la entrada." });
            } else if (mode === 'generate_meta_description') {
                setPost({ ...post, metaDescription: aiContent.metaDescription });
                toast({ title: "Meta descripción generada", description: "El campo para buscadores ha sido actualizado." });
            } else { // suggest_keywords
                setPost({ ...post, tags: aiContent.suggestedKeywords });
                toast({ title: "Etiquetas sugeridas", description: "Se han actualizado las etiquetas." });
            }

        } catch (error: any) {
            toast({ title: "Error de IA", description: error.message, variant: "destructive" });
        } finally {
            setIsAiLoading(false);
        }
    };

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
        const translations = JSON.parse(searchParams.get('translations') || '{}');
        const payload: any = {
            title: post.title,
            status: post.status,
            author: post.author,
            metaDescription: post.metaDescription,
            focusKeyword: post.focusKeyword,
        };
        
        // This tool does not edit content directly. Content is fetched for analysis only.
        
        if (postType === 'Post') {
            payload.categories = post.category ? [post.category] : [];
            payload.tags = post.tags;
        }

        const newPhoto = post.featured_media?.file ? post.featured_media : null;

        if (newPhoto) {
            const formData = new FormData();
            formData.append('imagen', newPhoto.file);
            const uploadResponse = await fetch('/api/upload-image', {
                method: 'POST',
                headers: { 'Authorization': `Bearer ${token}` },
                body: formData,
            });
            const uploadData = await uploadResponse.json();
            if (!uploadResponse.ok) throw new Error(uploadData.error || 'Failed to upload new image.');
            payload.featured_image_src = uploadData.url;

        } else if (post.featured_media?.id) {
            payload.featured_media_id = post.featured_media.id;
        } else {
            payload.featured_media_id = 0; // Remove featured image
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
        
        toast({ title: '¡Éxito!', description: 'La entrada ha sido actualizada.' });
        
        if (syncSeo && translations && Object.keys(translations).length > 1) {
            toast({ title: "Sincronizando SEO...", description: "Aplicando mejoras a las traducciones. Esto puede tardar." });
            const syncPayload = {
                sourcePostId: postId,
                translations,
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
        
        router.back();
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
        
        const featuredImage: ProductPhoto | null = postData.featured_image_url
          ? {
              id: postData.featured_media,
              previewUrl: postData.featured_image_url,
              name: 'Imagen destacada',
              status: 'completed',
              progress: 100,
            }
          : null;
          
        setPost({
          title: postData.title.rendered || '',
          content: postData.content.rendered || '',
          status: postData.status || 'draft',
          author: postData.author || null,
          category: postData.categories?.[0] || null,
          tags: postData._embedded?.['wp:term']?.[1]?.map((t: any) => t.name).join(', ') || '',
          featured_media: featuredImage,
          metaDescription: postData.meta?._yoast_wpseo_metadesc || '',
          focusKeyword: postData.meta?._yoast_wpseo_focuskw || '',
          isElementor: postData.isElementor || false,
          elementorEditLink: postData.elementorEditLink || null,
        });

      } catch (e: any) {
        setError(e.message);
      } finally {
        setIsLoading(false);
      }
    };
    if(postId && postType) fetchInitialData();
  }, [postId, postType, toast]);
  

  if (isLoading) {
    return <div className="flex items-center justify-center min-h-[calc(100vh-8rem)] w-full"><Loader2 className="h-10 w-10 animate-spin text-primary" /></div>;
  }
  
  if (error) {
     return <div className="container mx-auto py-8"><Alert variant="destructive"><AlertTitle>Error al Cargar</AlertTitle><AlertDescription>{error}</AlertDescription></Alert></div>;
  }
  
  if (!post) {
       return <div className="container mx-auto py-8"><Alert variant="destructive"><AlertTitle>Error</AlertTitle><AlertDescription>No se pudo cargar la información del contenido.</AlertDescription></Alert></div>;
  }

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
                        <Button variant="outline" onClick={() => router.back()}>
                            <ArrowLeft className="mr-2 h-4 w-4" />
                            Volver
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
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Vista Previa de Google</CardTitle>
              </CardHeader>
              <CardContent>
                <GoogleSnippetPreview title={post.title} description={post.metaDescription} url={''} />
              </CardContent>
            </Card>
            
            <Card>
              <CardHeader>
                <CardTitle>Análisis SEO</CardTitle>
                <CardDescription>Recomendaciones basadas en el contenido actual de la página.</CardDescription>
              </CardHeader>
              <CardContent>
                <SeoAnalyzer title={post.title} content={post.content} focusKeyword={post.focusKeyword} />
              </CardContent>
            </Card>
          </div>
          
          {/* Sidebar Column */}
          <div className="space-y-6">
            <Card>
                <CardHeader>
                <CardTitle>Asistente IA</CardTitle>
                <CardDescription>Usa la IA para acelerar la optimización.</CardDescription>
                </CardHeader>
                <CardContent className="flex flex-col gap-2">
                  <Button onClick={() => handleAIGeneration('enhance_content')} disabled={isAiLoading || !post.content}>
                      {isAiLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Wand2 className="mr-2 h-4 w-4" />}
                      Mejorar Título con IA
                  </Button>
                  <Button onClick={() => handleAIGeneration('generate_meta_description')} disabled={isAiLoading || !post.content} variant="outline">
                      {isAiLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Sparkles className="mr-2 h-4 w-4" />}
                      Generar Meta Descripción
                  </Button>
                   {postType === 'Post' && (
                        <Button onClick={() => handleAIGeneration('suggest_keywords')} disabled={isAiLoading || !post.content} variant="outline">
                            {isAiLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Tags className="mr-2 h-4 w-4" />}
                            Sugerir Etiquetas
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
                  {searchParams.get('translations') && (
                      <div className="flex items-center space-x-2 pt-4 border-t">
                          <Checkbox id="sync-seo" checked={syncSeo} onCheckedChange={(checked) => setSyncSeo(!!checked)} />
                          <Label htmlFor="sync-seo" className="font-normal text-sm cursor-pointer">
                              Sincronizar SEO con las traducciones
                          </Label>
                      </div>
                  )}
                   {post.isElementor && post.elementorEditLink && (
                        <Alert className="mt-4">
                            <ExternalLink className="h-4 w-4" />
                            <AlertTitle>Página de Elementor</AlertTitle>
                            <AlertDescription>
                                El contenido se edita con Elementor. Usa este botón para abrir el editor visual.
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
                <CardHeader><CardTitle>Imagen Destacada</CardTitle></CardHeader>
                <CardContent><ImageUploader photos={post.featured_media ? [post.featured_media] : []} onPhotosChange={handlePhotosChange} isProcessing={isSaving} /></CardContent>
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

    