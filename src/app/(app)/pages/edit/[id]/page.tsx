

"use client";

import React, { useEffect, useState, Suspense, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { Button, buttonVariants } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Loader2, ArrowLeft, Save, Edit, Replace, ImageIcon, Crop, AlertTriangle } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { auth } from '@/lib/firebase';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { ContentImage, ExtractedWidget } from '@/lib/types';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogHeader, AlertDialogTitle, AlertDialogDescription, AlertDialogFooter } from '@/components/ui/alert-dialog';
import NextImage from 'next/image';
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Checkbox } from '@/components/ui/checkbox';
import { RichTextEditor } from '@/components/features/editor/rich-text-editor';
import { LinkSuggestionsDialog } from '@/components/features/editor/link-suggestions-dialog';
import type { LinkSuggestion, SuggestLinksOutput } from '@/ai/schemas';
import { SeoAnalyzer } from '@/components/features/seo/seo-analyzer';


interface PageEditState {
  title: string;
  content: string | ExtractedWidget[]; 
  isElementor: boolean;
  elementorEditLink: string | null;
  link?: string;
  postType: 'Post' | 'Page' | 'Producto';
  lang: string;
  meta: {
      _yoast_wpseo_title: string;
      _yoast_wpseo_metadesc: string;
      _yoast_wpseo_focuskw: string;
  };
  featuredImageUrl?: string | null;
}

interface ReplaceImageDialogState {
    open: boolean;
    oldImageSrc: string | null;
    newImageFile: File | null;
    originalWidth: number | string;
    originalHeight: number | string;
    mediaIdToDelete: number | null;
    cropPosition: "center" | "top" | "bottom" | "left" | "right";
    isCropEnabled: boolean;
}

