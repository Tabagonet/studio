
"use client";

import React, { useEffect, useState, Suspense, useCallback } from 'react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Loader2, ArrowLeft, Save, ExternalLink } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { auth } from '@/lib/firebase';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { SeoAnalyzer } from '@/components/features/seo/seo-analyzer';
import { ContentImage, ExtractedWidget } from '@/lib/types';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogHeader, AlertDialogTitle, AlertDialogDescription, AlertDialogFooter } from '@/components/ui/alert-dialog';
import { GoogleSnippetPreview } from '@/components/features/blog/google-snippet-preview';
import { Badge } from '@/components/ui/badge';
import { RichTextEditor } from '@/components/features/editor/rich-text-editor';


interface PostEditState {
  title: string;
  content: string | ExtractedWidget[]; 
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


function EditPageContent() {
  const params = useParams();
  const router = useRouter();
  const searchParams = useSearchParams();

  const postId = Number(params.id);
  const postType = searchParams.get('type') || 'Post';
    
  const [post, setPost] = useState<PostEditState | null>(null);
  const [contentImages, setContentImages] = useState<ContentImage[]>([]);
  const [initialContentImages, setInitialContentImages] = useState<ContentImage[]>([]);
  const [applyAiMetaToFeatured, setApplyAiMetaToFeatured] = useState(false);
  
  const [isAiLoading, setIsAiLoading] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);

  const [error, setError] = useState<string | null>(null);
  const { toast } = useToast();
  
  const [isImageDialogOpen, setIsImageDialogOpen] = useState(false);
  const [imageUrl, setImageUrl] = useState('');
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [isUploadingImage, setIsUploadingImage] = useState(false);

  const handleContentChange = (newContent: string) => {
    if (!post || typeof post.content !== 'string') return;
    setPost({ ...post, content: newContent });
  };
  
  const handleInsertImage = async () => {
      let finalImageUrl = imageUrl;
      if (imageFile) {
          setIsUploadingImage(true);
          try {
              const user = auth.currentUser; if (!user) throw new Error("No autenticado.");
              const token = await user.getIdToken();
              const formData = new FormData(); formData.append('imagen', imageFile);
              const response = await fetch('/api/upload-image', { method: 'POST', headers: { 'Authorization': `Bearer ${token}` }, body: formData });
              if (!response.ok) throw new Error((await response.json()).error || 'Fallo en la subida de imagen.');
              finalImageUrl = (await response.json()).url;
          } catch (err: any) {
              toast({ title: 'Error al subir imagen', description: err.message, variant: 'destructive' });
              setIsUploadingImage(false); return;
          } finally { setIsUploadingImage(false); }
      }
      if (!finalImageUrl) {
          toast({ title: 'Falta la imagen', description: 'Por favor, sube un archivo o introduce una URL.', variant: 'destructive' }); return;
      }

      const imgTag = `<img src="${finalImageUrl}" alt="${post?.title || 'Imagen insertada'}" loading="lazy" style="max-width: 100%; height: auto; border-radius: 8px;" />`;
      if (post && typeof post.content === 'string') {
        setPost({ ...post, content: post.content + `\n${imgTag}` });
      }

      setImageUrl(''); setImageFile(null); setIsImageDialogOpen(false);
  };
  
