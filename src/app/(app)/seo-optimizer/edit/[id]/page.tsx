
"use client";

import React, { useEffect, useState, Suspense, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Loader2, ArrowLeft, Save } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { auth } from '@/lib/firebase';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { SeoAnalyzer } from '@/components/features/blog/seo-analyzer';
import type { SeoAnalysisRecord } from '@/lib/types';


interface PostEditState {
  title: string;
  content: string; 
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

interface ContentImage {
    src: string;
    alt: string;
}

function EditPageContent() {
  const params = useParams();
  const router = useRouter();
  const searchParams = useSearchParams();

  const postId = Number(params.id);
  const postType = searchParams.get('type') || 'Post';
    
  const [post, setPost] = useState<PostEditState | null>(null);
  const [contentImages, setContentImages] = useState<ContentImage[]>([]);
  const [applyAiMetaToFeatured, setApplyAiMetaToFeatured] = useState(false);
  
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isAiLoading, setIsAiLoading] = useState(false);

  const [error, setError] = useState<string | null>(null);
  const { toast } = useToast();
  
  
  const fetchInitialData = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    const user = auth.currentUser;
    if (!user) {
      setError('Authentication required.');
      setIsLoading(false);
      return;
    }
    
    if (isNaN(postId) || !postType) {
      setError(`El ID o el tipo del contenido no es válido.`);
      setIsLoading(false);
      return;
    }

    try {
      const token = await user.getIdToken();
      const apiPath = postType === 'Post' ? `/api/wordpress/posts/${postId}` : `/api/wordpress/pages/${postId}`;
      const postResponse = await fetch(`${apiPath}?context=edit`, { headers: { 'Authorization': `Bearer ${token}` }});
      if (!postResponse.ok) throw new Error((await postResponse.json()).error || `Failed to fetch ${postType} data.`);
      
      const postData = await postResponse.json();
      const loadedPost: PostEditState = {
        title: postData.title.rendered || '',
        content: postData.content.rendered || '',
        meta: {
            _yoast_wpseo_title: postData.meta?._yoast_wpseo_title || '',
            _yoast_wpseo_metadesc: postData.meta?._yoast_wpseo_metadesc || '',
            _yoast_wpseo_focuskw: postData.meta?._yoast_wpseo_focuskw || '',
        },
        isElementor: postData.isElementor || false,
        elementorEditLink: postData.elementorEditLink || null,
        adminEditLink: postData.adminEditLink || null,
        featuredImageUrl: postData.featured_image_url || null,
        featuredMediaId: postData.featured_media || null,
        link: postData.link,
      };

      try {
        const historyResponse = await fetch(`/api/seo/history?url=${encodeURIComponent(postData.link)}`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        if (historyResponse.ok) {
            const historyData: { history: SeoAnalysisRecord[] } = await historyResponse.json();
            if (historyData.history && historyData.history.length > 0) {
                const latestAnalysis = historyData.history[0].analysis;
                
                if (!loadedPost.meta._yoast_wpseo_title && latestAnalysis.aiAnalysis.suggested?.title) {
                    loadedPost.meta._yoast_wpseo_title = latestAnalysis.aiAnalysis.suggested.title;
                }
                if (!loadedPost.meta._yoast_wpseo_metadesc && latestAnalysis.aiAnalysis.suggested?.metaDescription) {
                    loadedPost.meta._yoast_wpseo_metadesc = latestAnalysis.aiAnalysis.suggested.metaDescription;
                }
                if (!loadedPost.meta._yoast_wpseo_focuskw && latestAnalysis.aiAnalysis.suggested?.focusKeyword) {
                    loadedPost.meta._yoast_wpseo_focuskw = latestAnalysis.aiAnalysis.suggested.focusKeyword;
                }
            }
        }
      } catch (historyError) {
          console.warn("Could not fetch SEO history for suggestions:", historyError);
      }
      
      setPost(loadedPost);
      
      if (loadedPost.content && loadedPost.link) {
        const tempDiv = document.createElement('div');
        tempDiv.innerHTML = loadedPost.content;
        const siteUrl = new URL(loadedPost.link);

        const images = Array.from(tempDiv.querySelectorAll('img')).map(img => {
            let src = img.getAttribute('src') || '';
            if (src && src.startsWith('/')) {
                src = `${siteUrl.origin}${src}`;
            }
            return {
                src: src,
                alt: img.getAttribute('alt') || '',
            };
        }).filter(img => {
            if (!img.src) return false;
            try {
                const url = new URL(img.src);
                return url.protocol === 'http:' || url.protocol === 'https:';
            } catch (e) {
                return false;
            }
        });
        
        setContentImages(images);
      } else {
        setContentImages([]);
      }

    } catch (e: any) {
      setError(e.message);
    } finally {
      setIsLoading(false);
    }
  }, [postId, postType]);


  useEffect(() => {
    fetchInitialData();
  }, [fetchInitialData]);
  
  const handleMetaChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    if (!post) return;
    const { name, value } = e.target;
    setPost(prev => {
        if (!prev) return null;
        return {
            ...prev,
            meta: {
                ...prev.meta,
                [name]: value,
            },
        };
    });
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
        const payload: any = {
            title: post.title,
            meta: post.meta,
            imageMetas: contentImages,
            content: post.content,
        };
        
        if (applyAiMetaToFeatured && post.featuredMediaId) {
            payload.featured_image_metadata = {
                title: post.title,
                alt_text: post.meta._yoast_wpseo_focuskw || post.title
            };
        }

        const apiPath = postType === 'Post' ? `/api/wordpress/posts/${postId}` : `/api/wordpress/pages/${postId}`;
        const response = await fetch(apiPath, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
            body: JSON.stringify(payload)
        });
        if (!response.ok) throw new Error((await response.json()).error || 'Fallo al guardar.');
        toast({ title: '¡Éxito!', description: "Los cambios SEO, incluyendo los textos 'alt' de las imágenes, han sido guardados." });
    } catch (e: any) {
        toast({ title: 'Error al Guardar', description: e.message, variant: "destructive" });
    } finally {
        setIsSaving(false);
    }
  };


  if (isLoading) {
    return <div className="flex items-center justify-center min-h-[calc(100vh-8rem)] w-full"><Loader2 className="h-10 w-10 animate-spin text-primary" /></div>;
  }
  
  if (error || !post) {
     return <div className="container mx-auto py-8"><Alert variant="destructive"><AlertTitle>Error al Cargar</AlertTitle><AlertDescription>{error || `No se pudo cargar la información del ${postType || 'contenido'}.`}</AlertDescription></Alert></div>;
  }

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
                            <ArrowLeft className="mr-2 h-4 w-4" /> Volver al informe
                        </Button>
                         <Button onClick={handleSaveChanges} disabled={isSaving}>
                            {isSaving ? <Loader2 className="mr-2 h-4 w-4 animate-spin"/> : <Save className="h-4 w-4" /> } Guardar Cambios SEO
                        </Button>
                    </div>
                </div>
            </CardHeader>
        </Card>
        
        <SeoAnalyzer
            post={post}
            setPost={setPost}
            onMetaChange={handleMetaChange}
            isLoading={isAiLoading}
            setIsLoading={setIsAiLoading}
            contentImages={contentImages}
            setContentImages={setContentImages}
            applyAiMetaToFeatured={applyAiMetaToFeatured}
            setApplyAiMetaToFeatured={setApplyAiMetaToFeatured}
        />
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
