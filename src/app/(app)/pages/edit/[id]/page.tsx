
"use client";

import React, { useEffect, useState, Suspense, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Loader2, ArrowLeft, Save, ExternalLink } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { auth } from '@/lib/firebase';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { SeoAnalyzer } from '@/components/features/seo/seo-analyzer';
import { ContentImage, ExtractedWidget } from '@/lib/types';
import { RichTextEditor } from '@/components/features/editor/rich-text-editor';


interface PageEditState {
  title: string;
  content: string | ExtractedWidget[]; 
  isElementor: boolean;
  elementorEditLink: string | null;
  link?: string;
  postType: 'Post' | 'Page' | 'Producto';
  lang: string;
}

function EditPageContent() {
  const params = useParams();
  const router = useRouter();
  const postId = Number(params.id);
  const postType = 'Page'; // This page is specifically for pages
    
  const [post, setPost] = useState<PageEditState | null>(null);
  const [contentImages, setContentImages] = useState<ContentImage[]>([]);
  const [initialContentImages, setInitialContentImages] = useState<ContentImage[]>([]);
  
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { toast } = useToast();

  const handleContentChange = (newContent: string) => {
    if (!post || typeof post.content !== 'string') return;
    setPost({ ...post, content: newContent });
  };
  
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
      
      const loadedPost: PageEditState = {
        title: postData.title?.rendered,
        content: postData.content?.rendered || '',
        isElementor: postData.isElementor || false, 
        elementorEditLink: postData.elementorEditLink || null,
        link: postData.link,
        postType: 'Page',
        lang: postData.lang || 'es',
      };
      
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
  }, [postId, toast]);


  useEffect(() => { fetchInitialData(); }, [fetchInitialData]);
  
  const handleSaveChanges = async () => {
    setIsSaving(true);
    const user = auth.currentUser;
    if (!user || !post) {
      toast({ title: 'Error', description: 'No se puede guardar.', variant: 'destructive' });
      setIsSaving(false); return;
    }

    try {
        const token = await user.getIdToken();
        const payload: any = { title: post.title };

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
        if (altUpdates.length > 0) payload.image_alt_updates = altUpdates;
        
        const apiPath = `/api/wordpress/pages/${postId}`;
        const response = await fetch(apiPath, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
            body: JSON.stringify(payload)
        });
        if (!response.ok) throw new Error((await response.json()).error || 'Fallo al guardar.');
        toast({ title: '¡Éxito!', description: "Los cambios han sido guardados." });
    } catch (e: any) {
        toast({ title: 'Error al Guardar', description: e.message, variant: "destructive" });
    } finally { setIsSaving(false); }
  };


  if (isLoading) {
    return <div className="flex items-center justify-center min-h-[calc(100vh-8rem)] w-full"><Loader2 className="h-10 w-10 animate-spin text-primary" /></div>;
  }
  
  if (error || !post) {
     return <div className="container mx-auto py-8"><Alert variant="destructive"><AlertTitle>Error al Cargar</AlertTitle><AlertDescription>{error || `No se pudo cargar la información de la página.`}</AlertDescription></Alert></div>;
  }

  const isElementorContent = Array.isArray(post.content);

  return (
    <div className="container mx-auto py-8 space-y-6">
        <Card>
            <CardHeader>
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                    <div>
                        <CardTitle>Editor de Contenido de Página</CardTitle>
                        <CardDescription>Editando: {post.title}</CardDescription>
                    </div>
                    <div className="flex flex-wrap gap-2">
                        <Button variant="outline" onClick={() => router.push('/pages')}>
                            <ArrowLeft className="mr-2 h-4 w-4" /> Volver
                        </Button>
                         <Button onClick={handleSaveChanges} disabled={isSaving}>
                            {isSaving ? <Loader2 className="mr-2 h-4 w-4 animate-spin"/> : <Save className="mr-2 h-4 w-4" /> } Guardar Cambios
                        </Button>
                    </div>
                </div>
            </CardHeader>
        </Card>
        
        {isElementorContent ? (
            <Card>
                <CardHeader>
                    <CardTitle>Contenido de Elementor</CardTitle>
                    <CardDescription>El contenido de esta página está gestionado por Elementor. Para editar el texto y la maquetación, debes usar su propio editor.</CardDescription>
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
                </CardContent>
            </Card>
        ) : (
         <Card>
            <CardHeader>
                <CardTitle>Contenido Principal</CardTitle>
            </CardHeader>
            <CardContent>
                <RichTextEditor
                  content={post.content as string}
                  onChange={handleContentChange}
                  onInsertImage={() => {}} // This feature is not needed on this simple editor
                  placeholder="El contenido de tu página o entrada..."
                />
            </CardContent>
        </Card>
      )}
    </div>
  );
}

export default function EditPage() {
    return (
        <Suspense fallback={<div className="flex items-center justify-center min-h-[calc(100vh-8rem)] w-full"><Loader2 className="h-10 w-10 animate-spin text-primary" /></div>}>
            <EditPageContent />
        </Suspense>
    )
}
