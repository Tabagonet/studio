
"use client";

import React, { useCallback } from 'react';
import { useDropzone } from 'react-dropzone';
import { v4 as uuidv4 } from 'uuid';
import Image from 'next/image';
import { UploadCloud, X, Star, CheckCircle, AlertTriangle, Clock } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import type { ProductPhoto } from '@/lib/types';
import { cn } from '@/lib/utils';
import { Progress } from '@/components/ui/progress';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';

interface ImageUploaderProps {
  photos: ProductPhoto[];
  onPhotosChange: (photos: ProductPhoto[]) => void;
  isProcessing: boolean;
  maxPhotos?: number;
}

export function ImageUploader({ photos = [], onPhotosChange, isProcessing, maxPhotos = 10 }: ImageUploaderProps) {
  const { toast } = useToast();

  const onDrop = useCallback((acceptedFiles: File[]) => {
    const newPhotos: ProductPhoto[] = acceptedFiles.map(file => ({
      id: uuidv4(),
      file: file,
      name: file.name,
      previewUrl: URL.createObjectURL(file),
      isPrimary: false,
      status: 'pending',
      progress: 0,
    }));

    const currentPhotos = maxPhotos === 1 ? [] : photos;
    const combinedPhotos = [...currentPhotos, ...newPhotos].slice(0, maxPhotos);

    if (combinedPhotos.length > 0 && !combinedPhotos.some(p => p.isPrimary)) {
        combinedPhotos[0].isPrimary = true;
    }

    onPhotosChange(combinedPhotos);
  }, [photos, onPhotosChange, maxPhotos]);

  const handleDelete = useCallback((photoToDelete: ProductPhoto) => {
    if (photoToDelete.previewUrl.startsWith('blob:')) {
      URL.revokeObjectURL(photoToDelete.previewUrl);
    }
    const remainingPhotos = photos.filter(p => p.id !== photoToDelete.id);
    if (photoToDelete.isPrimary && remainingPhotos.length > 0 && !remainingPhotos.some(p => p.isPrimary)) {
        remainingPhotos[0].isPrimary = true;
    }
    onPhotosChange(remainingPhotos);
    toast({ title: "Imagen Eliminada", description: `${photoToDelete.name} ha sido eliminada de la cola.` });
  }, [photos, onPhotosChange, toast]);
  
  const setAsPrimary = useCallback((id: string | number) => {
    const selectedPhoto = photos.find(p => p.id === id);
    if (!selectedPhoto) return;

    const otherPhotos = photos.filter(p => p.id !== id);
    const reorderedPhotos = [
      { ...selectedPhoto, isPrimary: true },
      ...otherPhotos.map(p => ({ ...p, isPrimary: false }))
    ];
    onPhotosChange(reorderedPhotos);
  }, [photos, onPhotosChange]);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: { 'image/*': ['.jpeg', '.jpg', '.png', '.webp', '.gif'] },
    disabled: isProcessing,
  });

  return (
    <div className="space-y-4">
      {photos.length < maxPhotos && (
        <div
            {...getRootProps()}
            className={cn(
            "flex flex-col items-center justify-center p-8 border-2 border-dashed rounded-lg transition-colors",
            isDragActive ? "border-primary bg-primary/10" : "border-border",
            isProcessing ? "cursor-not-allowed bg-muted/50" : "cursor-pointer hover:border-primary/50"
            )}
        >
            <input {...getInputProps()} />
            <UploadCloud className="h-12 w-12 text-muted-foreground" />
            <p className="mt-4 text-lg font-semibold">
            {isProcessing ? 'Procesando imágenes...' : isDragActive ? 'Suelta las imágenes aquí' : 'Arrastra y suelta imágenes, o haz clic'}
            </p>
            <p className="text-sm text-muted-foreground">Admitidos: JPG, PNG, GIF, WEBP</p>
        </div>
      )}


      {photos.length > 0 && (
        <TooltipProvider>
          <div className={cn(
            "gap-4",
            maxPhotos > 1 && "grid grid-cols-2 sm:grid-cols-3"
          )}>
            {photos.map((photo) => (
              <div key={photo.id} className={cn(
                "relative group border rounded-lg overflow-hidden shadow-sm bg-muted/20",
                maxPhotos === 1 ? "w-full aspect-video" : "aspect-square"
              )}>
                <Image
                  src={photo.previewUrl}
                  alt={`Vista previa de ${photo.name}`}
                  fill
                  sizes={maxPhotos === 1 ? "400px" : "(max-width: 640px) 50vw, (max-width: 768px) 33vw, 25vw"}
                  className="object-contain"
                />

                {!isProcessing && (
                  <div className="absolute inset-0 bg-black/40 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                      <Button variant="ghost" size="icon" onClick={() => setAsPrimary(photo.id)} title="Marcar como principal">
                      <Star className={cn("h-5 w-5 text-white", photo.isPrimary && "fill-yellow-400 text-yellow-400")}/>
                      </Button>
                      <Button variant="ghost" size="icon" onClick={() => handleDelete(photo)} title="Eliminar imagen">
                      <X className="h-5 w-5 text-destructive" />
                      </Button>
                  </div>
                )}

                {photo.isPrimary && (
                  <div className="absolute top-2 left-2 bg-primary text-primary-foreground text-xs font-bold px-2 py-1 rounded">
                      PRINCIPAL
                  </div>
                )}
                
                {photo.status === 'uploading' && (
                  <div className="absolute bottom-0 left-0 right-0 p-2 bg-background/90 space-y-1">
                    <p className="text-xs font-medium text-center">Subiendo: {photo.progress}%</p>
                    <Progress value={photo.progress} className="h-2" />
                  </div>
                )}

                {photo.status === 'pending' && !isProcessing && (
                    <Tooltip>
                        <TooltipTrigger className="absolute top-1 right-1">
                            <div className="bg-amber-500/90 p-1 rounded-full text-white flex items-center justify-center">
                                <Clock className="h-4 w-4" />
                            </div>
                        </TooltipTrigger>
                        <TooltipContent>
                            <p>Pendiente de subir</p>
                        </TooltipContent>
                    </Tooltip>
                )}

                
                {photo.status === 'completed' && (
                  <Tooltip>
                      <TooltipTrigger className="absolute top-1 right-1">
                          <div className="bg-green-500/90 p-1 rounded-full text-white flex items-center justify-center">
                              <CheckCircle className="h-4 w-4" />
                          </div>
                      </TooltipTrigger>
                      <TooltipContent>
                          <p>Guardada en el servidor</p>
                      </TooltipContent>
                  </Tooltip>
                )}

                {photo.status === 'error' && (
                  <Tooltip>
                      <TooltipTrigger className="absolute top-1 right-1">
                          <div className="bg-destructive/90 p-1 rounded-full text-destructive-foreground flex items-center justify-center">
                              <AlertTriangle className="h-4 w-4" />
                          </div>
                      </TooltipTrigger>
                      <TooltipContent>
                          <p>{photo.error || 'Error desconocido'}</p>
                      </TooltipContent>
                  </Tooltip>
                )}
              </div>
            ))}
          </div>
        </TooltipProvider>
      )}
    </div>
  );
}
