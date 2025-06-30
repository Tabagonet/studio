

"use client";

import React, { useEffect, useState, Suspense, useCallback } from 'react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import Image from 'next/image';

import { Button, buttonVariants } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Loader2, ArrowLeft, ExternalLink, Edit } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { auth } from '@/lib/firebase';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import type { WordPressUser, WordPressPostCategory } from '@/lib/types';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { SeoAnalyzer } from '@/components/features/blog/seo-analyzer';


interface PostEditState {
  title: string;
  content: string; 
  status: 'publish' | 'draft' | 'pending' | 'future' | 'private';
  author: number | null;
  category: number | null;
  tags: string;
  metaDescription: string;
  focusKeyword: string;
  isElementor: boolean;
  elementorEditLink: string | null;
  featuredImageUrl?: string | null;
  featuredMediaId?: number | null;
  translations?: Record<string, number>;
}

function EditPageContent() {
  const params = useParams();
  const router = useRouter();
  const searchParams = useSearchParams();

  const postId = Number(params.id);
  const postType = searchParams.get('type');
    
  const [post, setPost] = useState<PostEditState | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { toast } = useToast();

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
      
      if (isNaN(postId) || (postType !== 'Post' && postType !== 'Page')) {
        setError('El ID o el tipo de contenido no son válidos.');
        setIsLoading(false);
        return;
      }

      try {
        const token = await user.getIdToken();
        const apiPath = postType === 'Post' ? `/api/wordpress/posts/${postId}` : `/api/wordpress/pages/${postId}`;
        const postResponsePromise = fetch(`${apiPath}?_embed=true&context=edit`, { headers: { 'Authorization': `Bearer ${token}` }});
        
        const [postResponse] = await Promise.all([
          postResponsePromise
        ]);

        if (!postResponse.ok) {
          const errorData = await postResponse.json();
          throw new Error(errorData.error || `Failed to fetch ${postType} data.`);
        }
        const postData = await postResponse.json();
        
        setPost({
          title: postData.title.rendered || '',
          content: postData.content.rendered || '',
          status: postData.status || 'draft',
          author: postData.author || null,
          category: postData.categories?.[0] || null,
          tags: postData._embedded?.['wp:term']?.[1]?.map((t: any) => t.name).join(', ') || '',
          metaDescription: postData.meta?._yoast_wpseo_metadesc || '',
          focusKeyword: postData.meta?._yoast_wpseo_focuskw || '',
          isElementor: postData.isElementor || false,
          elementorEditLink: postData.elementorEditLink || null,
          featuredImageUrl: postData.featured_image_url || null,
          featuredMediaId: postData.featured_media || null,
          translations: postData.translations || {},
        });

      } catch (e: any) {
        setError(e.message);
      } finally {
        setIsLoading(false);
      }
    };
    if(postId && postType) fetchInitialData();
  }, [postId, postType]);
  

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
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                    <div>
                        <CardTitle>Centro de Acción SEO</CardTitle>
                        <CardDescription>Editando: {post.title}</CardDescription>
                    </div>
                    <div className="flex gap-2">
                        <Button variant="outline" onClick={() => router.back()}>
                            <ArrowLeft className="mr-2 h-4 w-4" /> Volver al Informe
                        </Button>
                    </div>
                </div>
            </CardHeader>
        </Card>

        {post.isElementor && (
             <Alert>
                <Edit className="h-4 w-4" />
                <AlertTitle>Página de Elementor</AlertTitle>
                <AlertDescription>
                    Para editar los encabezados y el contenido, debes usar el editor de Elementor.
                </AlertDescription>
                 <Button asChild className="mt-2" size="sm" variant="secondary">
                    <Link href={post.elementorEditLink!} target="_blank" rel="noopener noreferrer">
                        <ExternalLink className="mr-2 h-4 w-4" />
                        Abrir con Elementor
                    </Link>
                </Button>
            </Alert>
        )}
        
        <SeoAnalyzer post={post} postId={postId} postType={postType || 'Post'} />

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
