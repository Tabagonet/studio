

"use client";

import React, { useEffect, useState, Suspense, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { Button, buttonVariants } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Loader2, ArrowLeft, ExternalLink, Save } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { auth } from '@/lib/firebase';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import type { ExtractedWidget } from '@/lib/types';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Textarea } from '@/components/ui/textarea';
import Link from 'next/link';
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
    
  const [post, setPost] = useState<PageEditState | null>(null);
  
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { toast } = useToast();
  
  const fetchInitialData = useCallback(async () => {
    setIsLoading(true); setError(null);
    const user = auth.currentUser;
    if (!user) { setError('Authentication required.'); setIsLoading(false); return; }
    if (isNaN(postId)) { setError(`El ID del contenido no es válido.`); setIsLoading(false); return; }

    try {
      const token = await user.getIdToken();
      // This component now ONLY fetches from the pages endpoint.
      const apiPath = `/api/wordpress/pages/${postId}`;
      
      const postResponse = await fetch(`${apiPath}?context=edit&bust=${new Date().getTime()}`, { headers: { 'Authorization': `Bearer ${token}` }, cache: 'no-store' });
      if (!postResponse.ok) throw new Error((await postResponse.json()).error || `Failed to fetch Page data.`);
      
      const postData = await postResponse.json();
      
      const loadedPost: PageEditState = {
        title: postData.title?.rendered,
        content: postData.content?.rendered, // This will be an array for Elementor, string otherwise
        isElementor: postData.isElementor || false, 
        elementorEditLink: postData.elementorEditLink || null,
        link: postData.link,
        postType: 'Page',
        lang: postData.lang || 'es',
      };
      
      setPost(loadedPost);

    } catch (e: any) { setError(e.message);
    } finally { setIsLoading(false); }
  }, [postId]);


  useEffect(() => { fetchInitialData(); }, [fetchInitialData]);
  
  const handleWidgetChange = (widgetId: string, newText: string) => {
    if (!post || !Array.isArray(post.content)) return;
    const updatedContent = post.content.map(widget => 
        widget.id === widgetId ? { ...widget, text: newText } : widget
    );
    setPost({ ...post, content: updatedContent });
  };
  
  const handleContentChange = (newContent: string) => {
      if (!post) return;
      setPost({ ...post, content: newContent });
  };
  
  const handleSaveChanges = async () => {
    if (!post) return;
    setIsSaving(true);
    const user = auth.currentUser;
    if (!user) {
        toast({ title: 'No autenticado', variant: 'destructive' });
        setIsSaving(false); return;
    }
    
    try {
        const token = await user.getIdToken();
        const payload: any = {
            title: post.title,
        };

        if (post.isElementor && Array.isArray(post.content)) {
            payload.elementorWidgets = post.content.map(({ id, text }) => ({ id, text }));
        } else if (!post.isElementor) {
            payload.content = post.content;
        }

        const response = await fetch(`/api/wordpress/pages/${postId}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
            body: JSON.stringify(payload),
        });

        const result = await response.json();
        if (!response.ok) throw new Error(result.error || 'Fallo al guardar los cambios.');
        
        toast({ title: '¡Página guardada!', description: 'El contenido ha sido actualizado en WordPress.' });
        fetchInitialData(); // Refresh data after saving
    } catch (error: any) {
        toast({ title: 'Error al Guardar', description: error.message, variant: 'destructive' });
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
    <div className="container mx-auto py-8 space-y-6">
        <Card>
            <CardHeader>
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                    <div>
                        <CardTitle>Editor de Contenido de Página</CardTitle>
                        <CardDescription>Editando: {post.title}</CardDescription>
                    </div>
                    <div className="flex flex-wrap gap-2">
                        <Button variant="outline" onClick={() => router.back()}>
                            <ArrowLeft className="mr-2 h-4 w-4" /> Volver
                        </Button>
                         {post.link && (
                             <Button asChild variant="outline">
                                <Link href={post.link} target="_blank" rel="noopener noreferrer">
                                    <ExternalLink className="mr-2 h-4 w-4" />
                                    Vista Previa
                                </Link>
                            </Button>
                         )}
                        <Button onClick={handleSaveChanges} disabled={isSaving}>
                            {isSaving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                            <Save className="mr-2 h-4 w-4" />
                            Guardar Cambios
                        </Button>
                    </div>
                </div>
            </CardHeader>
        </Card>
        
        {post.isElementor ? (
            <Card>
                <CardHeader>
                    <div className="flex justify-between items-center">
                        <div>
                            <CardTitle>Textos de Elementor</CardTitle>
                            <CardDescription>Edita los textos de los widgets de Elementor encontrados en esta página.</CardDescription>
                        </div>
                         <Button asChild size="sm" variant="outline">
                            <Link href={post.elementorEditLink || '#'} target="_blank" rel="noopener noreferrer"><ExternalLink className="mr-2 h-4 w-4"/>Abrir con Elementor</Link>
                         </Button>
                    </div>
                </CardHeader>
                <CardContent className="space-y-4">
                    {Array.isArray(post.content) && post.content.length > 0 ? (
                        post.content.map((widget, index) => (
                          <div key={widget.id || index} className="space-y-1">
                              <Label htmlFor={`widget-${widget.id}`}>Widget: {widget.tag?.toUpperCase() || widget.type}</Label>
                              <Textarea
                                  id={`widget-${widget.id}`}
                                  value={widget.text}
                                  onChange={(e) => handleWidgetChange(widget.id, e.target.value)}
                                  rows={Math.max(2, Math.min(10, widget.text.split('\n').length))}
                                  className="font-sans"
                              />
                          </div>
                      ))
                    ) : (
                        <p className="text-center text-muted-foreground p-4">No se encontraron widgets de texto editables en esta página de Elementor.</p>
                    )}
                </CardContent>
            </Card>
        ) : (
             <Card>
                <CardHeader>
                    <CardTitle>Contenido Principal</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                    <div>
                        <Label htmlFor="title">Título de la Página</Label>
                        <Input id="title" name="title" value={post.title} onChange={(e) => setPost(p => p ? {...p, title: e.target.value} : null)} />
                    </div>
                    <div>
                        <Label>Contenido</Label>
                        <RichTextEditor
                            content={typeof post.content === 'string' ? post.content : ''}
                            onChange={handleContentChange}
                            onInsertImage={() => toast({ title: "Función no disponible aquí", description: "La inserción de imágenes se realiza en el editor de imágenes dedicado.", variant: "destructive"})}
                            placeholder="Escribe el contenido de la página..."
                        />
                    </div>
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