  const fetchInitialData = useCallback(async () => {
    setIsLoading(true); setError(null);
    const user = auth.currentUser;
    if (!user) { setError('Authentication required.'); setIsLoading(false); return; }
    if (isNaN(postId) || !postType) { setError(`El ID o el tipo del contenido no es válido.`); setIsLoading(false); return; }

    try {
      const token = await user.getIdToken();
      
      let apiPath: string;
      if (postType === 'Post') {
          apiPath = `/api/wordpress/posts/${postId}`;
      } else if (postType === 'Page') {
          apiPath = `/api/wordpress/pages/${postId}`;
      } else if (postType === 'Producto') {
          apiPath = `/api/wordpress/products/${postId}`;
      } else {
          throw new Error(`Tipo de contenido no soportado: ${postType}`);
      }

      const postResponse = await fetch(`${apiPath}?context=edit&bust=${new Date().getTime()}`, { headers: { 'Authorization': `Bearer ${token}` }, cache: 'no-store' });
      if (!postResponse.ok) throw new Error((await postResponse.json()).error || `Failed to fetch ${postType} data.`);
      
      const postData = await postResponse.json();
      
      const loadedPost: PostEditState = {
        title: postData.title.rendered || '', content: postData.content.rendered,
        meta: {
            _yoast_wpseo_title: (typeof postData.meta?._yoast_wpseo_title === 'string') ? postData.meta._yoast_wpseo_title : '',
            _yoast_wpseo_metadesc: postData.meta?._yoast_wpseo_metadesc || '',
            _yoast_wpseo_focuskw: postData.meta?._yoast_wpseo_focuskw || '',
        },
        isElementor: postData.isElementor || false, elementorEditLink: postData.elementorEditLink || null,
        adminEditLink: postData.adminEditLink || null, featuredImageUrl: postData.featured_image_url || null,
        featuredMediaId: postData.featured_media || null, link: postData.link,
      };

      try {
        const historyResponse = await fetch(`/api/seo/history?url=${encodeURIComponent(postData.link)}`, { headers: { 'Authorization': `Bearer ${token}` }, cache: 'no-store' });
        if (historyResponse.ok) {
            const historyData: { history: any[] } = await historyResponse.json();
            if (historyData.history && historyData.history.length > 0) {
                const latestAnalysis = historyData.history[0].analysis;
                if (!loadedPost.meta._yoast_wpseo_title && latestAnalysis.aiAnalysis.suggested?.title) loadedPost.meta._yoast_wpseo_title = latestAnalysis.aiAnalysis.suggested.title;
                if (!loadedPost.meta._yoast_wpseo_metadesc && latestAnalysis.aiAnalysis.suggested?.metaDescription) loadedPost.meta._yoast_wpseo_metadesc = latestAnalysis.aiAnalysis.suggested.metaDescription;
                if (!loadedPost.meta._yoast_wpseo_focuskw && latestAnalysis.aiAnalysis.suggested?.focusKeyword) loadedPost.meta._yoast_wpseo_focuskw = latestAnalysis.aiAnalysis.suggested.focusKeyword;
            }
        }
      } catch (historyError) { console.warn("Could not fetch SEO history for suggestions:", historyError); }
      
      setPost(loadedPost);
      
      if (postData.scrapedImages && Array.isArray(postData.scrapedImages)) {
          setContentImages(postData.scrapedImages);
          setInitialContentImages(postData.scrapedImages);
      } else {
          setContentImages([]);
          setInitialContentImages([]);
      }

    } catch (e: any) { setError(e.message);
    } finally { setIsLoading(false); }
  }, [postId, postType, toast]);


  useEffect(() => { fetchInitialData(); }, [fetchInitialData]);
  
