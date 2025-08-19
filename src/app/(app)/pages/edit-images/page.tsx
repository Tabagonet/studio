
// This is a new file for the batch image editor.
"use client";

import React, { useEffect, useState, Suspense, useCallback } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Loader2, ArrowLeft, Image as ImageIcon, Replace } from 'lucide-react';
import { ScrollArea } from '@/components/ui/scroll-area';
import NextImage from 'next/image';
import { useToast } from '@/hooks/use-toast';
import { auth } from '@/lib/firebase';
import type { ContentImage } from '@/lib/types';
import { Badge } from '@/components/ui/badge';
import { ImageCropperDialog } from '@/components/features/media/image-cropper-dialog';


interface GroupedContent {
  id: number;
  title: string;
  images: ContentImage[];
}

interface ReplaceState {
    open: boolean;
    imageToReplace: ContentImage | null;
    postId: number | null;
    postType: string | null;
}

function BatchImageEditor() {
    const router = useRouter();
    const searchParams = useSearchParams();
    const { toast } = useToast();

    const [groupedContent, setGroupedContent] = useState<GroupedContent[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [isProcessing, setIsProcessing] = useState(false);
    
    const [replaceState, setReplaceState] = useState<ReplaceState>({
        open: false,
        imageToReplace: null,
        postId: null,
        postType: null
    });

    const ids = searchParams.get('ids');
    const type = searchParams.get('type');

    const fetchBatchData = useCallback(async () => {
        if (!ids || !type) {
            setError("Faltan los IDs o el tipo de contenido en la URL.");
            setIsLoading(false);
            return;
        }
        setIsLoading(true);
        setError(null);
        const user = auth.currentUser;
        if (!user) {
            setError("Autenticación requerida.");
            setIsLoading(false);
            return;
        }

        try {
            const token = await user.getIdToken();
            const response = await fetch(`/api/wordpress/content-batch?ids=${ids}&type=${type}`, {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            if (!response.ok) {
                throw new Error((await response.json()).error || 'Fallo al cargar el contenido.');
            }
            const data = await response.json();
            setGroupedContent(data.content);
        } catch (err: any) {
            setError(err.message);
        } finally {
            setIsLoading(false);
        }
    }, [ids, type]);

    useEffect(() => {
        fetchBatchData();
    }, [fetchBatchData]);
    
    const handleCroppedImageSave = async (croppedImageFile: File) => {
        const { imageToReplace, postId, postType } = replaceState;
        if (!imageToReplace || !croppedImageFile || !postId || !postType) {
            toast({ title: 'Error', description: 'Faltan datos para reemplazar la imagen.', variant: 'destructive' });
            return;
        }
        setIsProcessing(true);
        try {
            const user = auth.currentUser; if (!user) throw new Error("No autenticado.");
            const token = await user.getIdToken();
            
            const formData = new FormData();
            formData.append('newImageFile', croppedImageFile);
            formData.append('postId', postId.toString());
            formData.append('postType', postType);
            formData.append('oldImageUrl', imageToReplace.src);
            if (imageToReplace.mediaId) formData.append('mediaIdToDelete', String(imageToReplace.mediaId));
            
            const response = await fetch('/api/wordpress/replace-image', {
                method: 'POST',
                headers: { 'Authorization': `Bearer ${token}` },
                body: formData,
            });
            const result = await response.json();
            if (!response.ok) throw new Error(result.error || 'Fallo en la API de reemplazo.');
            
            setGroupedContent(prev => prev.map(group => {
                if (group.id === postId) {
                    return { ...group, images: group.images.map(img => img.id === imageToReplace.id ? { ...img, src: result.newImageUrl, alt: result.newImageAlt } : img) };
                }
                return group;
            }));
            
            toast({ title: 'Imagen Reemplazada', description: 'La imagen ha sido actualizada.' });
            setReplaceState({ open: false, imageToReplace: null, postId: null, postType: null });
        } catch (error: any) {
            toast({ title: 'Error al reemplazar', description: error.message, variant: 'destructive' });
        } finally {
            setIsProcessing(false);
        }
    };


    if (isLoading) {
        return <div className="flex items-center justify-center p-10"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>;
    }
    
    if (error) {
         return <Alert variant="destructive"><AlertTitle>Error al Cargar</AlertTitle><AlertDescription>{error}</AlertDescription></Alert>;
    }

    return (
        <div className="space-y-6">
            <ScrollArea className="h-[calc(100vh-14rem)]">
                <div className="space-y-6 pr-4">
                    {groupedContent.map((group) => (
                        <Card key={group.id}>
                            <CardHeader>
                                <CardTitle>{group.title}</CardTitle>
                                <CardDescription>{group.images.length} imágen(es) encontradas</CardDescription>
                            </CardHeader>
                            <CardContent>
                                {group.images.length > 0 ? (
                                    <div className="space-y-3">
                                        {group.images.map((img) => (
                                            <div key={img.id} className="flex items-center gap-4 p-3 border rounded-lg bg-muted/30">
                                                <div className="relative h-16 w-16 flex-shrink-0">
                                                    <NextImage src={img.src} alt={img.alt || 'Vista previa'} fill className="rounded-md object-cover" sizes="64px" />
                                                </div>
                                                <div className="flex-grow min-w-0">
                                                    <p className="text-sm font-medium text-foreground truncate" title={img.src}>...{img.src.slice(-50)}</p>
                                                     <p className="text-xs text-muted-foreground">Alt: <span className="italic">{img.alt || "(vacío)"}</span></p>
                                                     <p className="text-xs text-muted-foreground">Tamaño: <span className="font-mono">{img.width && img.height ? `${img.width}x${img.height}px` : 'N/A'}</span></p>
                                                     {img.widgetType && <Badge variant="outline" className="mt-1 capitalize">{img.widgetType.replace(/_/g, ' ')}</Badge>}
                                                </div>
                                                <Button 
                                                    size="sm"
                                                    variant="outline"
                                                    onClick={() => setReplaceState({ open: true, imageToReplace: img, postId: group.id, postType: type })}
                                                >
                                                    <Replace className="mr-2 h-4 w-4" />
                                                    Reemplazar
                                                </Button>
                                            </div>
                                        ))}
                                    </div>
                                ) : (
                                    <p className="text-center text-muted-foreground py-4">No se encontraron imágenes en este contenido.</p>
                                )}
                            </CardContent>
                        </Card>
                    ))}
                </div>
            </ScrollArea>
             <ImageCropperDialog
                open={replaceState.open}
                onOpenChange={(isOpen) => !isOpen && setReplaceState({ open: false, imageToReplace: null, postId: null, postType: null })}
                imageToCrop={replaceState.imageToReplace}
                onSave={handleCroppedImageSave}
                isSaving={isProcessing}
            />
        </div>
    )
}

export default function BatchImageEditorPage() {
    const router = useRouter();
    return (
        <div className="container mx-auto py-8">
            <Suspense fallback={<div className="flex items-center justify-center p-10"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>}>
                <Card>
                    <CardHeader>
                        <div className="flex justify-between items-center">
                            <div className="flex items-center gap-3">
                                <ImageIcon className="h-8 w-8 text-primary" />
                                <div>
                                    <CardTitle>Editor de Imágenes en Lote</CardTitle>
                                    <CardDescription>Reemplaza las imágenes de los elementos seleccionados.</CardDescription>
                                </div>
                            </div>
                            <Button variant="outline" onClick={() => router.back()}>
                                <ArrowLeft className="mr-2 h-4 w-4" /> Volver
                            </Button>
                        </div>
                    </CardHeader>
                    <CardContent>
                        <BatchImageEditor />
                    </CardContent>
                </Card>
            </Suspense>
        </div>
    )
}
