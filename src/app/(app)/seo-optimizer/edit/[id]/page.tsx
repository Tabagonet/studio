

"use client";

import React, { useEffect, useState, Suspense, useCallback } from 'react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { Button, buttonVariants } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Loader2, Wand2, Tags, ArrowLeft, ExternalLink, Image as ImageIcon, Link as LinkIcon, Trash2 } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { auth } from '@/lib/firebase';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import type { WordPressPostCategory, WordPressUser, ProductPhoto, ExtractedWidget, ContentImage } from '@/lib/types';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { ImageUploader } from '@/components/features/wizard/image-uploader';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogHeader, AlertDialogTitle, AlertDialogDescription, AlertDialogFooter, AlertDialogTrigger } from '@/components/ui/alert-dialog';
import { Checkbox } from '@/components/ui/checkbox';
import { RichTextEditor } from '@/components/features/editor/rich-text-editor';
import { LinkSuggestionsDialog } from '@/components/features/editor/link-suggestions-dialog';
import type { SuggestLinksOutput, LinkSuggestion } from '@/ai/schemas';
import { SeoAnalyzer } from '@/components/features/seo/seo-analyzer';
import { GoogleSnippetPreview } from '@/components/features/blog/google-snippet-preview';


interface PostEditState {
  title: string;
  content: string | ExtractedWidget[]; 
  short_description?: string;
  meta: {
      _yoast_wpseo_title: string;
      _yoast_wpseo_metadesc: string;
      _yoast_wpseo_focuskw: string;
  };
  status: 'publish' | 'draft' | 'pending' | 'future' | 'private';
  author: number | null;
  categories: number[];
  tags: string;
  featuredImage: ProductPhoto | null;
  featuredImageId: number | null; // Keep track of the original featured media ID
  isElementor: boolean;
  elementorEditLink: string | null;
  adminEditLink?: string | null;
  link: string;
  postType: 'Post' | 'Page' | 'Producto';
  lang: string;
  translations?: Record<string, number>;
}

