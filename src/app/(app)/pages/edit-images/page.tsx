
// This is a new file for the batch image editor.
"use client";

import React, { useEffect, useState, Suspense, useCallback } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Loader2, ArrowLeft, Image as ImageIcon, Replace, Crop } from 'lucide-react';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { ScrollArea } from '@/components/ui/scroll-area';
import NextImage from 'next/image';
import { useToast } from '@/hooks/use-toast';
import { auth } from '@/lib/firebase';
import type { ContentImage } from '@/lib/types';
import { Checkbox } from '@/components/ui/checkbox';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';

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
    originalWidth: number | string;
    originalHeight: number | string;
    mediaIdToDelete: number | null;
    cropPosition: "center" | "top" | "bottom" | "left" | "right";
    isCropEnabled: boolean;
}

function BatchImageEditor() {
    const router = useRouter();
    const searchParams = useSearchParams();
    const { toast } = useToast();

    const [groupedContent, setGroupedContent] = useState<GroupedContent[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [isReplacing, setIsReplacing] = useState(false);
    
    const [replaceDialogState, setReplaceDialogState] = useState<ReplaceImageDialogState>({
        open: false, oldImageSrc: null, newImageFile: null, postId: null, postType: null,
        originalWidth: '', originalHeight: '', mediaIdToDelete: null, cropPosition: 'center', isCropEnabled: true
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
    
    const handleReplaceImage = async () => {
        const { oldImageSrc, newImageFile, postId, postType, originalWidth, originalHeight, mediaIdToDelete, cropPosition, isCropEnabled } = replaceDialogState;
        if (!oldImageSrc || !newImageFile || !postId || !postType) {
            toast({ title: 'Error', description: 'Faltan datos para reemplazar la imagen.', variant: 'destructive' });
            return;
        }
        setIsReplacing(true);
        try {
            const user = auth.currentUser; if (!user) throw new Error("No autenticado.");
            const token = await user.getIdToken();
            
            const formData = new FormData();
            formData.append('newImageFile', newImageFile);
            formData.append('postId', postId.toString());
            formData.append('postType', postType);
            formData.append('oldImageUrl', oldImageSrc);
            
            // Append crop data ONLY if the checkbox is enabled
            if (isCropEnabled) {
              if (originalWidth) formData.append('width', String(originalWidth));
              if (originalHeight) formData.append('height', String(originalHeight));
              formData.append('cropPosition', cropPosition);
            }
            
            if (mediaIdToDelete) formData.append('mediaIdToDelete', String(mediaIdToDelete));
            
            const response = await fetch('/api/wordpress/replace-image', {
                method: 'POST',
                headers: { 'Authorization': `Bearer ${token}` },
                body: formData,
            });
            const result = await response.json();
            if (!response.ok) throw new Error(result.error || 'Fallo en la API de reemplazo.');
            
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
            setReplaceDialogState({ open: false, oldImageSrc: null, newImageFile: null, postId: null, postType: null, originalWidth: '', originalHeight: '', mediaIdToDelete: null, cropPosition: 'center', isCropEnabled: true });
        } catch (error: any) {
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
                                                     <p className="text-xs text-muted-foreground">Tamaño: <span className="font-mono">{img.width && img.height ? `${img.width}x${img.height}px` : 'N/A'}</span></p>
                                                </div>
                                                <Button 
                                                    size="sm"
                                                    variant="outline"
                                                    onClick={() => setReplaceDialogState({ open: true, oldImageSrc: img.src, newImageFile: null, postId: group.id, postType: type, originalWidth: img.width || '', originalHeight: img.height || '', mediaIdToDelete: img.mediaId, cropPosition: 'center', isCropEnabled: true })}
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
             <AlertDialog open={replaceDialogState.open} onOpenChange={(open) => !isReplacing && setReplaceDialogState({ open: false, oldImageSrc: null, newImageFile: null, postId: null, postType: null, originalWidth: '', originalHeight: '', mediaIdToDelete: null, cropPosition: 'center', isCropEnabled: true })}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>Reemplazar Imagen</AlertDialogTitle>
                        <AlertDialogDescription>
                            Sube una nueva imagen para reemplazar la actual. La antigua será eliminada de la biblioteca de medios.
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                     <div className="py-4 space-y-4">
                        <div>
                        <Label htmlFor="new-image-upload">Nueva Imagen</Label>
                        <Input id="new-image-upload" type="file" accept="image/*" onChange={(e) => setReplaceDialogState(s => ({ ...s, newImageFile: e.target.files?.[0] || null }))} disabled={isReplacing} />
                        </div>
                        
                        <div className="space-y-3 pt-4 border-t">
                            <div className="flex items-center space-x-2">
                                <Checkbox id="enable-crop" checked={replaceDialogState.isCropEnabled} onCheckedChange={(checked) => setReplaceDialogState(s => ({ ...s, isCropEnabled: !!checked }))} disabled={isReplacing}/>
                                <Label htmlFor="enable-crop" className="flex items-center gap-2 font-semibold cursor-pointer"><Crop className="h-4 w-4"/>Recortar imagen</Label>
                            </div>
                            <p className="text-xs text-muted-foreground mt-1 pl-6">Si se desactiva, la imagen se subirá con sus dimensiones originales, solo se aplicará compresión.</p>

                            <div className="grid grid-cols-2 gap-4">
                            <div>
                                <Label htmlFor="img-width">Ancho (px)</Label>
                                <Input id="img-width" type="number" value={replaceDialogState.originalWidth} onChange={(e) => setReplaceDialogState(s => ({ ...s, originalWidth: e.target.value }))} placeholder="Auto" disabled={isReplacing || !replaceDialogState.isCropEnabled}/>
                            </div>
                            <div>
                                <Label htmlFor="img-height">Alto (px)</Label>
                                <Input id="img-height" type="number" value={replaceDialogState.originalHeight} onChange={(e) => setReplaceDialogState(s => ({ ...s, originalHeight: e.target.value }))} placeholder="Auto" disabled={isReplacing || !replaceDialogState.isCropEnabled}/>
                            </div>
                            </div>
                            <p className="text-xs text-muted-foreground mt-1">La nueva imagen se recortará a estas dimensiones. Déjalos en blanco para usar las dimensiones de la imagen antigua.</p>
                        </div>
                        <div className="space-y-2">
                            <Label>Enfoque del Recorte</Label>
                            <RadioGroup defaultValue="center" value={replaceDialogState.cropPosition} onValueChange={(value) => setReplaceDialogState(s => ({ ...s, cropPosition: value as any }))} className="flex flex-wrap gap-x-4 gap-y-2" disabled={isReplacing || !replaceDialogState.isCropEnabled}>
                                <div className="flex items-center space-x-2"><RadioGroupItem value="center" id="crop-center" /><Label htmlFor="crop-center" className="font-normal">Centro</Label></div>
                                <div className="flex items-center space-x-2"><RadioGroupItem value="top" id="crop-top" /><Label htmlFor="crop-top" className="font-normal">Arriba</Label></div>
                                <div className="flex items-center space-x-2"><RadioGroupItem value="bottom" id="crop-bottom" /><Label htmlFor="crop-bottom" className="font-normal">Abajo</Label></div>
                                <div className="flex items-center space-x-2"><RadioGroupItem value="left" id="crop-left" /><Label htmlFor="crop-left" className="font-normal">Izquierda</Label></div>
                                <div className="flex items-center space-x-2"><RadioGroupItem value="right" id="crop-right" /><Label htmlFor="crop-right" className="font-normal">Derecha</Label></div>
                            </RadioGroup>
                        </div>
                    </div>
                    <AlertDialogFooter>
                        <AlertDialogCancel onClick={() => { if (!isReplacing) setReplaceDialogState({ ...replaceDialogState, open: false }) }} disabled={isReplacing}>Cancelar</AlertDialogCancel>
                        <AlertDialogAction onClick={handleReplaceImage} disabled={isReplacing || !replaceDialogState.newImageFile}>
                        {isReplacing && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                        {isReplacing ? 'Procesando...' : 'Reemplazar'}
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
