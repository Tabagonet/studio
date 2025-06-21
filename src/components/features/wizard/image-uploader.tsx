
"use client";

import React, { useCallback, useMemo } from 'react';
import { useDropzone } from 'react-dropzone';
import { v4 as uuidv4 } from 'uuid';
import Image from 'next/image';
import { UploadCloud, X, Loader2, Star } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import type { ProductPhoto } from '@/lib/types';
import { cn } from '@/lib/utils';
import { auth } from '@/lib/firebase';

interface ImageUploaderProps {
  photos: ProductPhoto[];
  onPhotosChange: (photos: ProductPhoto[]) => void;
}

export function ImageUploader({ photos: photosProp, onPhotosChange }: ImageUploaderProps) {
  const { toast } = useToast();

  const photos = useMemo(() => (Array.isArray(photosProp) ? photosProp : []), [photosProp]);

  const handleUpload = useCallback(async (photoToUpload: ProductPhoto) => {
    if (!photoToUpload.file) return;

    const user = auth.currentUser;
    if (!user) {
      toast({ title: "Error de Autenticación", description: "Debes iniciar sesión para subir imágenes.", variant: "destructive" });
      const photosWithoutFailed = photos.filter(p => p.id !== photoToUpload.id);
      onPhotosChange(photosWithoutFailed);
      return;
    }

    const token = await user.getIdToken();
    const formData = new FormData();
    formData.append('imagen', photoToUpload.file);

    try {
      const response = await fetch('/api/upload-image', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}` },
        body: formData,
      });

      const result = await response.json();

      if (!response.ok || !result.success) {
        throw new Error(result.error || 'La subida ha fallado');
      }
      
      const updatedPhotosWithUrl = photos.map(p =>
        p.id === photoToUpload.id
          ? { ...p, url: result.url, file: undefined }
          : p
      );
      onPhotosChange(updatedPhotosWithUrl);

      toast({ title: "Imagen Subida", description: `${photoToUpload.name} se ha subido correctamente.` });

    } catch (error) {
      console.error('Upload error:', error);
      toast({
        title: "Error de Subida",
        description: `No se pudo subir ${photoToUpload.name}. ${(error as Error).message}`,
        variant: "destructive",
      });
      const photosWithoutFailed = photos.filter(p => p.id !== photoToUpload.id);
      onPhotosChange(photosWithoutFailed);
    }
  }, [onPhotosChange, toast, photos]);

  const onDrop = useCallback((acceptedFiles: File[]) => {
    const newPhotos: ProductPhoto[] = acceptedFiles.map(file => ({
      id: uuidv4(),
      file: file,
      name: file.name,
      previewUrl: URL.createObjectURL(file),
      isPrimary: false,
    }));

    const combinedPhotos = [...photos, ...newPhotos];
    if (combinedPhotos.filter(p => p.isPrimary).length === 0 && combinedPhotos.length > 0) {
        combinedPhotos[0].isPrimary = true;
    }

    onPhotosChange(combinedPhotos);
    
    newPhotos.forEach(photo => handleUpload(photo));
  }, [photos, onPhotosChange, handleUpload]);

  const handleDelete = useCallback(async (photoToDelete: ProductPhoto) => {
    const remainingPhotos = photos.filter(p => p.id !== photoToDelete.id);
    
    if (photoToDelete.isPrimary && remainingPhotos.length > 0) {
        remainingPhotos[0].isPrimary = true;
    }
    onPhotosChange(remainingPhotos);

    toast({ title: "Imagen Eliminada", description: `${photoToDelete.name} ha sido eliminada.` });

    if (photoToDelete.url) {
      const user = auth.currentUser;
      if (!user) {
        toast({ title: "Error de Autenticación", description: "Sesión expirada. No se pudo eliminar del servidor.", variant: "destructive" });
        return;
      }
      const token = await user.getIdToken();

      try {
        const response = await fetch('/api/delete-image', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`,
           },
          body: JSON.stringify({ imageUrl: photoToDelete.url }),
        });

        const result = await response.json();
        if (!response.ok || !result.success) {
            throw new Error(result.error || "No se pudo eliminar la imagen del servidor.");
        }

      } catch (error) {
        console.error('Error deleting from storage:', error);
        onPhotosChange(photos); 
        toast({
          title: "Error en el Servidor",
          description: `No se pudo eliminar la imagen del almacenamiento. ${(error as Error).message}`,
          variant: "destructive",
        });
      }
    }
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
        <p className="text-sm text-muted-foreground">Admitidos: JPG, PNG, GIF, WEBP</p>
      </div>

      {photos.length > 0 && (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
          {photos.map((photo) => (
            <div key={photo.id} className="relative group border rounded-lg overflow-hidden shadow-sm">
              <Image
                src={photo.url || photo.previewUrl}
                alt={`Vista previa de ${photo.name}`}
                width={200}
                height={200}
                className="w-full h-40 object-cover"
                onLoad={() => { if (photo.previewUrl && photo.previewUrl.startsWith('blob:')) URL.revokeObjectURL(photo.previewUrl)}}
              />

              <div className="absolute inset-0 bg-black/40 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                <Button variant="ghost" size="icon" onClick={() => setAsPrimary(photo.id)} title="Marcar como principal">
                  <Star className={cn("h-5 w-5 text-white", photo.isPrimary && "fill-yellow-400 text-yellow-400")}/>
                </Button>
                <Button variant="ghost" size="icon" onClick={() => handleDelete(photo)} title="Eliminar imagen">
                   <X className="h-5 w-5 text-destructive" />
                </Button>
              </div>

               {photo.isPrimary && (
                 <div className="absolute top-2 left-2 bg-primary text-primary-foreground text-xs font-bold px-2 py-1 rounded">
                    PRINCIPAL
                 </div>
               )}

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
