
// This is a new file for the batch image editor.
"use client";

import React, { useEffect, useState, Suspense, useCallback } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Loader2, ArrowLeft, Image as ImageIcon, Replace } from 'lucide-react';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { ScrollArea } from '@/components/ui/scroll-area';
import NextImage from 'next/image';
import { useToast } from '@/hooks/use-toast';
import { auth } from '@/lib/firebase';
import type { ContentImage } from '@/lib/types';
import { Progress } from '@/components/ui/progress';

interface GroupedContent {
  id: number;
  title: string;
  images: ContentImage[];
}

interface ReplaceImageDialogState {
    open: boolean;
    oldImageSrc: string | null;
    newImageFile: File | null;
    postId: number | null;
    postType: string | null;
}

interface UploadProgress {
  status: 'idle' | 'uploading' | 'updating' | 'error';
  message: string;
  progress: number;
}


function BatchImageEditor() {
    const router = useRouter();
    const searchParams = useSearchParams();
    const { toast } = useToast();

    const [groupedContent, setGroupedContent] = useState<GroupedContent[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [isReplacing, setIsReplacing] = useState(false);
    const [uploadProgress, setUploadProgress] = useState<UploadProgress>({ status: 'idle', message: '', progress: 0 });
    
    const [replaceDialogState, setReplaceDialogState] = useState<ReplaceImageDialogState>({
        open: false, oldImageSrc: null, newImageFile: null, postId: null, postType: null
    });

    const ids = searchParams.get('ids');
    const type = searchParams.get('type');

    useEffect(() => {
        const fetchBatchData = async () => {
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
        };
        fetchBatchData();
    }, [ids, type]);
    
    const handleReplaceImage = async () => {
        const { oldImageSrc, newImageFile, postId, postType } = replaceDialogState;
        if (!oldImageSrc || !newImageFile || !postId || !postType) {
            toast({ title: 'Error', description: 'Faltan datos para reemplazar la imagen.', variant: 'destructive' });
            return;
        }
        setIsReplacing(true);
        setUploadProgress({ status: 'uploading', message: 'Subiendo nueva imagen...', progress: 25 });
        try {
            const user = auth.currentUser; if (!user) throw new Error("No autenticado.");
            const token = await user.getIdToken();
            
            const formData = new FormData();
            formData.append('newImageFile', newImageFile);
            formData.append('postId', postId.toString());
            formData.append('postType', postType);
            formData.append('oldImageUrl', oldImageSrc);
            
            const response = await fetch('/api/wordpress/replace-image', {
                method: 'POST',
                headers: { 'Authorization': `Bearer ${token}` },
                body: formData,
            });
            setUploadProgress({ status: 'updating', message: 'Actualizando contenido de la página...', progress: 75 });
            
            const result = await response.json();
            if (!response.ok) throw new Error(result.error || 'Fallo en la API de reemplazo.');
            
            setUploadProgress({ status: 'success', message: '¡Completado!', progress: 100 });
            
            // Update state locally
            setGroupedContent(prev => prev.map(group => {
                if (group.id === postId) {
                    return {
                        ...group,
                        images: group.images.map(img => img.src === oldImageSrc ? { ...img, src: result.newImageUrl, alt: result.newImageAlt } : img),
                    };
                }
                return group;
            }));
            
            toast({ title: 'Imagen Reemplazada', description: 'La imagen ha sido actualizada.' });
            setReplaceDialogState({ open: false, oldImageSrc: null, newImageFile: null, postId: null, postType: null });
        } catch (error: any) {
            setUploadProgress({ status: 'error', message: error.message, progress: 0 });
            toast({ title: 'Error al reemplazar', description: error.message, variant: 'destructive' });
        } finally {
            setIsReplacing(false);
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
                                                </div>
                                                <Button 
                                                    size="sm"
                                                    variant="outline"
                                                    onClick={() => setReplaceDialogState({ open: true, oldImageSrc: img.src, newImageFile: null, postId: group.id, postType: type })}
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
             <AlertDialog open={replaceDialogState.open} onOpenChange={(open) => !open && setReplaceDialogState({ open: false, oldImageSrc: null, newImageFile: null, postId: null, postType: null })}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>Reemplazar Imagen</AlertDialogTitle>
                        <AlertDialogDescription>
                            Sube una nueva imagen para reemplazar la imagen actual.
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <div className="py-4 space-y-4">
                        <div>
                            <Label htmlFor="new-image-upload">Nueva Imagen</Label>
                            <Input id="new-image-upload" type="file" accept="image/*" onChange={(e) => setReplaceDialogState(s => ({ ...s, newImageFile: e.target.files?.[0] || null }))} />
                        </div>
                        {isReplacing && (
                            <div className="space-y-2">
                                <Label>{uploadProgress.message}</Label>
                                <Progress value={uploadProgress.progress} />
                            </div>
                        )}
                    </div>
                    <AlertDialogFooter>
                        <AlertDialogCancel>Cancelar</AlertDialogCancel>
                        <AlertDialogAction onClick={handleReplaceImage} disabled={isReplacing || !replaceDialogState.newImageFile}>
                        {isReplacing && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                        Reemplazar
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
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