function EditPageContent() {
  const params = useParams();
  const router = useRouter();
  const postId = Number(params.id);
    
  const [post, setPost] = useState<PageEditState | null>(null);
  const [contentImages, setContentImages] = useState<ContentImage[]>([]);
  
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isAiLoading, setIsAiLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { toast } = useToast();

  const [replaceDialogState, setReplaceDialogState] = useState<ReplaceImageDialogState>({ open: false, oldImageSrc: null, newImageFile: null, originalWidth: '', originalHeight: '', mediaIdToDelete: null, cropPosition: 'center', isCropEnabled: true });
  const [isReplacing, setIsReplacing] = useState(false);
  const [isSuggestingLinks, setIsSuggestingLinks] = useState(false);
  const [linkSuggestions, setLinkSuggestions] = useState<LinkSuggestion[]>([]);
  const [applyAiMetaToFeatured, setApplyAiMetaToFeatured] = useState(true);
  
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
        meta: {
            _yoast_wpseo_title: postData.meta?._yoast_wpseo_title || postData.title?.rendered || '',
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
        
    } catch (e: any) {
        toast({ title: 'Error al Guardar', description: e.message, variant: 'destructive' });
    } finally {
        setIsSaving(false);
    }
  };
  
  const handleReplaceImage = async () => {
    const { oldImageSrc, newImageFile, originalWidth, originalHeight, mediaIdToDelete, cropPosition, isCropEnabled } = replaceDialogState;
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
        if (isCropEnabled && originalWidth) formData.append('width', String(originalWidth));
        if (isCropEnabled && originalHeight) formData.append('height', String(originalHeight));
        if (isCropEnabled) formData.append('cropPosition', cropPosition);
        
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
        setReplaceDialogState({ open: false, oldImageSrc: null, newImageFile: null, originalWidth: '', originalHeight: '', mediaIdToDelete: null, cropPosition: 'center', isCropEnabled: true });
    } catch (error: any) {
        toast({ title: 'Error al reemplazar', description: error.message, variant: 'destructive' });
    } finally {
        setIsReplacing(false);
    }
  };

  const handleSuggestLinks = async () => {
    if (!post || typeof post.content !== 'string' || !post.content.trim()) {
        toast({ title: "Contenido vacío", description: "Escribe algo antes de pedir sugerencias de enlaces.", variant: "destructive" });
        return;
    }
    setIsSuggestingLinks(true);
    try {
        const user = auth.currentUser;
        if (!user) throw new Error("No autenticado.");
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
     let updatedContent = post.content as string;
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
                              <ArrowLeft className="mr-2 h-4 w-4" /> Volver a la lista
                          </Button>
                          <Button onClick={handleSaveChanges} disabled={isSaving || isSuggestingLinks}>
                            {isSaving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                             <Save className="mr-2 h-4 w-4" />
                            Guardar Cambios
                          </Button>
                      </div>
                  </div>
              </CardHeader>
          </Card>
          
          <div className="space-y-6">
            <Card>
            <CardHeader><CardTitle>Contenido de la Página</CardTitle></CardHeader>
            <CardContent className="space-y-4">
                <div>
                    <Label htmlFor="title">Título</Label>
                    <Input id="title" name="title" value={post.title} onChange={(e) => setPost(p => p ? {...p, title: e.target.value} : null)} />
                </div>
                {post.isElementor ? (
                    <Alert>
                        <AlertTriangle className="h-4 w-4" />
                        <AlertTitle>Página de Elementor Detectada</AlertTitle>
                        <AlertDescription>
                            Para editar el contenido visual de esta página, debes usar el editor de Elementor. Editar el contenido HTML aquí podría romper el diseño.
                            <Button asChild className="mt-3 block w-fit" size="sm">
                                <Link href={post.elementorEditLink!} target="_blank" rel="noopener noreferrer">
                                    <Edit className="mr-2 h-4 w-4" />
                                    Abrir con Elementor
                                </Link>
                            </Button>
                        </AlertDescription>
                    </Alert>
                ) : typeof post.content === 'string' ? (
                <div>
                    <Label htmlFor="content">Contenido</Label>
                    <RichTextEditor
                        content={post.content}
                        onChange={(newContent) => setPost(p => p ? { ...p, content: newContent } : null)}
                        onInsertImage={() => {}}
                        onSuggestLinks={handleSuggestLinks}
                        placeholder="Escribe el contenido de tu página..."
                    />
                </div>
                ) : null}
            </CardContent>
            </Card>
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

       <AlertDialog open={replaceDialogState.open} onOpenChange={(open) => !isReplacing && setReplaceDialogState({ open: false, oldImageSrc: null, newImageFile: null, originalWidth: '', originalHeight: '', mediaIdToDelete: null, cropPosition: 'center', isCropEnabled: true })}>
        <AlertDialogContent>
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
            
            <div className="space-y-3 pt-4 border-t">
                <div className="flex items-center space-x-2">
                    <Checkbox id="enable-crop" checked={replaceDialogState.isCropEnabled} onCheckedChange={(checked) => setReplaceDialogState(s => ({ ...s, isCropEnabled: !!checked }))} disabled={isReplacing}/>
                    <Label htmlFor="enable-crop" className="flex items-center gap-2 font-semibold cursor-pointer"><Crop className="h-4 w-4"/>Recortar imagen a las dimensiones originales</Label>
                </div>
                 <p className="text-xs text-muted-foreground mt-1 pl-6">Si se desactiva, la imagen se subirá con sus dimensiones originales, solo se aplicará compresión.</p>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label htmlFor="img-width">Ancho (px)</Label>
                    <Input id="img-width" type="number" value={replaceDialogState.originalWidth} onChange={(e) => setReplaceDialogState(s => ({ ...s, originalWidth: e.target.value }))} placeholder="Auto" disabled={isReplacing || !replaceDialogState.isCropEnabled}/>
                  </div>
                  <div>
                    <Label htmlFor="img-height">Alto (px)</Label>
                    <Input id="img-height" type="number" value={replaceDialogState.originalHeight} onChange={(e) => setReplaceDialogState(s => ({ ...s, originalHeight: e.target.value }))} placeholder="Auto" disabled={isReplacing || !replaceDialogState.isCropEnabled}/>
                  </div>
                </div>
                 <p className="text-xs text-muted-foreground mt-1">La nueva imagen se recortará a estas dimensiones. Déjalos en blanco para usar las dimensiones de la imagen antigua.</p>
            </div>
             <div className="space-y-2">
                <Label>Enfoque del Recorte</Label>
                 <RadioGroup defaultValue="center" value={replaceDialogState.cropPosition} onValueChange={(value) => setReplaceDialogState(s => ({ ...s, cropPosition: value as any }))} className="flex flex-wrap gap-x-4 gap-y-2" disabled={isReplacing || !replaceDialogState.isCropEnabled}>
                    <div className="flex items-center space-x-2"><RadioGroupItem value="center" id="crop-center" /><Label htmlFor="crop-center" className="font-normal">Centro</Label></div>
                    <div className="flex items-center space-x-2"><RadioGroupItem value="top" id="crop-top" /><Label htmlFor="crop-top" className="font-normal">Arriba</Label></div>
                    <div className="flex items-center space-x-2"><RadioGroupItem value="bottom" id="crop-bottom" /><Label htmlFor="crop-bottom" className="font-normal">Abajo</Label></div>
                    <div className="flex items-center space-x-2"><RadioGroupItem value="left" id="crop-left" /><Label htmlFor="crop-left" className="font-normal">Izquierda</Label></div>
                    <div className="flex items-center space-x-2"><RadioGroupItem value="right" id="crop-right" /><Label htmlFor="crop-right" className="font-normal">Derecha</Label></div>
                </RadioGroup>
            </div>
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => { if (!isReplacing) setReplaceDialogState({ ...replaceDialogState, open: false }) }} disabled={isReplacing}>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleReplaceImage} disabled={isReplacing || !replaceDialogState.newImageFile}>
              {isReplacing && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {isReplacing ? 'Procesando...' : 'Reemplazar'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
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