  const handleMetaChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    if (!post) return;
    const { name, value } = e.target;
    setPost(prev => prev ? { ...prev, meta: { ...prev.meta, [name]: value } } : null);
  };

  const handleSaveChanges = async () => {
    setIsSaving(true);
    const user = auth.currentUser;
    if (!user || !post) {
      toast({ title: 'Error', description: 'No se puede guardar.', variant: 'destructive' });
      setIsSaving(false); return;
    }

    try {
        const token = await user.getIdToken();
        const payload: any = { title: post.title, meta: post.meta };

        if (typeof post.content === 'string') {
            payload.content = post.content;
        }
        
        const altUpdates: { id: number, alt: string }[] = [];
        contentImages.forEach((currentImage) => {
            const initialImage = initialContentImages.find(img => img.mediaId === currentImage.mediaId);
            if (currentImage.mediaId && initialImage && currentImage.alt !== initialImage.alt) {
                altUpdates.push({ id: currentImage.mediaId, alt: currentImage.alt });
            }
        });

        if (altUpdates.length > 0) {
            payload.image_alt_updates = altUpdates;
        }
        
        if (applyAiMetaToFeatured && post.featuredMediaId && post.meta._yoast_wpseo_focuskw) {
             payload.featured_image_metadata = { title: post.title, alt_text: post.meta._yoast_wpseo_focuskw };
        }
        
        let apiPath: string;
        if (postType === 'Post') {
            apiPath = `/api/wordpress/posts/${postId}`;
        } else if (postType === 'Page') {
            apiPath = `/api/wordpress/pages/${postId}`;
        } else if (postType === 'Producto') {
            apiPath = `/api/wordpress/products/${postId}`;
        } else {
            throw new Error(`Unsupported post type for saving: ${postType}`);
        }

        const response = await fetch(apiPath, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
            body: JSON.stringify(payload)
        });
        if (!response.ok) throw new Error((await response.json()).error || 'Fallo al guardar.');
        toast({ title: '¡Éxito!', description: "Los cambios SEO, incluyendo el contenido y los textos 'alt' de las imágenes, han sido guardados." });
    } catch (e: any) {
        toast({ title: 'Error al Guardar', description: e.message, variant: "destructive" });
    } finally { setIsSaving(false); }
  };


  if (isLoading) {
    return <div className="flex items-center justify-center min-h-[calc(100vh-8rem)] w-full"><Loader2 className="h-10 w-10 animate-spin text-primary" /></div>;
  }
  
  if (error || !post) {
     return <div className="container mx-auto py-8"><Alert variant="destructive"><AlertTitle>Error al Cargar</AlertTitle><AlertDescription>{error || `No se pudo cargar la información del ${postType || 'contenido'}.`}</AlertDescription></Alert></div>;
  }

  const isElementorContent = Array.isArray(post.content);
  const seoTitle = post.meta?._yoast_wpseo_title || '';
  const metaDescription = post.meta?._yoast_wpseo_metadesc || '';

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
                            {isSaving ? <Loader2 className="mr-2 h-4 w-4 animate-spin"/> : <Save className="mr-2 h-4 w-4" /> } Guardar Cambios SEO
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
            />
            
            {isElementorContent ? (
                <Card>
                    <CardHeader>
                        <CardTitle>Contenido de Elementor (Vista de Análisis)</CardTitle>
                        <CardDescription>A continuación se muestra un desglose de los encabezados de tu página. Para editar el texto, debes usar el editor de Elementor.</CardDescription>
                    </CardHeader>
                    <CardContent>
                        {post.elementorEditLink && (
                           <Button asChild className="mb-4">
                                <Link href={post.elementorEditLink} target="_blank" rel="noopener noreferrer">
                                    <ExternalLink className="mr-2 h-4 w-4" />
                                    Abrir con Elementor
                                </Link>
                            </Button>
                        )}
                        <div className="space-y-3 rounded-md border p-4 max-h-96 overflow-y-auto">
                            {(post.content as ExtractedWidget[]).length > 0 ? 
                                (post.content as ExtractedWidget[]).map(widget => (
                                    <div key={widget.id} className="flex items-start gap-3">
                                        <Badge variant="secondary" className="font-bold mt-1">{widget.tag?.toUpperCase()}</Badge>
                                        <p className="text-muted-foreground">{widget.text}</p>
                                    </div>
                                ))
                                : <p className="text-sm text-muted-foreground text-center">No se encontraron encabezados en el contenido de Elementor.</p>
                            }
                        </div>
                    </CardContent>
                </Card>
            ) : (
             <Card>
                <CardHeader>
                    <CardTitle>Contenido Principal</CardTitle>
                    <CardDescription>Edita el contenido de la página para añadir palabras clave, mejorar la estructura y aplicar otras sugerencias de SEO.</CardDescription>
                </CardHeader>
                <CardContent>
                    <Label htmlFor="content">Editor de Contenido</Label>
                    <RichTextEditor
                      content={post.content as string}
                      onChange={handleContentChange}
                      onInsertImage={() => setIsImageDialogOpen(true)}
                      placeholder="El contenido de tu página o entrada..."
                    />
                </CardContent>
            </Card>
          )}
          </div>
          
          <div className="sticky top-20 space-y-6">
             <Card>
                <CardHeader>
                  <CardTitle>Edición SEO (Yoast)</CardTitle>
                  <CardDescription>Modifica los campos que Yoast utiliza para los resultados de búsqueda.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                    <div className="space-y-1">
                        <Label htmlFor="yoastFocusKw">Palabra Clave Principal</Label>
                        <Input id="yoastFocusKw" name="_yoast_wpseo_focuskw" value={post.meta._yoast_wpseo_focuskw || ''} onChange={handleMetaChange} />
                    </div>
                    <div className="space-y-1">
                        <Label htmlFor="yoastTitle">Título SEO</Label>
                        <Input id="yoastTitle" name="_yoast_wpseo_title" value={seoTitle} onChange={handleMetaChange} />
                    </div>
                    <div className="space-y-1">
                        <Label htmlFor="metaDescription">Meta Descripción</Label>
                        <Textarea id="metaDescription" name="_yoast_wpseo_metadesc" value={metaDescription} onChange={handleMetaChange} maxLength={165} rows={3}/>
                    </div>
                </CardContent>
              </Card>
              <GoogleSnippetPreview title={seoTitle} description={metaDescription} url={post.link || null} />
          </div>
        </div>

        <AlertDialog open={isImageDialogOpen} onOpenChange={setIsImageDialogOpen}><AlertDialogContent><AlertDialogHeader><AlertDialogTitle>Insertar Imagen</AlertDialogTitle><AlertDialogDescription>Sube una imagen o introduce una URL para insertarla en el contenido.</AlertDialogDescription></AlertDialogHeader><div className="space-y-4"><div><Label htmlFor="image-upload">Subir archivo</Label><Input id="image-upload" type="file" accept="image/*" onChange={(e) => setImageFile(e.target.files?.[0] || null)} /></div><div className="relative"><div className="absolute inset-0 flex items-center"><span className="w-full border-t" /></div><div className="relative flex justify-center text-xs uppercase"><span className="bg-background px-2 text-muted-foreground">O</span></div></div><div><Label htmlFor="image-url">Insertar desde URL</Label><Input id="image-url" value={imageUrl} onChange={(e) => setImageUrl(e.target.value)} placeholder="https://ejemplo.com/imagen.jpg" /></div></div><AlertDialogFooter><AlertDialogCancel onClick={() => { setImageUrl(''); setImageFile(null); }}>Cancelar</AlertDialogCancel><AlertDialogAction onClick={handleInsertImage} disabled={isUploadingImage}>{isUploadingImage && <Loader2 className="mr-2 h-4 w-4 animate-spin" />} Insertar Imagen</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog>
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
