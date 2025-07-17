

"use client";

import React, { useEffect, useState, Suspense, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Loader2, ArrowLeft, Replace, ImageIcon } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { auth } from '@/lib/firebase';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { ContentImage, ExtractedWidget } from '@/lib/types';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogHeader, AlertDialogTitle, AlertDialogDescription, AlertDialogFooter } from '@/components/ui/alert-dialog';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import NextImage from 'next/image';


interface PageEditState {
  title: string;
  content: string | ExtractedWidget[]; 
  isElementor: boolean;
  elementorEditLink: string | null;
  link?: string;
  postType: 'Post' | 'Page' | 'Producto';
  lang: string;
}

interface ReplaceImageDialogState {
    open: boolean;
    oldImageSrc: string | null;
    newImageFile: File | null;
    originalWidth: number | string;
    originalHeight: number | string;
    mediaIdToDelete: number | null;
}

function EditPageContent() {
  const params = useParams();
  const router = useRouter();
  const postId = Number(params.id);
  const postType = 'Page'; 
    
  const [post, setPost] = useState<PageEditState | null>(null);
  const [contentImages, setContentImages] = useState<ContentImage[]>([]);
  
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const { toast } = useToast();

  const [replaceDialogState, setReplaceDialogState] = useState<ReplaceImageDialogState>({ open: false, oldImageSrc: null, newImageFile: null, originalWidth: '', originalHeight: '', mediaIdToDelete: null });
  const [isReplacing, setIsReplacing] = useState(false);
  
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
      } else {
          setContentImages([]);
      }

    } catch (e: any) { setError(e.message);
    } finally { setIsLoading(false); }
  }, [postId]);


  useEffect(() => { fetchInitialData(); }, [fetchInitialData]);
  
  const handleReplaceImage = async () => {
    const { oldImageSrc, newImageFile, originalWidth, originalHeight, mediaIdToDelete } = replaceDialogState;
    if (!post || !oldImageSrc || !newImageFile) {
      toast({ title: 'Error', description: 'Faltan datos para reemplazar la imagen.', variant: 'destructive' });
      return;
    }
    setIsReplacing(true);
    try {
        const user = auth.currentUser;
        if (!user) throw new Error("No autenticado.");
        const token = await user.getIdToken();
        const formData = new FormData();
        formData.append('newImageFile', newImageFile);
        formData.append('postId', postId.toString());
        formData.append('postType', post.postType);
        formData.append('oldImageUrl', oldImageSrc);
        if (originalWidth) formData.append('width', String(originalWidth));
        if (originalHeight) formData.append('height', String(originalHeight));
        if (mediaIdToDelete) formData.append('mediaIdToDelete', String(mediaIdToDelete));
        
        const response = await fetch('/api/wordpress/replace-image', {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${token}` },
            body: formData,
        });
        
        const result = await response.json();
        if (!response.ok) throw new Error(result.error || 'Fallo en la API de reemplazo de imagen.');
        
        setPost(p => p ? { ...p, content: result.newContent } : null);
        setContentImages(prev => prev.map(img => img.src === oldImageSrc ? { ...img, src: result.newImageUrl, alt: result.newImageAlt } : img));
        toast({ title: 'Imagen Reemplazada', description: 'La imagen ha sido actualizada y la antigua ha sido eliminada.' });
        setReplaceDialogState({ open: false, oldImageSrc: null, newImageFile: null, originalWidth: '', originalHeight: '', mediaIdToDelete: null });
    } catch (error: any) {
        toast({ title: 'Error al reemplazar', description: error.message, variant: 'destructive' });
    } finally {
        setIsReplacing(false);
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
                          <CardTitle>Editor de Imágenes de Página</CardTitle>
                          <CardDescription>Reemplaza las imágenes de: {post.title}</CardDescription>
                      </div>
                      <div className="flex flex-wrap gap-2">
                          <Button variant="outline" onClick={() => router.back()}>
                              <ArrowLeft className="mr-2 h-4 w-4" /> Volver
                          </Button>
                      </div>
                  </div>
              </CardHeader>
          </Card>
          
          <Card>
              <CardHeader>
                  <CardTitle className="flex items-center gap-2"><ImageIcon className="h-5 w-5 text-primary" />Imágenes en el Contenido</CardTitle>
                  <CardDescription>Esta es una lista de todas las imágenes encontradas en esta página. Puedes reemplazarlas una por una.</CardDescription>
              </CardHeader>
              <CardContent>
                  {contentImages.length > 0 ? (
                      <div className="space-y-3">
                          {contentImages.map((img) => (
                              <div key={img.id} className="flex items-center gap-4 p-3 border rounded-lg bg-muted/30">
                                  <div className="relative h-16 w-16 flex-shrink-0">
                                      <NextImage src={img.src} alt={img.alt || 'Vista previa'} fill className="rounded-md object-cover" sizes="64px" />
                                  </div>
                                  <div className="flex-grow min-w-0">
                                      <p className="text-sm font-medium text-foreground truncate" title={img.src}>...{img.src.slice(-50)}</p>
                                      <p className="text-xs text-muted-foreground">Alt: <span className="italic">{img.alt || "(vacío)"}</span></p>
                                      {img.width && img.height && (
                                        <p className="text-xs text-muted-foreground">Tamaño: <span className="font-semibold">{img.width} x {img.height}px</span></p>
                                      )}
                                  </div>
                                  <Button 
                                      size="sm"
                                      variant="outline"
                                      onClick={() => setReplaceDialogState({ open: true, oldImageSrc: img.src, newImageFile: null, originalWidth: img.width || '', originalHeight: img.height || '', mediaIdToDelete: img.mediaId })}
                                  >
                                      <Replace className="mr-2 h-4 w-4" />
                                      Reemplazar
                                  </Button>
                              </div>
                          ))}
                      </div>
                  ) : (
                      <p className="text-center text-muted-foreground py-8">No se encontraron imágenes en el contenido de esta página.</p>
                  )}
              </CardContent>
          </Card>
      </div>

       <AlertDialog open={replaceDialogState.open} onOpenChange={(open) => !isReplacing && setReplaceDialogState({ open: false, oldImageSrc: null, newImageFile: null, originalWidth: '', originalHeight: '', mediaIdToDelete: null })}>
        <AlertDialogContent className="sm:max-w-md">
          <AlertDialogHeader>
            <AlertDialogTitle>Reemplazar Imagen</AlertDialogTitle>
            <AlertDialogDescription>
                Sube una nueva imagen para reemplazar la actual. La antigua será eliminada de la biblioteca de medios.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="py-4 space-y-4">
            <div>
              <Label htmlFor="new-image-upload">Nueva Imagen</Label>
              <Input id="new-image-upload" type="file" accept="image/*" onChange={(e) => setReplaceDialogState(s => ({ ...s, newImageFile: e.target.files?.[0] || null }))} disabled={isReplacing} />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="img-width">Ancho (px)</Label>
                <Input id="img-width" type="number" value={replaceDialogState.originalWidth} onChange={(e) => setReplaceDialogState(s => ({ ...s, originalWidth: e.target.value }))} placeholder="Auto" disabled={isReplacing}/>
              </div>
              <div>
                <Label htmlFor="img-height">Alto (px)</Label>
                <Input id="img-height" type="number" value={replaceDialogState.originalHeight} onChange={(e) => setReplaceDialogState(s => ({ ...s, originalHeight: e.target.value }))} placeholder="Auto" disabled={isReplacing}/>
              </div>
            </div>
             <p className="text-xs text-muted-foreground">La nueva imagen se recortará a estas dimensiones. Déjalos en blanco para un redimensionamiento automático.</p>
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isReplacing}>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleReplaceImage} disabled={isReplacing || !replaceDialogState.newImageFile}>
              {isReplacing && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {isReplacing ? 'Procesando...' : 'Reemplazar'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
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

