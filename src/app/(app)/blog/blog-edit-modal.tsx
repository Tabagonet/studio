
"use client";

import React, { useEffect, useState } from 'react';
import Image from 'next/image';
import axios from 'axios';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogClose } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Loader2, Sparkles, Wand2, Tags } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { auth } from '@/lib/firebase';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import type { WordPressPostCategory, WordPressUser, ProductPhoto } from '@/lib/types';
import { ImageUploader } from '@/components/features/wizard/image-uploader';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';

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

export function BlogEditModal({ postId, onClose }: BlogEditModalProps) {
  const [post, setPost] = useState<PostEditState | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isAiLoading, setIsAiLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [categories, setCategories] = useState<WordPressPostCategory[]>([]);
  const [authors, setAuthors] = useState<WordPressUser[]>([]);

  const { toast } = useToast();

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    if (!post) return;
    setPost({ ...post, [e.target.name]: e.target.value });
  };
  
  const handleSelectChange = (name: 'status' | 'category' | 'author', value: string) => {
    if (!post) return;
    const finalValue = value ? parseInt(value, 10) : null;
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

        if (post.featured_media?.file) { // New image uploaded
            const formData = new FormData();
            formData.append('imagen', post.featured_media.file);
            const uploadResponse = await axios.post('/api/upload-image', formData, {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            if (!uploadResponse.data.success) throw new Error(uploadResponse.data.error || 'Failed to upload new image.');
            payload.featured_image_src = uploadResponse.data.url;
        } else if (post.featured_media?.id) { // Existing image
            payload.featured_media_id = post.featured_media.id;
        } else { // Image removed
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

  return (
    <Dialog open={true} onOpenChange={() => onClose(false)}>
      <DialogContent className="sm:max-w-4xl">
        <DialogHeader><DialogTitle>Editar Entrada: {post?.title || "Cargando..."}</DialogTitle></DialogHeader>
        
        {isLoading && <div className="flex items-center justify-center min-h-[300px]"><Loader2 className="h-8 w-8 animate-spin text-muted-foreground" /></div>}
        {error && <Alert variant="destructive"><AlertTitle>Error</AlertTitle><AlertDescription>{error}</AlertDescription></Alert>}
        
        {!isLoading && !error && post && (
           <Tabs defaultValue="edit" className="space-y-4">
            <TabsList className="grid w-full grid-cols-2">
                <TabsTrigger value="edit">Editor</TabsTrigger>
                <TabsTrigger value="preview">Vista Previa</TabsTrigger>
            </TabsList>
            <TabsContent value="edit" className="space-y-4 max-h-[70vh] overflow-y-auto p-1">
                <div><Label htmlFor="title">Título</Label><Input id="title" name="title" value={post.title} onChange={handleInputChange} /></div>
                <div><Label htmlFor="content">Contenido</Label><Textarea id="content" name="content" value={post.content} onChange={handleInputChange} rows={15} /></div>
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
            <TabsContent value="preview" className="max-h-[70vh] overflow-y-auto p-1 border rounded-md">
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
        )}
        <DialogFooter className="pt-4">
          <DialogClose asChild><Button type="button" variant="secondary">Cancelar</Button></DialogClose>
          <Button type="submit" onClick={handleSaveChanges} disabled={isSaving || isLoading || !!error}>{isSaving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Guardar Cambios</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
