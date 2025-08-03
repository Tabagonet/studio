

"use client";

import React, { useEffect, useState, Suspense, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { Button, buttonVariants } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Loader2, ArrowLeft, Save, Edit } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { auth } from '@/lib/firebase';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { ContentImage, ExtractedWidget } from '@/lib/types';
import { RichTextEditor } from '@/components/features/editor/rich-text-editor';
import { SeoAnalyzer } from '@/components/features/seo/seo-analyzer';
import { Checkbox } from '@/components/ui/checkbox';

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
  featuredImageUrl?: string | null;
  translations?: Record<string, number>;
}


function EditPageContent() {
  const params = useParams();
  const router = useRouter();
  const postId = Number(params.id);
    
  const [post, setPost] = useState<PostEditState | null>(null);
  const [contentImages, setContentImages] = useState<ContentImage[]>([]);
  
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isAiLoading, setIsAiLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { toast } = useToast();

  const [applyAiMetaToFeatured, setApplyAiMetaToFeatured] = useState(true);
  
  const [syncFullContent, setSyncFullContent] = useState(false);


  const fetchInitialData = useCallback(async () => {
    setIsLoading(true); setError(null);
    const user = auth.currentUser;
    if (!user) { setError('Authentication required.'); setIsLoading(false); return; }
    if (isNaN(postId)) { setError(`El ID del contenido no es válido.`); setIsLoading(false); return; }

    try {
      const token = await user.getIdToken();
      const apiPath = `/api/wordpress/pages/${postId}`; 
      
      const postResponse = await fetch(`${apiPath}?context=edit&bust=${new Date().getTime()}`, { headers: { 'Authorization': `Bearer ${token}` }, cache: 'no-store' });
      if (!postResponse.ok) throw new Error((await postResponse.json()).error || `Failed to fetch Page data.`);
      
      const postData = await postResponse.json();
      
      const loadedPost: PostEditState = {
        title: postData.title?.rendered,
        content: postData.content?.rendered || '',
        isElementor: postData.isElementor || false, 
        elementorEditLink: postData.elementorEditLink || null,
        adminEditLink: postData.adminEditLink,
        link: postData.link,
        postType: 'Page',
        lang: postData.lang || 'es',
        meta: {
            _yoast_wpseo_title: postData.meta?._yoast_wpseo_title || postData.title?.rendered || '',
            _yoast_wpseo_metadesc: postData.meta?._yoast_wpseo_metadesc || postData.excerpt?.rendered.replace(/<[^>]+>/g, '') || '',
            _yoast_wpseo_focuskw: postData.meta?._yoast_wpseo_focuskw || '',
        },
        featuredImageUrl: postData.featured_image_url || null,
        translations: postData.translations || {},
      };
      
      if (postData.isElementor && Array.isArray(postData.content.rendered)) {
          loadedPost.content = postData.content.rendered;
      }
      
      setPost(loadedPost);
      if (postData.scrapedImages && Array.isArray(postData.scrapedImages)) {
          setContentImages(postData.scrapedImages);
      } else {
          setContentImages([]);
      }

    } catch (e: any) { setError(e.message);
    } finally { setIsLoading(false); }
  }, [postId]);


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
            content: typeof post.content === 'string' ? post.content : undefined,
            meta: post.meta,
        };
        
        const response = await fetch(`/api/wordpress/pages/${postId}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
            body: JSON.stringify(payload)
        });

        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.error || 'Fallo al guardar los cambios');
        }
        
        toast({ title: '¡Página guardada!', description: 'El contenido de la página ha sido actualizado.' });

        if (syncFullContent && post.translations && Object.keys(post.translations).length > 1 && typeof post.content === 'string') {
            toast({ title: "Sincronizando contenido...", description: "Traduciendo y actualizando el contenido en las otras versiones. Esto puede tardar." });
            
            const syncPayload = {
                sourcePostId: postId,
                postType: 'Page',
                translations: post.translations,
                title: post.title,
                content: post.content,
            };
            
            fetch('/api/blog/sync-full-content', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
                body: JSON.stringify(syncPayload)
            }).then(async (syncResponse) => {
                const syncResult = await syncResponse.json();
                if (syncResponse.ok) {
                    toast({ title: "Sincronización de contenido completada", description: syncResult.message });
                } else {
                     toast({ title: "Error en la sincronización de contenido", description: syncResult.message || "No se pudo actualizar todas las traducciones.", variant: "destructive" });
                }
            });
        }
        
    } catch (e: any) {
        toast({ title: 'Error al Guardar', description: e.message, variant: 'destructive' });
    } finally {
        setIsSaving(false);
    }
  };


  if (isLoading) {
    return <div className="flex items-center justify-center min-h-[calc(100vh-8rem)] w-full"><Loader2 className="h-10 w-10 animate-spin text-primary" /></div>;
  }
  
  if (error || !post) {
     return <div className="container mx-auto py-8"><Alert variant="destructive"><AlertTitle>Error al Cargar</AlertTitle><AlertDescription>{error || `No se pudo cargar la información de la página.`}</AlertDescription></Alert></div>;
  }

  return (
    <>
      <div className="container mx-auto py-8 space-y-6">
          <Card>
              <CardHeader>
                  <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                      <div>
                          <CardTitle>Editor de Página</CardTitle>
                          <CardDescription>Editando: {post.title}</CardDescription>
                      </div>
                      <div className="flex flex-wrap gap-2">
                          <Button variant="outline" onClick={() => router.push('/pages')}>
                              <ArrowLeft className="mr-2 h-4 w-4" />
                              Volver a la lista
                          </Button>
                          <Button onClick={handleSaveChanges} disabled={isSaving}>
                            {isSaving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                             <Save className="mr-2 h-4 w-4" />
                            Guardar Cambios
                          </Button>
                      </div>
                  </div>
              </CardHeader>
          </Card>
          
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start">
            <div className="lg:col-span-2 space-y-6">
              <Card>
              <CardHeader><CardTitle>Contenido de la Página</CardTitle></CardHeader>
              <CardContent className="space-y-4">
                  <div>
                      <Label htmlFor="title">Título</Label>
                      <Input id="title" name="title" value={post.title} onChange={(e) => setPost(p => p ? {...p, title: e.target.value} : null)} />
                  </div>
                  {post.isElementor ? (
                    <div>
                      <Alert>
                          <AlertTitle>Página de Elementor Detectada</AlertTitle>
                          <AlertDescription className="space-y-2">
                              No puedes editar el contenido visual directamente aquí. Para ello, debes usar el editor de Elementor.
                              <Button asChild className="mt-3 block w-fit" size="sm">
                                  <Link href={post.elementorEditLink!} target="_blank" rel="noopener noreferrer">
                                      <Edit className="mr-2 h-4 w-4" />
                                      Abrir con Elementor
                                  </Link>
                              </Button>
                          </AlertDescription>
                      </Alert>
                    </div>
                  ) : typeof post.content === 'string' ? (
                  <div>
                      <Label htmlFor="content">Contenido</Label>
                      <RichTextEditor
                          content={post.content}
                          onChange={(newContent) => setPost(p => p ? { ...p, content: newContent } : null)}
                          onInsertImage={() => {}}
                          onSuggestLinks={() => {}}
                          placeholder="Escribe el contenido de tu página..."
                      />
                  </div>
                  ) : null}

                  {post.translations && Object.keys(post.translations).length > 1 && typeof post.content === 'string' && (
                    <div className="flex items-start space-x-2 pt-4 border-t">
                        <Checkbox id="sync-full-content" checked={syncFullContent} onCheckedChange={(checked) => setSyncFullContent(!!checked)} />
                        <div className="grid gap-1.5 leading-none">
                            <Label htmlFor="sync-full-content" className="font-normal text-sm cursor-pointer">
                                Sincronizar y sobrescribir contenido en todas las traducciones
                            </Label>
                            <p className="text-xs text-destructive">
                                ¡Atención! Esto reemplazará el título y el contenido de todas las traducciones con una nueva versión traducida de esta página. Esta opción no está disponible para páginas de Elementor.
                            </p>
                        </div>
                    </div>
                  )}
              </CardContent>
              </Card>
            </div>
            <div className="lg:col-span-1 space-y-6">
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
            </div>
          </div>
      </div>
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
