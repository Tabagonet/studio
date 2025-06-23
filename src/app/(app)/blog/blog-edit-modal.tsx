
"use client";

import React, { useEffect, useState, useRef } from 'react';
import Image from 'next/image';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogClose } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Loader2, Sparkles, Wand2, Tags, Pilcrow, Heading2, List, ListOrdered, Link as LinkIcon, Image as ImageIcon } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { auth } from '@/lib/firebase';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import type { WordPressPostCategory, WordPressUser, ProductPhoto } from '@/lib/types';
import { ImageUploader } from '@/components/features/wizard/image-uploader';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';

interface BlogEditModalProps {
  postId: number;
  onClose: (refresh: boolean) => void;
}

interface PostEditState {
  title: string;
  content: string;
  status: 'publish' | 'draft' | 'pending' | 'future' | 'private';
  author: number | null;
  category: number | null;
  tags: string;
  featured_media: ProductPhoto | null;
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


export function BlogEditModal({ postId, onClose }: BlogEditModalProps) {
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

  const handleAIGeneration = async (mode: 'enhance_content' | 'suggest_keywords') => {
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
        const payload: any = {
            title: post.title,
            content: post.content,
            status: post.status,
            author: post.author,
            categories: post.category ? [post.category] : [],
            tags: post.tags,
        };

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
        
        const response = await fetch(`/api/wordpress/posts/${postId}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
            body: JSON.stringify(payload)
        });

        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.error || 'Failed to save changes.');
        }
        
        toast({ title: '¡Éxito!', description: 'La entrada ha sido actualizada.' });
        onClose(true);
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
        const [postResponse, categoriesResponse, authorsResponse] = await Promise.all([
           fetch(`/api/wordpress/posts/${postId}?_embed=true`, { headers: { 'Authorization': `Bearer ${token}` }}),
           fetch('/api/wordpress/post-categories', { headers: { 'Authorization': `Bearer ${token}` }}),
           fetch('/api/wordpress/users', { headers: { 'Authorization': `Bearer ${token}` }})
        ]);

        if (!postResponse.ok) throw new Error('Failed to fetch post data.');
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
        });

      } catch (e: any) {
        setError(e.message);
      } finally {
        setIsLoading(false);
      }
    };
    fetchInitialData();
  }, [postId]);

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


  return (
    <Dialog open={true} onOpenChange={() => onClose(false)}>
      <DialogContent className="sm:max-w-4xl max-h-[90vh] flex flex-col">
        <DialogHeader><DialogTitle>Editar Entrada: {post?.title || "Cargando..."}</DialogTitle></DialogHeader>
        
        {isLoading && <div className="flex items-center justify-center min-h-[300px]"><Loader2 className="h-8 w-8 animate-spin text-muted-foreground" /></div>}
        {error && <Alert variant="destructive"><AlertTitle>Error</AlertTitle><AlertDescription>{error}</AlertDescription></Alert>}
        
        {!isLoading && !error && post && (
           <div className="flex-1 min-h-0">
           <Tabs defaultValue="edit" className="flex-1 min-h-0 flex flex-col h-full">
            <TabsList className="grid w-full grid-cols-2">
                <TabsTrigger value="edit">Editor</TabsTrigger>
                <TabsTrigger value="preview">Vista Previa</TabsTrigger>
            </TabsList>
            <TabsContent value="edit" className="space-y-4 flex-1 overflow-y-auto p-2">
                <div>
                  <Label htmlFor="title">Título</Label>
                  <Input id="title" name="title" value={post.title} onChange={handleInputChange} />
                </div>
                <div>
                  <Label htmlFor="content">Contenido</Label>
                  <ContentToolbar onInsertTag={handleInsertTag} onInsertLink={() => openActionDialog('link')} onInsertImage={() => openActionDialog('image')} />
                  <Textarea id="content" name="content" ref={contentRef} value={post.content} onChange={handleInputChange} rows={15} className="rounded-t-none" />
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div><Label>Autor</Label><Select name="author" value={post.author?.toString() || ''} onValueChange={(v) => handleSelectChange('author', v)}><SelectTrigger><SelectValue/></SelectTrigger><SelectContent>{authors.map(a => <SelectItem key={a.id} value={a.id.toString()}>{a.name}</SelectItem>)}</SelectContent></Select></div>
                    <div><Label>Estado</Label><Select name="status" value={post.status} onValueChange={(v) => handleSelectChange('status', v)}><SelectTrigger><SelectValue/></SelectTrigger><SelectContent><SelectItem value="publish">Publicado</SelectItem><SelectItem value="draft">Borrador</SelectItem><SelectItem value="pending">Pendiente</SelectItem><SelectItem value="private">Privado</SelectItem><SelectItem value="future">Programado</SelectItem></SelectContent></Select></div>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div><Label>Categoría</Label><Select name="category" value={post.category?.toString() || ''} onValueChange={(v) => handleSelectChange('category', v)}><SelectTrigger><SelectValue/></SelectTrigger><SelectContent>{categories.map(c => <SelectItem key={c.id} value={c.id.toString()}>{c.name}</SelectItem>)}</SelectContent></Select></div>
                    <div><Label>Etiquetas (separadas por comas)</Label><Input name="tags" value={post.tags} onChange={handleInputChange} /></div>
                </div>
                <div><Label>Imagen Destacada</Label><ImageUploader photos={post.featured_media ? [post.featured_media] : []} onPhotosChange={handlePhotosChange} isProcessing={isSaving} /></div>
                 <div className="space-y-4 pt-6 border-t">
                    <h3 className="text-sm font-medium text-muted-foreground">Asistente IA</h3>
                    <div className="p-4 border rounded-lg space-y-3 bg-card">
                        <Label>Mejorar o etiquetar contenido existente</Label>
                        <div className="flex flex-col sm:flex-row gap-2">
                            <Button onClick={() => handleAIGeneration('enhance_content')} disabled={isAiLoading || !post.content} className="w-full">
                                {isAiLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Wand2 className="mr-2 h-4 w-4" />}
                                Mejorar Contenido
                            </Button>
                            <Button onClick={() => handleAIGeneration('suggest_keywords')} disabled={isAiLoading || !post.content} className="w-full" variant="outline">
                                {isAiLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Tags className="mr-2 h-4 w-4" />}
                                Sugerir Etiquetas
                            </Button>
                        </div>
                    </div>
                </div>
            </TabsContent>
            <TabsContent value="preview" className="flex-1 overflow-y-auto p-1 border rounded-md">
                 <div className="p-4 space-y-4">
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
                </div>
            </TabsContent>
           </Tabs>
           </div>
        )}
        <DialogFooter className="pt-4 border-t mt-auto">
          <DialogClose asChild><Button type="button" variant="secondary">Cancelar</Button></DialogClose>
          <Button type="submit" onClick={handleSaveChanges} disabled={isSaving || isLoading || !!error}>{isSaving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Guardar Cambios</Button>
        </DialogFooter>
        
        <AlertDialog open={isLinkDialogOpen} onOpenChange={setIsLinkDialogOpen}>
            <AlertDialogContent>
                <AlertDialogHeader>
                    <AlertDialogTitle>Añadir Enlace</AlertDialogTitle>
                    <AlertDialogDescription>Introduce la URL completa a la que quieres enlazar el texto seleccionado.</AlertDialogDescription>
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
                    <AlertDialogDescription>Sube una imagen o introduce una URL para insertarla en el contenido.</AlertDialogDescription>
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
      </DialogContent>
    </Dialog>
  );
}
