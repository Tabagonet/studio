
"use client";

import React, { useCallback, useState } from 'react';
import { useDropzone } from 'react-dropzone';
import { v4 as uuidv4 } from 'uuid';
import Image from 'next/image';
import { UploadCloud, X, Loader2, Star, GripVertical } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { useToast } from '@/hooks/use-toast';
import type { ProductPhoto } from '@/lib/types';
import { cn } from '@/lib/utils';

interface ImageUploaderProps {
  photos: ProductPhoto[];
  onPhotosChange: (photos: ProductPhoto[]) => void;
}

export function ImageUploader({ photos, onPhotosChange }: ImageUploaderProps) {
  const { toast } = useToast();
  const [uploadProgress, setUploadProgress] = useState<Record<string, number>>({});

  const onDrop = useCallback((acceptedFiles: File[]) => {
    const newPhotos: ProductPhoto[] = acceptedFiles.map(file => ({
      id: uuidv4(),
      file: file,
      name: file.name,
      previewUrl: URL.createObjectURL(file),
      isPrimary: photos.length === 0, // Mark first one as primary
    }));

    const updatedPhotos = [...photos, ...newPhotos];
    onPhotosChange(updatedPhotos);
    
    // Automatically upload new photos
    newPhotos.forEach(photo => handleUpload(photo));
  }, [photos, onPhotosChange]);

  const handleUpload = async (photoToUpload: ProductPhoto) => {
    if (!photoToUpload.file) return;

    const formData = new FormData();
    formData.append('file', photoToUpload.file);

    try {
      const response = await fetch('/api/upload-image', {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Upload failed');
      }

      const { url, storagePath } = await response.json();

      onPhotosChange(
        photos.map(p => 
          p.id === photoToUpload.id 
            ? { ...p, url, storagePath, file: undefined } // Remove file object after upload
            : p
        )
      );

      toast({ title: "Imagen Subida", description: `${photoToUpload.name} se ha subido correctamente.` });

    } catch (error) {
      console.error('Upload error:', error);
      toast({
        title: "Error de Subida",
        description: `No se pudo subir ${photoToUpload.name}.`,
        variant: "destructive",
      });
      // Remove failed upload from the list
      onPhotosChange(photos.filter(p => p.id !== photoToUpload.id));
    }
  };

  const handleDelete = async (photoToDelete: ProductPhoto) => {
    // Optimistically remove from UI
    const updatedPhotos = photos.filter(p => p.id !== photoToDelete.id);
    onPhotosChange(updatedPhotos);

    toast({ title: "Imagen Eliminada", description: `${photoToDelete.name} ha sido eliminada.` });

    if (photoToDelete.storagePath) {
      try {
        await fetch('/api/delete-image', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ storagePath: photoToDelete.storagePath }),
        });
      } catch (error) {
        console.error('Error deleting from storage:', error);
        // Optionally add it back to the list if server deletion fails
        // onPhotosChange(photos);
        toast({
          title: "Error en el Servidor",
          description: `No se pudo eliminar la imagen del almacenamiento.`,
          variant: "destructive",
        });
      }
    }
  };
  
  const setAsPrimary = (id: string) => {
    const updatedPhotos = photos.map(p => ({
        ...p,
        isPrimary: p.id === id
    }));
    // Ensure the primary photo is first in the array
    const primaryPhoto = updatedPhotos.find(p => p.isPrimary);
    const otherPhotos = updatedPhotos.filter(p => !p.isPrimary);
    onPhotosChange(primaryPhoto ? [primaryPhoto, ...otherPhotos] : otherPhotos);
  };

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: { 'image/*': ['.jpeg', '.jpg', '.png', '.webp'] },
  });

  return (
    <div className="space-y-4">
      <div
        {...getRootProps()}
        className={cn(
          "flex flex-col items-center justify-center p-8 border-2 border-dashed rounded-lg cursor-pointer transition-colors",
          isDragActive ? "border-primary bg-primary/10" : "border-border hover:border-primary/50"
        )}
      >
        <input {...getInputProps()} />
        <UploadCloud className="h-12 w-12 text-muted-foreground" />
        <p className="mt-4 text-lg font-semibold">
          {isDragActive ? 'Suelta las imágenes aquí' : 'Arrastra y suelta imágenes, o haz clic para seleccionar'}
        </p>
        <p className="text-sm text-muted-foreground">Recomendado: Imágenes de hasta 5MB</p>
      </div>

      {photos.length > 0 && (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
          {photos.map((photo, index) => (
            <div key={photo.id} className="relative group border rounded-lg overflow-hidden shadow-sm">
              <Image
                src={photo.previewUrl}
                alt={`Vista previa de ${photo.name}`}
                width={200}
                height={200}
                className="w-full h-40 object-cover"
                onLoad={() => URL.revokeObjectURL(photo.previewUrl)} // Clean up object URL
              />

              {/* Overlay with actions */}
              <div className="absolute inset-0 bg-black/40 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                <Button variant="ghost" size="icon" onClick={() => setAsPrimary(photo.id)} title="Marcar como principal">
                  <Star className={cn("h-5 w-5 text-white", photo.isPrimary && "fill-yellow-400 text-yellow-400")}/>
                </Button>
                <Button variant="ghost" size="icon" onClick={() => handleDelete(photo)} title="Eliminar imagen">
                   <X className="h-5 w-5 text-destructive" />
                </Button>
              </div>

               {/* Primary indicator */}
               {photo.isPrimary && (
                 <div className="absolute top-2 left-2 bg-primary text-primary-foreground text-xs font-bold px-2 py-1 rounded">
                    PRINCIPAL
                 </div>
               )}

              {/* Loading indicator */}
              {photo.file && (
                <div className="absolute bottom-0 left-0 right-0 p-2 bg-background/80">
                  <div className="flex items-center gap-2">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    <span className="text-xs">Subiendo...</span>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