function EditPageContent() {
  const params = useParams();
  const router = useRouter();
  const searchParams = useSearchParams();
  const postId = Number(params.id);
  const postType = searchParams.get('type') || 'Page';
    
  const [post, setPost] = useState<PostEditState | null>(null);
  const [contentImages, setContentImages] = useState<ContentImage[]>([]);
  
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isAiLoading, setIsAiLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  const [applyAiMetaToFeatured, setApplyAiMetaToFeatured] = useState(true);
  
  const { toast } = useToast();

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    if (!post) return;
    const { name, value } = e.target;
    if (name in post.meta) {
      setPost({ ...post, meta: { ...post.meta, [name]: value } });
    } else {
      setPost({ ...post, [name]: value });
    }
  };

  const handleContentChange = (newContent: string) => {
    if (!post) return;
    setPost({ ...post, content: newContent });
  };

  const fetchInitialData = useCallback(async () => {
    setIsLoading(true); setError(null);
    const user = auth.currentUser;
    if (!user) { setError('Authentication required.'); setIsLoading(false); return; }
    if (isNaN(postId)) { setError(`El ID del contenido no es válido.`); setIsLoading(false); return; }

    try {
      const token = await user.getIdToken();
      let apiPath = '';
      if (postType === 'Post') apiPath = `/api/wordpress/posts/${postId}`;
      else if (postType === 'Page') apiPath = `/api/wordpress/pages/${postId}`;
      else if (postType === 'Producto') apiPath = `/api/wordpress/products/${postId}`;
      else throw new Error(`Unsupported post type: ${postType}`);
      
      const postResponse = await fetch(`${apiPath}?context=edit&bust=${new Date().getTime()}`, { headers: { 'Authorization': `Bearer ${token}` }, cache: 'no-store' });
      if (!postResponse.ok) throw new Error((await postResponse.json()).error || `Failed to fetch ${postType} data.`);
      
      const postData = await postResponse.json();
      
      const loadedPost: PostEditState = {
        title: postData.title?.rendered,
        content: postData.content?.rendered || '',
        short_description: postData.short_description,
        meta: {
          _yoast_wpseo_title: postData.meta?._yoast_wpseo_title || postData.title?.rendered || '',
          _yoast_wpseo_metadesc: postData.meta?._yoast_wpseo_metadesc || postData.excerpt?.rendered.replace(/<[^>]+>/g, '') || '',
          _yoast_wpseo_focuskw: postData.meta?._yoast_wpseo_focuskw || '',
        },
        status: postData.status || 'draft',
        author: postData.author || null,
        categories: postData.categories?.map((c: any) => typeof c === 'object' ? c.id : c) || [],
        tags: postData.tags?.map((t: any) => t.name).join(', ') || '',
        featuredImageId: postData.featured_media || null,
        featuredImage: postData.featured_image_url ? {
            id: postData.featured_media, previewUrl: postData.featured_image_url, name: 'Imagen destacada',
            status: 'completed', progress: 100,
        } : null,
        isElementor: postData.isElementor || false, 
        elementorEditLink: postData.elementorEditLink || null,
        adminEditLink: postData.adminEditLink || null,
        link: postData.link,
        postType: postType as any,
        lang: postData.lang || 'es',
        translations: postData.translations || {},
      };
      
      setPost(loadedPost);
       if (postData.scrapedImages && Array.isArray(postData.scrapedImages)) {
          setContentImages(postData.scrapedImages);
      } else {
          setContentImages([]);
      }
    } catch (e: any) { setError(e.message);
    } finally { setIsLoading(false); }
  }, [postId, postType]);


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
            meta: post.meta,
        };

        if (applyAiMetaToFeatured && post.featuredImage && post.meta._yoast_wpseo_focuskw) {
             payload.featured_image_metadata = {
                 title: post.meta._yoast_wpseo_title || post.title,
                 alt_text: post.meta._yoast_wpseo_focuskw,
             }
        }
        
        const imageUpdates = contentImages
            .filter(img => img.alt !== (post?.content.toString().match(new RegExp(`alt="([^"]*)"\\s*src="${img.id}"`))?.[1] || ''))
            .map(img => ({ id: img.mediaId, alt: img.alt }));
        
        if (imageUpdates.length > 0) {
            payload.image_alt_updates = imageUpdates.filter(u => u.id !== null);
        }
        
        const endpoint = post.postType === 'Post' ? `/api/wordpress/posts/${postId}` : `/api/wordpress/pages/${postId}`;

        const response = await fetch(endpoint, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
            body: JSON.stringify(payload)
        });

        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.error || 'Fallo al guardar los cambios');
        }
        
        toast({ title: '¡Éxito!', description: `Los metadatos SEO han sido actualizados.` });
        
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
     return <div className="container mx-auto py-8"><Alert variant="destructive"><AlertTitle>Error al Cargar</AlertTitle><AlertDescription>{error || `No se pudo cargar la información.`}</AlertDescription></Alert></div>;
  }

  return (
    <div className="container mx-auto py-8 space-y-6">
        <Card>
            <CardHeader>
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                    <div>
                        <CardTitle>Optimizador SEO</CardTitle>
                        <CardDescription>Editando: {post.title}</CardDescription>
                    </div>
                    <div className="flex flex-wrap gap-2">
                        <Button variant="outline" onClick={() => router.push('/pages')}>
                            <ArrowLeft className="mr-2 h-4 w-4" />
                            Volver a la lista
                        </Button>
                        <Button onClick={handleSaveChanges} disabled={isSaving || isAiLoading}>
                            {isSaving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                            Guardar Cambios SEO
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
                postId={postId}
             />
          </div>
          
          <div className="space-y-6">
             <Card>
                <CardHeader>
                  <CardTitle>Edición SEO</CardTitle>
                  <CardDescription>Modifica los campos clave para el posicionamiento en buscadores.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                   <div>
                      <Label htmlFor="_yoast_wpseo_focuskw">Palabra Clave Principal</Label>
                      <Input id="_yoast_wpseo_focuskw" name="_yoast_wpseo_focuskw" value={post.meta._yoast_wpseo_focuskw} onChange={handleInputChange} />
                   </div>
                   <div>
                      <Label htmlFor="_yoast_wpseo_title">Título SEO</Label>
                      <Input id="_yoast_wpseo_title" name="_yoast_wpseo_title" value={post.meta._yoast_wpseo_title} onChange={handleInputChange} />
                   </div>
                   <div>
                       <Label htmlFor="_yoast_wpseo_metadesc">Meta Descripción</Label>
                       <Input id="_yoast_wpseo_metadesc" name="_yoast_wpseo_metadesc" value={post.meta._yoast_wpseo_metadesc} onChange={handleInputChange} />
                   </div>
                </CardContent>
            </Card>
             <GoogleSnippetPreview 
                title={post.meta._yoast_wpseo_title || post.title}
                description={post.meta._yoast_wpseo_metadesc || ''}
                url={post.link || null}
             />
          </div>
        </div>
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

