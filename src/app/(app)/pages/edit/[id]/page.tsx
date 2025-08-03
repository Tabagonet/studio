

"use client";

import React, { useEffect, useState, Suspense, useCallback } from 'react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Loader2, ArrowLeft, Save } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { auth } from '@/lib/firebase';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { SeoAnalyzer } from '@/components/features/seo/seo-analyzer';
import { PostEditState } from '@/app/(app)/seo-optimizer/edit/[id]/page';


function EditPageContent() {
  const params = useParams();
  const router = useRouter();
  const searchParams = useSearchParams();
  const postId = Number(params.id);
  const postType = searchParams.get('type') || 'Page';
    
  const [post, setPost] = useState<PostEditState | null>(null);
  
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  
  const { toast } = useToast();

  const handleBackToList = () => {
    if (postType === 'Post') {
        router.push('/blog');
    } else if (postType === 'Producto') {
        router.push('/batch');
    } else {
        router.push('/pages');
    }
  }


  if (isLoading) {
    return <div className="flex items-center justify-center min-h-[calc(100vh-8rem)] w-full"><Loader2 className="h-10 w-10 animate-spin text-primary" /></div>;
  }
  
  if (error) {
     return <div className="container mx-auto py-8"><Alert variant="destructive"><AlertTitle>Error al Cargar</AlertTitle><AlertDescription>{error}</AlertDescription></Alert></div>;
  }
  
  if (!post) {
       return <div className="container mx-auto py-8"><Alert variant="destructive"><AlertTitle>Error</AlertTitle><AlertDescription>No se pudo cargar la información.</AlertDescription></Alert></div>;
  }

  return (
    <>
    <div className="container mx-auto py-8 space-y-6">
        <Card>
            <CardHeader>
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                    <div>
                        <CardTitle>Editor de Contenido</CardTitle>
                        <CardDescription>Editando: {post.title}</CardDescription>
                    </div>
                    <div className="flex flex-wrap gap-2">
                        <Button variant="outline" onClick={handleBackToList}>
                            <ArrowLeft className="mr-2 h-4 w-4" />
                            Volver a la lista
                        </Button>
                    </div>
                </div>
            </CardHeader>
        </Card>

       <p>Editor de página en construcción.</p>
    </div>
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
