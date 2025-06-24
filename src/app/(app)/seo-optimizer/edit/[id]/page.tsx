
"use client";

import React, { useEffect, useState, useRef, Suspense } from 'react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import Image from 'next/image';

import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogClose, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Loader2, Sparkles, Wand2, Tags, Pilcrow, Heading2, List, ListOrdered, Link as LinkIcon, Image as ImageIcon, Check, ArrowLeft } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { auth } from '@/lib/firebase';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import type { WordPressPostCategory, WordPressUser, ProductPhoto } from '@/lib/types';
import { ImageUploader } from '@/components/features/wizard/image-uploader';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription as AlertDialogDesc, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { Card, CardContent, CardHeader, CardTitle, CardDescription as CardDescriptionComponent } from '@/components/ui/card';
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
  featured_media: ProductPhoto | null;
  metaDescription: string;
  focusKeyword: string;
}

const ContentToolbar = ({ onInsertTag, onInsertLink, onInsertImage }: { onInsertTag: (tag: 'h2' | 'ul' | 'ol' | 'strong' | 'em') => void; onInsertLink: () => void; onInsertImage: () => void; }) => (
    <div className="flex items-center gap-1 mb-1 rounded-t-md border-b bg-muted p-1">
        <Button type="button" variant="ghost" size="icon" onClick={() => onInsertTag('strong')} title="Negrita" className="h-8 w-8">
            <Pilcrow className="h-4 w-4" />
        </Button>
        <Button type="button" variant="ghost" size="icon" onClick={() => onInsertTag('em')} title="Cursiva" className="h-8 w-8">
            <span className="italic text-lg font-serif">I</span>
        </Button>
         <Button type="button" variant="ghost" size="icon" onClick={() => onInsertTag('h2')} title="Encabezado H2" className="h-8 w-8">
            <Heading2 className="h-4 w-4" />
        </Button>
        <Button type="button" variant="ghost" size="icon" onClick={() => onInsertTag('ul')} title="Lista desordenada" className="h-8 w-8">
            <List className="h-4 w-4" />
        </Button>
         <Button type="button" variant="ghost" size="icon" onClick={() => onInsertTag('ol')} title="Lista ordenada" className="h-8 w-8">
            <ListOrdered className="h-4 w-4" />
        </Button>
        <Button type="button" variant="ghost" size="icon" onClick={onInsertLink} title="Añadir Enlace" className="h-8 w-8">
            <LinkIcon className="h-4 w-4" />
        </Button>
        <Button type="button" variant="ghost" size="icon" onClick={onInsertImage} title="Insertar Imagen" className="h-8 w-8">
            <ImageIcon className="h-4 w-4" />
        </Button>
    </div>
);


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
  
  const [isLinkDialogOpen, setIsLinkDialogOpen] = useState(false);
  const [isImageDialogOpen, setIsImageDialogOpen] = useState(false);
  const [linkUrl, setLinkUrl] = useState('');
  const [imageUrl, setImageUrl] = useState('');
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [isUploadingImage, setIsUploadingImage] = useState(false);
  const [syncSeo, setSyncSeo] = useState(true);
  
  const contentRef = useRef<HTMLTextAreaElement>(null);
  const selectionRef = useRef<{ start: number; end: number } | null>(null);

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
                setPost({ ...post, title: aiContent.title, content: aiContent.content });
                toast({ title: "Contenido mejorado", description: "Se han actualizado el título y el contenido." });
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
            content: post.content,
            status: post.status,
            author: post.author,
            metaDescription: post.metaDescription,
            focusKeyword: post.focusKeyword,
        };
        
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
            payload.featured_media_id = 0;
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
        });

      } catch (e: any) {
        setError(e.message);
      } finally {
        setIsLoading(false);
      }
    };
    if(postId && postType) fetchInitialData();
  }, [postId, postType, toast]);

  const handleInsertTag = (tag: 'h2' | 'ul' | 'ol' | 'strong' | 'em') => {
      const textarea = contentRef.current;
      if (!textarea || !post) return;
      
      const start = textarea.selectionStart;
      const end = textarea.selectionEnd;
      const selectedText = textarea.value.substring(start, end);
      let newText;

      if (tag === 'ul' || tag === 'ol') {
          const listItems = selectedText.split('\\n').map(line => `  <li>${line}</li>`).join('\\n');
          newText = `${textarea.value.substring(0, start)}<${tag}>\\n${listItems}\\n</${tag}>${textarea.value.substring(end)}`;
      } else {
          newText = `${textarea.value.substring(0, start)}<${tag}>${selectedText}</${tag}>${textarea.value.substring(end)}`;
      }
      
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
      if (!post) return;

      if (imageFile) {
          setIsUploadingImage(true);
          try {
              const user = auth.currentUser;
              if (!user) throw new Error("No autenticado.");
              const token = await user.getIdToken();

              const formData = new FormData();
              formData.append('imagen', imageFile);

              const response = await fetch('/api/upload-image', {
                  method: 'POST',
                  headers: { 'Authorization': `Bearer ${token}` },
                  body: formData,
              });
              
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
      if (!textarea || !selection) return;

      const { start } = selection;
      const newText = `${textarea.value.substring(0, start)}\\n<img src="${finalImageUrl}" alt="${post.title || 'Imagen insertada'}" loading="lazy" style="max-width: 100%; height: auto; border-radius: 8px;" />\\n${textarea.value.substring(start)}`;
      
      setPost({ ...post, content: newText });

      setImageUrl('');
      setImageFile(null);
      setIsImageDialogOpen(false);
  };


  if (isLoading) {
    return <div className="flex items-center justify-center min-h-[calc(100vh-8rem)] w-full"><Loader2 className="h-10 w-10 animate-spin text-primary" /></div>;
  }
  
  if (error) {
     return <div className="container mx-auto py-8"><Alert variant="destructive"><AlertTitle>Error al Cargar</AlertTitle><AlertDialogDesc>{error}</AlertDialogDesc></Alert></div>;
  }
  
  if (!post) {
       return <div className="container mx-auto py-8"><Alert variant="destructive"><AlertTitle>Error</AlertTitle><AlertDialogDesc>No se pudo cargar la información del contenido.</AlertDialogDesc></Alert></div>;
  }

  return (
    <div className="container mx-auto py-8 space-y-6">
        <Card>
            <CardHeader>
                <div className="flex items-center justify-between">
                    <div>
                        <CardTitle>Editor de Contenido</CardTitle>
                        <CardDescriptionComponent>Estás editando: {post.title}</CardDescriptionComponent>
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

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="lg:col-span-2 space-y-6">
                 <Tabs defaultValue="edit" className="w-full">
                    <TabsList className="grid w-full grid-cols-2">
                        <TabsTrigger value="edit">Editor</TabsTrigger>
                        <TabsTrigger value="preview">Vista Previa</TabsTrigger>
                    </TabsList>
                    <TabsContent value="edit" className="p-1 space-y-4">
                        <div className="mt-4">
                            <Label htmlFor="title">Título</Label>
                            <Input id="title" name="title" value={post.title} onChange={handleInputChange} />
                        </div>
                        <div>
                            <Label htmlFor="content">Contenido</Label>
                            <ContentToolbar onInsertTag={handleInsertTag} onInsertLink={() => openActionDialog('link')} onInsertImage={() => openActionDialog('image')} />
                            <Textarea id="content" name="content" ref={contentRef} value={post.content} onChange={handleInputChange} rows={15} className="rounded-t-none" />
                        </div>
                    </TabsContent>
                    <TabsContent value="preview" className="flex-1 overflow-y-auto p-4 border rounded-md min-h-[300px]">
                        {post.featured_media?.previewUrl && (
                            <div className="relative h-48 w-full mb-4 rounded-md overflow-hidden">
                                <Image 
                                    src={post.featured_media.previewUrl} 
                                    alt={post.title || "Imagen destacada"}
                                    fill
                                    className="object-cover"
                                    sizes="(max-width: 768px) 100vw, 50vw"
                                />
                            </div>
                        )}
                        <h1 className="text-3xl font-bold">{post.title || "Entrada sin título"}</h1>
                        <div className="text-sm text-muted-foreground">
                            <span>Autor: <strong>{authors.find(a => a.id === post.author)?.name || "No asignado"}</strong></span>
                        </div>
                        <div className="prose prose-lg dark:prose-invert max-w-none" dangerouslySetInnerHTML={{ __html: post.content || "<p>Contenido no disponible.</p>" }} />
                    </TabsContent>
                 </Tabs>
            </div>
            <div className="lg:col-span-1 space-y-6">
                <Card>
                    <CardHeader><CardTitle>Ajustes</CardTitle></CardHeader>
                    <CardContent className="space-y-4">
                         <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div><Label>Autor</Label><Select name="author" value={post.author?.toString() || ''} onValueChange={(v) => handleSelectChange('author', v)}><SelectTrigger><SelectValue/></SelectTrigger><SelectContent>{authors.map(a => <SelectItem key={a.id} value={a.id.toString()}>{a.name}</SelectItem>)}</SelectContent></Select></div>
                            <div><Label>Estado</Label><Select name="status" value={post.status} onValueChange={(v) => handleSelectChange('status', v)}><SelectTrigger><SelectValue/></SelectTrigger><SelectContent><SelectItem value="publish">Publicado</SelectItem><SelectItem value="draft">Borrador</SelectItem><SelectItem value="pending">Pendiente</SelectItem><SelectItem value="private">Privado</SelectItem><SelectItem value="future">Programado</SelectItem></SelectContent></Select></div>
                        </div>
                        {postType === 'Post' && (
                            <div className="grid grid-cols-1 gap-4">
                                <div><Label>Categoría</Label><Select name="category" value={post.category?.toString() || ''} onValueChange={(v) => handleSelectChange('category', v)}><SelectTrigger><SelectValue/></SelectTrigger><SelectContent>{categories.map(c => <SelectItem key={c.id} value={c.id.toString()}>{c.name}</SelectItem>)}</SelectContent></Select></div>
                                <div><Label>Etiquetas (separadas por comas)</Label><Input name="tags" value={post.tags} onChange={handleInputChange} /></div>
                            </div>
                        )}
                        <div><Label>Imagen Destacada</Label><ImageUploader photos={post.featured_media ? [post.featured_media] : []} onPhotosChange={handlePhotosChange} isProcessing={isSaving} /></div>
                    </CardContent>
                </Card>
                
                 <Card>
                    <CardHeader>
                         <CardTitle>Optimización SEO</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-6">
                         <div className="space-y-4">
                            <h3 className="text-sm font-medium text-muted-foreground">Asistente IA</h3>
                            <div className="p-4 border rounded-lg space-y-3 bg-card">
                                <Label>Mejorar o etiquetar contenido existente</Label>
                                <div className="flex flex-col sm:flex-row gap-2">
                                    <Button onClick={() => handleAIGeneration('enhance_content')} disabled={isAiLoading || !post.content} className="w-full">
                                        {isAiLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Wand2 className="mr-2 h-4 w-4" />}
                                        Mejorar Contenido
                                    </Button>
                                    {postType === 'Post' && (
                                        <Button onClick={() => handleAIGeneration('suggest_keywords')} disabled={isAiLoading || !post.content} className="w-full" variant="outline">
                                            {isAiLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Tags className="mr-2 h-4 w-4" />}
                                            Sugerir Etiquetas
                                        </Button>
                                    )}
                                </div>
                            </div>
                        </div>
                         <div className="space-y-4 pt-4 border-t">
                            <h3 className="text-sm font-medium text-muted-foreground">Análisis y Vista Previa SEO</h3>
                            <div className="p-4 border rounded-lg space-y-4 bg-card">
                                <div className="space-y-2">
                                    <Label htmlFor="focusKeyword">Palabra Clave Principal</Label>
                                    <Input 
                                        id="focusKeyword" 
                                        name="focusKeyword" 
                                        value={post.focusKeyword} 
                                        onChange={handleInputChange} 
                                        placeholder="Ej: Jardinería sostenible" 
                                    />
                                </div>
                                 <div className="space-y-2">
                                    <Label htmlFor="metaDescription">Meta Descripción</Label>
                                    <Textarea 
                                        id="metaDescription" 
                                        name="metaDescription" 
                                        value={post.metaDescription} 
                                        onChange={handleInputChange} 
                                        placeholder="Un resumen atractivo para Google (máx. 160 caracteres)."
                                        maxLength={165}
                                        rows={3}
                                    />
                                    <div className="flex justify-end">
                                        <Button 
                                            type="button" 
                                            variant="outline" 
                                            size="sm"
                                            onClick={() => handleAIGeneration('generate_meta_description')}
                                            disabled={isAiLoading || !post.content}
                                        >
                                            {isAiLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Sparkles className="mr-2 h-4 w-4" />}
                                            Generar con IA
                                        </Button>
                                    </div>
                                </div>
                                <GoogleSnippetPreview 
                                    title={post.title}
                                    description={post.metaDescription}
                                    url={''}
                                />
                                <SeoAnalyzer 
                                    title={post.title}
                                    content={post.content}
                                    focusKeyword={post.focusKeyword}
                                />
                                {searchParams.get('translations') && (
                                    <div className="flex items-center space-x-2 pt-4 border-t">
                                        <Checkbox id="sync-seo" checked={syncSeo} onCheckedChange={(checked) => setSyncSeo(!!checked)} />
                                        <Label htmlFor="sync-seo" className="font-normal text-sm cursor-pointer">
                                            Sincronizar estas mejoras SEO con todas las traducciones
                                        </Label>
                                    </div>
                                )}
                            </div>
                        </div>
                    </CardContent>
                </Card>
            </div>
        </div>

        <AlertDialog open={isLinkDialogOpen} onOpenChange={setIsLinkDialogOpen}>
            <AlertDialogContent>
                <AlertDialogHeader>
                    <AlertDialogTitle>Añadir Enlace</AlertDialogTitle>
                    <AlertDialogDesc>Introduce la URL completa a la que quieres enlazar el texto seleccionado.</AlertDialogDesc>
                </AlertDialogHeader>
                <Input 
                    value={linkUrl} 
                    onChange={(e) => setLinkUrl(e.target.value)} 
                    placeholder="https://ejemplo.com" 
                    onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); handleInsertLink(); } }}
                />
                <AlertDialogFooter>
                    <AlertDialogCancel onClick={() => setLinkUrl('')}>Cancelar</AlertDialogCancel>
                    <AlertDialogAction onClick={handleInsertLink}>Añadir Enlace</AlertDialogAction>
                </AlertDialogFooter>
            </AlertDialogContent>
        </AlertDialog>

        <AlertDialog open={isImageDialogOpen} onOpenChange={setIsImageDialogOpen}>
            <AlertDialogContent>
                <AlertDialogHeader>
                    <AlertDialogTitle>Insertar Imagen</AlertDialogTitle>
                    <AlertDialogDesc>Sube una imagen o introduce una URL para insertarla en el contenido.</AlertDialogDesc>
                </AlertDialogHeader>
                <div className="space-y-4">
                    <div>
                        <Label htmlFor="image-upload">Subir archivo</Label>
                        <Input id="image-upload" type="file" accept="image/*" onChange={(e) => setImageFile(e.target.files?.[0] || null)} />
                    </div>
                    <div className="relative">
                        <div className="absolute inset-0 flex items-center">
                            <span className="w-full border-t" />
                        </div>
                        <div className="relative flex justify-center text-xs uppercase">
                            <span className="bg-background px-2 text-muted-foreground">O</span>
                        </div>
                    </div>
                    <div>
                        <Label htmlFor="image-url">Insertar desde URL</Label>
                        <Input id="image-url" value={imageUrl} onChange={(e) => setImageUrl(e.target.value)} placeholder="https://ejemplo.com/imagen.jpg" />
                    </div>
                </div>
                <AlertDialogFooter>
                    <AlertDialogCancel onClick={() => { setImageUrl(''); setImageFile(null); }}>Cancelar</AlertDialogCancel>
                    <AlertDialogAction onClick={handleInsertImage} disabled={isUploadingImage}>
                        {isUploadingImage && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                        Insertar Imagen
                    </AlertDialogAction>
                </AlertDialogFooter>
            </AlertDialogContent>
        </AlertDialog>
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
