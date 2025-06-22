
"use client";

import React, { useCallback, useMemo } from 'react';
import { useDropzone } from 'react-dropzone';
import { v4 as uuidv4 } from 'uuid';
import Image from 'next/image';
import { UploadCloud, X, Star, CheckCircle, AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import type { ProductPhoto } from '@/lib/types';
import { cn } from '@/lib/utils';
import { Progress } from '@/components/ui/progress';

interface ImageUploaderProps {
  photos: ProductPhoto[];
  onPhotosChange: (photos: ProductPhoto[]) => void;
  isProcessing: boolean;
}

export function ImageUploader({ photos: photosProp, onPhotosChange, isProcessing }: ImageUploaderProps) {
  const { toast } = useToast();

  const photos = useMemo(() => (Array.isArray(photosProp) ? photosProp : []), [photosProp]);

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

    const combinedPhotos = [...photos, ...newPhotos];
    if (combinedPhotos.filter(p => p.isPrimary).length === 0 && combinedPhotos.length > 0) {
        combinedPhotos[0].isPrimary = true;
    }

    onPhotosChange(combinedPhotos);
  }, [photos, onPhotosChange]);

  const handleDelete = useCallback((photoToDelete: ProductPhoto) => {
    // Revoke object URL to prevent memory leaks
    if (photoToDelete.previewUrl.startsWith('blob:')) {
      URL.revokeObjectURL(photoToDelete.previewUrl);
    }
    
    const remainingPhotos = photos.filter(p => p.id !== photoToDelete.id);
    
    if (photoToDelete.isPrimary && remainingPhotos.length > 0) {
        remainingPhotos[0].isPrimary = true;
    }
    onPhotosChange(remainingPhotos);

    toast({ title: "Imagen Eliminada", description: `${photoToDelete.name} ha sido eliminada de la cola.` });

  }, [photos, onPhotosChange, toast]);
  
  const setAsPrimary = useCallback((id: string) => {
    const updatedPhotos = photos.map(p => ({
        ...p,
        isPrimary: p.id === id
    }));
    const primaryPhoto = updatedPhotos.find(p => p.isPrimary);
    const otherPhotos = updatedPhotos.filter(p => !p.isPrimary);
    onPhotosChange(primaryPhoto ? [primaryPhoto, ...otherPhotos] : otherPhotos);
  }, [photos, onPhotosChange]);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: { 'image/*': ['.jpeg', '.jpg', '.png', '.webp', '.gif'] },
    disabled: isProcessing,
  });

  return (
    <div className="space-y-4">
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

      {photos.length > 0 && (
        <div className="grid grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-4">
          {photos.map((photo) => (
            <div key={photo.id} className="relative group border rounded-lg overflow-hidden shadow-sm">
              <Image
                src={photo.previewUrl}
                alt={`Vista previa de ${photo.name}`}
                width={200}
                height={200}
                className="w-full h-32 object-cover"
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
              
              {photo.status === 'completed' && (
                <div className="absolute inset-0 bg-green-500/80 flex flex-col items-center justify-center text-white">
                  <CheckCircle className="h-8 w-8" />
                  <p className="text-sm font-bold mt-1">Subida</p>
                </div>
              )}

              {photo.status === 'error' && (
                 <div className="absolute inset-0 bg-destructive/80 flex flex-col items-center justify-center text-destructive-foreground p-2">
                  <AlertTriangle className="h-8 w-8" />
                  <p className="text-xs font-bold mt-1 text-center">{photo.error || 'Error desconocido'}</p>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
