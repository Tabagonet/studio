
"use client";

import React, { useEffect, useState, Suspense, useCallback, useRef } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import axios from 'axios';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Loader2, Sparkles, Wand2, Tags, ArrowLeft, ExternalLink, Image as ImageIcon, Link as LinkIcon, Trash2 } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { auth } from '@/lib/firebase';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import type { WordPressPostCategory, WordPressUser, ProductPhoto } from '@/lib/types';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { ContentToolbar } from '@/components/features/editor/content-toolbar';
import { ImageUploader } from '@/components/features/wizard/image-uploader';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogHeader, AlertDialogTitle, AlertDialogDescription, AlertDialogFooter, AlertDialogTrigger } from '@/components/ui/alert-dialog';


interface PostEditState {
  title: string;
  content: string; 
  status: 'publish' | 'draft' | 'pending' | 'future' | 'private';
  author: number | null;
  categories: number[];
  tags: string;
  featuredImage: ProductPhoto | null;
  featuredImageId: number | null; // Keep track of the original featured media ID
  isElementor: boolean;
  elementorEditLink: string | null;
  link: string;
}

function EditPageContent() {
  const params = useParams();
  const router = useRouter();
  const postId = Number(params.id);

  const [post, setPost] = useState<PostEditState | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isAiLoading, setIsAiLoading] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [allCategories, setAllCategories] = useState<WordPressPostCategory[]>([]);
  const [authors, setAuthors] = useState<WordPressUser[]>([]);

  const contentRef = useRef<HTMLTextAreaElement>(null);
  const [isLinkDialogOpen, setIsLinkDialogOpen] = useState(false);
  const [isImageDialogOpen, setIsImageDialogOpen] = useState(false);
  const [linkUrl, setLinkUrl] = useState('');
  const [imageUrl, setImageUrl] = useState('');
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [isUploadingImage, setIsUploadingImage] = useState(false);
  const selectionRef = useRef<{ start: number; end: number } | null>(null);

  const { toast } = useToast();

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    if (!post) return;
    setPost({ ...post, [e.target.name]: e.target.value });
  };
  
  // Handlers for ContentToolbar
  const handleInsertTag = (tag: 'h2' | 'ul' | 'ol' | 'strong' | 'em') => {
    const textarea = contentRef.current;
    if (!textarea || !post) return;
    
    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const selectedText = textarea.value.substring(start, end);
    let newText;

    if (tag === 'ul' || tag === 'ol') {
        const listItems = selectedText.split('\n').map(line => `  <li>${line}</li>`).join('\n');
        newText = `${textarea.value.substring(0, start)}<${tag}>\n${listItems}\n</${tag}>${textarea.value.substring(end)}`;
    } else {
        newText = `${textarea.value.substring(0, start)}<${tag}>${selectedText}</${tag}>${textarea.value.substring(end)}`;
    }
    
    setPost({ ...post, content: newText });
  };

  const handleAlignment = (align: 'left' | 'center' | 'right' | 'justify') => {
      const textarea = contentRef.current;
      if (!textarea || !post) return;

      const start = textarea.selectionStart;
      const end = textarea.selectionEnd;
      const selectedText = textarea.value.substring(start, end);

      if (!selectedText) {
          toast({ title: "Selecciona texto primero", description: "Debes seleccionar el párrafo al que quieres aplicar la alineación.", variant: "destructive" });
          return;
      }
      const newText = `${textarea.value.substring(0, start)}<p style="text-align: ${align};">${selectedText}</p>${textarea.value.substring(end)}`;
      setPost({ ...post, content: newText });
  };

  const openActionDialog = (action: 'link' | 'image') => {
      const textarea = contentRef.current;
      if (textarea) {
          selectionRef.current = { start: textarea.selectionStart, end: textarea.selectionEnd };
          if (action === 'link') setIsLinkDialogOpen(true);
          if (action === 'image') setIsImageDialogOpen(true);
      }
  };

  const handleInsertLink = () => {
      const textarea = contentRef.current;
      const selection = selectionRef.current;
      if (!textarea || !selection || !linkUrl || !post) return;
      const { start, end } = selection;
      const selectedText = textarea.value.substring(start, end);
      if (!selectedText) {
          toast({ title: 'Selecciona texto primero', description: 'Debes seleccionar el texto que quieres convertir en un enlace.', variant: 'destructive' });
          return;
      }
      const newText = `${textarea.value.substring(0, start)}<a href="${linkUrl}" target="_blank" rel="noopener noreferrer">${selectedText}</a>${textarea.value.substring(end)}`;
      setPost({ ...post, content: newText });
      setLinkUrl('');
      setIsLinkDialogOpen(false);
  };

  const handleInsertImage = async () => {
      let finalImageUrl = imageUrl;
      if (imageFile) {
          setIsUploadingImage(true);
          try {
              const user = auth.currentUser;
              if (!user) throw new Error("No autenticado.");
              const token = await user.getIdToken();
              const formData = new FormData();
              formData.append('imagen', imageFile);
              const response = await fetch('/api/upload-image', { method: 'POST', headers: { 'Authorization': `Bearer ${token}` }, body: formData });
              if (!response.ok) {
                  const errorData = await response.json();
                  throw new Error(errorData.error || 'Fallo en la subida de imagen.');
              }
              const imageData = await response.json();
              finalImageUrl = imageData.url;
          } catch (err: any) {
              toast({ title: 'Error al subir imagen', description: err.message, variant: 'destructive' });
              setIsUploadingImage(false);
              return;
          } finally {
              setIsUploadingImage(false);
          }
      }
      if (!finalImageUrl) {
          toast({ title: 'Falta la imagen', description: 'Por favor, sube un archivo o introduce una URL.', variant: 'destructive' });
          return;
      }
      const textarea = contentRef.current;
      const selection = selectionRef.current;
      if (!textarea || !selection || !post) return;
      const { start } = selection;
      const newText = `${textarea.value.substring(0, start)}\n<img src="${finalImageUrl}" alt="${post.title || 'Imagen insertada'}" loading="lazy" style="max-width: 100%; height: auto; border-radius: 8px;" />\n${textarea.value.substring(start)}`;
      setPost({ ...post, content: newText });
      setImageUrl('');
      setImageFile(null);
      setIsImageDialogOpen(false);
  };
  
    const handleAiGeneration = useCallback(async (mode: 'enhance_content' | 'suggest_keywords') => {
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
                setPost(prev => prev ? { ...prev, title: aiContent.title, content: aiContent.content } : null);
                toast({ title: "Contenido mejorado", description: "Se han actualizado el título y el contenido." });
            } else if (mode === 'suggest_keywords') {
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
            content: post.content,
            status: post.status,
            author: post.author,
            categories: post.categories,
            tags: post.tags,
        };
        
        // Handle featured image logic
        const newImage = post.featuredImage?.file ? post.featuredImage : null;
        if (newImage) {
            const formData = new FormData();
            formData.append('imagen', newImage.file!);
            const uploadResponse = await axios.post('/api/upload-image', formData, { headers: { 'Authorization': `Bearer ${token}` }});
            if (!uploadResponse.data.success) throw new Error('Failed to upload new featured image.');
            payload.featured_image_src = uploadResponse.data.url;
        } else if (!post.featuredImage) {
            // Image was removed
            payload.featured_media_id = 0;
        }
        
        const response = await fetch(`/api/wordpress/posts/${postId}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
            body: JSON.stringify(payload)
        });

        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.error || 'Fallo al guardar los cambios');
        }

        toast({ title: '¡Éxito!', description: `La entrada ha sido actualizada en WordPress.` });
        router.push('/blog');
        
    } catch (e: any) {
        toast({ title: 'Error al Guardar', description: e.message, variant: 'destructive' });
    } finally {
        setIsSaving(false);
    }
  };
  
  const handleDeletePost = async () => {
    setIsDeleting(true);
    const user = auth.currentUser;
    if (!user) {
        toast({ title: "No autenticado", variant: "destructive" });
        setIsDeleting(false);
        return;
    }

    try {
        const token = await user.getIdToken();
        const response = await fetch(`/api/wordpress/posts/${postId}`, {
            method: 'DELETE',
            headers: { 'Authorization': `Bearer ${token}` }
        });
        if (!response.ok) throw new Error('Failed to delete post.');
        toast({ title: "Entrada Eliminada", description: "La entrada ha sido eliminada permanentemente." });
        router.push('/blog');
    } catch (error: any) {
        toast({ title: "Error al Eliminar", description: error.message, variant: "destructive" });
    } finally {
        setIsDeleting(false);
    }
  }

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
        const [postResponse, categoriesResponse, authorsResponse] = await Promise.all([
          fetch(`/api/wordpress/posts/${postId}?context=edit`, { headers: { 'Authorization': `Bearer ${token}` }}),
          fetch('/api/wordpress/post-categories', { headers: { 'Authorization': `Bearer ${token}` }}),
          fetch('/api/wordpress/users', { headers: { 'Authorization': `Bearer ${token}` }})
        ]);

        if (!postResponse.ok) {
          throw new Error(`Failed to fetch post data: ${await postResponse.text()}`);
        }
        const postData = await postResponse.json();
        
        if (categoriesResponse.ok) setAllCategories(await categoriesResponse.json());
        if (authorsResponse.ok) setAuthors(await authorsResponse.json());
        
        setPost({
          title: postData.title.rendered || '',
          content: postData.content.rendered || '',
          status: postData.status || 'draft',
          author: postData.author || null,
          categories: postData.categories || [],
          tags: postData._embedded?.['wp:term']?.[1]?.map((t: any) => t.name).join(', ') || '',
          featuredImageId: postData.featured_media || null,
          featuredImage: postData.featured_image_url ? {
              id: postData.featured_media,
              previewUrl: postData.featured_image_url,
              name: 'Imagen destacada',
              status: 'completed',
              progress: 100,
          } : null,
          isElementor: postData.isElementor || false,
          elementorEditLink: postData.elementorEditLink || null,
          link: postData.link,
        });

      } catch (e: any) {
        setError(e.message);
      } finally {
        setIsLoading(false);
      }
    };
    if(postId) fetchInitialData();
  }, [postId]);
  

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
                        <CardTitle>Editor de Entradas</CardTitle>
                        <CardDescription>Editando: {post.title}</CardDescription>
                    </div>
                    <div className="flex flex-wrap gap-2">
                        <Button variant="outline" onClick={() => router.push('/blog')}>
                            <ArrowLeft className="mr-2 h-4 w-4" />
                            Volver a la lista
                        </Button>
                        <Button asChild variant="outline">
                           <Link href={post.link} target="_blank" rel="noopener noreferrer">
                                <ExternalLink className="mr-2 h-4 w-4" />
                                Vista Previa
                            </Link>
                        </Button>
                        <Button onClick={handleSaveChanges} disabled={isSaving}>
                            {isSaving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                            Guardar Cambios
                        </Button>
                    </div>
                </div>
            </CardHeader>
        </Card>

        {post.isElementor && (
          <Alert>
            <ExternalLink className="h-4 w-4" />
            <AlertTitle>Página de Elementor Detectada</AlertTitle>
            <AlertDescription>
                Para editar el contenido visual, debes usar el editor de Elementor. Esta herramienta te permite editar los metadatos y la organización.
            </AlertDescription>
            <Button asChild className="mt-4" size="sm">
                <Link href={post.elementorEditLink!} target="_blank" rel="noopener noreferrer">
                    <ExternalLink className="mr-2 h-4 w-4" />
                    Abrir con Elementor
                </Link>
            </Button>
        </Alert>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start">
          <div className="lg:col-span-2 space-y-6">
             <Card>
              <CardHeader><CardTitle>Contenido Principal</CardTitle></CardHeader>
              <CardContent className="space-y-4">
                <div>
                    <Label htmlFor="title">Título de la Entrada</Label>
                    <Input id="title" name="title" value={post.title} onChange={handleInputChange} />
                </div>
                {!post.isElementor && (
                  <div>
                      <Label htmlFor="content">Contenido</Label>
                      <ContentToolbar onInsertTag={handleInsertTag} onInsertLink={() => openActionDialog('link')} onInsertImage={() => openActionDialog('image')} onAlign={handleAlignment} />
                      <Textarea id="content" name="content" ref={contentRef} value={post.content} onChange={handleInputChange} rows={25} className="rounded-t-none" />
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
          
          <div className="space-y-6">
            <Card>
                <CardHeader>
                    <CardTitle>Asistente de IA</CardTitle>
                    <CardDescription>Utiliza la IA para mejorar tu contenido.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-2">
                    <Button onClick={() => handleAiGeneration('enhance_content')} disabled={isAiLoading || !post.content} className="w-full">
                        {isAiLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Wand2 className="mr-2 h-4 w-4" />}
                        Mejorar Contenido
                    </Button>
                    <Button onClick={() => handleAiGeneration('suggest_keywords')} disabled={isAiLoading || !post.content} className="w-full" variant="outline">
                        {isAiLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Tags className="mr-2 h-4 w-4" />}
                        Sugerir Etiquetas
                    </Button>
                </CardContent>
            </Card>
            <Card>
                <CardHeader><CardTitle>Publicación</CardTitle></CardHeader>
                <CardContent className="space-y-4">
                  <div><Label>Autor</Label><Select name="author" value={post.author?.toString() || ''} onValueChange={(v) => setPost(prev => prev ? {...prev, author: Number(v)} : null)}><SelectTrigger><SelectValue/></SelectTrigger><SelectContent>{authors.map(a => <SelectItem key={a.id} value={a.id.toString()}>{a.name}</SelectItem>)}</SelectContent></Select></div>
                  <div><Label>Estado</Label><Select name="status" value={post.status} onValueChange={(v) => setPost(prev => prev ? {...prev, status: v as any} : null)}><SelectTrigger><SelectValue/></SelectTrigger><SelectContent><SelectItem value="publish">Publicado</SelectItem><SelectItem value="draft">Borrador</SelectItem><SelectItem value="pending">Pendiente</SelectItem><SelectItem value="private">Privado</SelectItem></SelectContent></Select></div>
                </CardContent>
            </Card>
            <Card>
                <CardHeader><CardTitle>Organización</CardTitle></CardHeader>
                <CardContent className="space-y-4">
                  <div>
                    <Label>Categorías</Label>
                    <div className="max-h-40 overflow-y-auto space-y-2 p-2 border rounded-md">
                        {allCategories.map(cat => (
                            <div key={cat.id} className="flex items-center space-x-2">
                                <Input type="checkbox" id={`cat-${cat.id}`} checked={post.categories.includes(cat.id)} onChange={(e) => {
                                    const newCategories = e.target.checked 
                                      ? [...post!.categories, cat.id] 
                                      : post!.categories.filter(c => c !== cat.id);
                                    setPost(p => p ? {...p, categories: newCategories} : null);
                                }} className="h-4 w-4" />
                                <Label htmlFor={`cat-${cat.id}`} className="font-normal">{cat.name}</Label>
                            </div>
                        ))}
                    </div>
                  </div>
                  <div><Label htmlFor="tags">Etiquetas (separadas por comas)</Label><Input id="tags" name="tags" value={post.tags} onChange={handleInputChange} /></div>
                </CardContent>
            </Card>
             <Card>
                <CardHeader><CardTitle>Imagen Destacada</CardTitle></CardHeader>
                <CardContent>
                    <ImageUploader photos={post.featuredImage ? [post.featuredImage] : []} onPhotosChange={(photos) => setPost(p => p ? {...p, featuredImage: photos[0] || null} : null)} isProcessing={isSaving} />
                </CardContent>
            </Card>
             <Card>
                <CardHeader><CardTitle className="text-destructive">Zona de Peligro</CardTitle></CardHeader>
                <CardContent>
                    <AlertDialog>
                        <AlertDialogTrigger asChild>
                            <Button variant="destructive" className="w-full" disabled={isDeleting}>
                                <Trash2 className="mr-2 h-4 w-4" /> Eliminar Entrada Permanentemente
                            </Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                            <AlertDialogHeader><AlertDialogTitle>¿Estás absolutamente seguro?</AlertDialogTitle><AlertDialogDescription>Esta acción no se puede deshacer. Se eliminará permanentemente la entrada.</AlertDialogDescription></AlertDialogHeader>
                            <AlertDialogFooter><AlertDialogCancel>Cancelar</AlertDialogCancel><AlertDialogAction onClick={handleDeletePost} className={buttonVariants({ variant: "destructive"})}>Sí, eliminar</AlertDialogAction></AlertDialogFooter>
                        </AlertDialogContent>
                    </AlertDialog>
                </CardContent>
            </Card>
          </div>
        </div>

        {/* DIALOGS for ContentToolbar */}
        <AlertDialog open={isLinkDialogOpen} onOpenChange={setIsLinkDialogOpen}><AlertDialogContent><AlertDialogHeader><AlertDialogTitle>Añadir Enlace</AlertDialogTitle><AlertDialogDescription>Introduce la URL completa a la que quieres enlazar el texto seleccionado.</AlertDialogDescription></AlertDialogHeader><Input value={linkUrl} onChange={(e) => setLinkUrl(e.target.value)} placeholder="https://ejemplo.com" onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); handleInsertLink(); } }} /><AlertDialogFooter><AlertDialogCancel onClick={() => setLinkUrl('')}>Cancelar</AlertDialogCancel><AlertDialogAction onClick={handleInsertLink}>Añadir Enlace</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog>
        <AlertDialog open={isImageDialogOpen} onOpenChange={setIsImageDialogOpen}><AlertDialogContent><AlertDialogHeader><AlertDialogTitle>Insertar Imagen</AlertDialogTitle><AlertDialogDescription>Sube una imagen o introduce una URL para insertarla en el contenido.</AlertDialogDescription></AlertDialogHeader><div className="space-y-4"><div><Label htmlFor="image-upload">Subir archivo</Label><Input id="image-upload" type="file" accept="image/*" onChange={(e) => setImageFile(e.target.files?.[0] || null)} /></div><div className="relative"><div className="absolute inset-0 flex items-center"><span className="w-full border-t" /></div><div className="relative flex justify-center text-xs uppercase"><span className="bg-background px-2 text-muted-foreground">O</span></div></div><div><Label htmlFor="image-url">Insertar desde URL</Label><Input id="image-url" value={imageUrl} onChange={(e) => setImageUrl(e.target.value)} placeholder="https://ejemplo.com/imagen.jpg" /></div></div><AlertDialogFooter><AlertDialogCancel onClick={() => { setImageUrl(''); setImageFile(null); }}>Cancelar</AlertDialogCancel><AlertDialogAction onClick={handleInsertImage} disabled={isUploadingImage}>{isUploadingImage && <Loader2 className="mr-2 h-4 w-4 animate-spin" />} Insertar Imagen</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog>
    </div>
  );
}

export default function BlogEditPage() {
    return (
        <Suspense fallback={<div className="flex items-center justify-center min-h-[calc(100vh-8rem)] w-full"><Loader2 className="h-10 w-10 animate-spin text-primary" /></div>}>
            <EditPageContent />
        </Suspense>
    )
}
