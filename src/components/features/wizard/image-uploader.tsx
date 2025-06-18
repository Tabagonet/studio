
// src/components/features/wizard/image-uploader.tsx
"use client";

import React, { useCallback, useState, useEffect } from 'react';
import { useDropzone, type FileWithPath } from 'react-dropzone';
import { UploadCloud, Image as ImageIconLucide, XCircle, CheckCircle } from 'lucide-react';
import NextImage from 'next/image';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useToast } from '@/hooks/use-toast';
import type { ProductPhoto } from '@/lib/types';
import { ALLOWED_MIME_TYPES_API_UPLOAD_LOCAL, MAX_FILE_SIZE_BYTES_API_UPLOAD_LOCAL } from '@/lib/local-storage-constants';

interface ImageUploaderProps {
  photos: ProductPhoto[];
  onPhotosChange: (photos: ProductPhoto[]) => void;
  maxFiles?: number;
  maxSizeMB?: number; // kept for consistency, but constants file will be primary
}

export function ImageUploader({
  photos,
  onPhotosChange,
  maxFiles = 50,
  maxSizeMB = MAX_FILE_SIZE_BYTES_API_UPLOAD_LOCAL / (1024*1024), // Use constant
}: ImageUploaderProps) {
  const { toast } = useToast();
  const [fileErrors, setFileErrors] = useState<Record<string, string[]>>({});
  // Upload progress is now conceptual for client-side, actual upload to server happens later
  const [conceptualProgress, setConceptualProgress] = useState<Record<string, number>>({});


  const onDrop = useCallback((acceptedFiles: FileWithPath[], rejectedFiles: any[]) => {
    const newFileErrors: Record<string, string[]> = {};
    
    rejectedFiles.forEach(rejectedFile => {
      const path = rejectedFile.file.path ?? rejectedFile.file.name;
      newFileErrors[path] = rejectedFile.errors.map((e: any) => {
        if (e.code === "file-too-large") return `Archivo excede ${maxSizeMB}MB.`;
        if (e.code === "file-invalid-type") return `Formato de archivo no válido. Permitidos: ${ALLOWED_MIME_TYPES_API_UPLOAD_LOCAL.join(', ')}.`;
        if (e.code === "too-many-files") return `No puedes subir más de ${maxFiles} archivos.`;
        return e.message;
      });
    });

    const validAcceptedFiles = acceptedFiles.filter(file => {
      const path = file.path ?? file.name;
      let isValid = true;
      const errors: string[] = [];

      if (!ALLOWED_MIME_TYPES_API_UPLOAD_LOCAL.includes(file.type)) {
        errors.push(`Formato no válido. Permitidos: ${ALLOWED_MIME_TYPES_API_UPLOAD_LOCAL.join(', ')}.`);
        isValid = false;
      }
      
      if (!isValid) {
        newFileErrors[path] = errors;
      }
      return isValid;
    });
    
    setFileErrors(prev => ({...prev, ...newFileErrors}));

    const newPhotos: ProductPhoto[] = validAcceptedFiles.map((file, index) => ({
      id: `${file.name}-${Date.now()}`, // Unique ID for client-side tracking
      file,
      previewUrl: URL.createObjectURL(file), // For client-side preview
      name: file.name,
      isPrimary: photos.length === 0 && index === 0,
      // localPath will be set after successful upload to /api/upload-image-local
    }));

    if (photos.length + newPhotos.length > maxFiles) {
        toast({
            title: "Límite de Archivos Excedido",
            description: `Solo puedes subir hasta ${maxFiles} imágenes. ${newPhotos.length - (maxFiles - photos.length)} archivos no fueron añadidos.`,
            variant: "destructive",
        });
        onPhotosChange([...photos, ...newPhotos.slice(0, maxFiles - photos.length)]);
    } else {
        onPhotosChange([...photos, ...newPhotos]);
    }

    // Simulate conceptual progress for UI feedback
    newPhotos.forEach(p => {
      setConceptualProgress(prev => ({ ...prev, [p.id]: 0 }));
      setTimeout(() => setConceptualProgress(prev => ({ ...prev, [p.id]: 100 })), 100); 
    });

  }, [photos, onPhotosChange, maxFiles, maxSizeMB, toast]);

  // Create accept object dynamically from ALLOWED_MIME_TYPES_API_UPLOAD_LOCAL
  const acceptObject = ALLOWED_MIME_TYPES_API_UPLOAD_LOCAL.reduce((acc, mimeType) => {
    const extensions = mimeType.split('/')[1].split('+')[0]; // e.g. jpeg, png, webp
    if (extensions === 'jpeg') { // common case
        acc[mimeType] = ['.jpg', '.jpeg'];
    } else {
        acc[mimeType] = [`.${extensions}`];
    }
    return acc;
  }, {} as Record<string, string[]>);


  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: acceptObject, 
    maxSize: MAX_FILE_SIZE_BYTES_API_UPLOAD_LOCAL,
    maxFiles: photos.length >= maxFiles ? 0 : maxFiles - photos.length,
    disabled: photos.length >= maxFiles,
  });

  const removePhoto = (id: string) => {
    const photoToRemove = photos.find(p => p.id === id);
    if (photoToRemove && photoToRemove.previewUrl) URL.revokeObjectURL(photoToRemove.previewUrl);
    
    const updatedPhotos = photos.filter(p => p.id !== id);
    // If primary photo is removed, set a new primary if possible
    if (photoToRemove?.isPrimary && updatedPhotos.length > 0 && !updatedPhotos.some(p => p.isPrimary)) {
        updatedPhotos[0].isPrimary = true;
    }
    onPhotosChange(updatedPhotos);

    setConceptualProgress(prev => {
        const newState = {...prev};
        delete newState[id];
        return newState;
    });
    // If there's a localPath associated, it means it was uploaded to server's tmp
    // We might need a way to tell the server to delete it from tmp if user removes it here
    // For now, backend cleanup will handle stale tmp files.
  };

  const setPrimaryPhoto = (id: string) => {
    onPhotosChange(photos.map(p => ({ ...p, isPrimary: p.id === id })));
  };
  
  useEffect(() => {
    return () => photos.forEach(photo => {
        if (photo.previewUrl) URL.revokeObjectURL(photo.previewUrl);
    });
  }, []);

  return (
    <div className="space-y-4">
      <div
        {...getRootProps()}
        className={`p-8 border-2 border-dashed rounded-lg text-center cursor-pointer transition-colors
                    ${isDragActive ? 'border-primary bg-primary/10' : 'border-border hover:border-primary/70'}
                    ${photos.length >= maxFiles ? 'opacity-50 cursor-not-allowed' : ''}`}
      >
        <input {...getInputProps()} />
        <UploadCloud className="mx-auto h-12 w-12 text-muted-foreground mb-2" />
        {isDragActive ? (
          <p className="text-primary">Suelta las imágenes aquí...</p>
        ) : (
          <p className="text-muted-foreground">
            Arrastra y suelta imágenes aquí, o haz clic para seleccionar.
            <br />
            <span className="text-xs">(Formatos: {ALLOWED_MIME_TYPES_API_UPLOAD_LOCAL.map(m=>m.split('/')[1]).join(', ')}, máx ${maxFiles} archivos, hasta ${maxSizeMB}MB c/u)</span>
          </p>
        )}
      </div>

      {Object.keys(fileErrors).length > 0 && (
         <div className="space-y-1 mt-2">
            {Object.entries(fileErrors).map(([fileName, errorMessages]) => (
                <div key={fileName} className="text-xs text-destructive bg-destructive/10 p-2 rounded-md">
                    <strong>{fileName}:</strong> {Array.isArray(errorMessages) ? errorMessages.join(", ") : errorMessages}
                </div>
            ))}
        </div>
      )}

      {photos.length > 0 && (
        <ScrollArea className="h-72 w-full rounded-md border p-4">
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
            {photos.map(photo => (
              <div key={photo.id} className="relative group aspect-square border rounded-md overflow-hidden shadow-sm">
                <NextImage 
                    src={photo.previewUrl} // Always use blob preview URL for client display
                    alt={photo.name} 
                    fill
                    className="object-cover"
                    data-ai-hint="product photo"
                    unoptimized={true} 
                    sizes="(max-width: 640px) 50vw, (max-width: 768px) 33vw, 25vw"
                />
                <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex flex-col items-center justify-center p-2 space-y-1">
                  <Button variant="destructive" size="icon" className="h-7 w-7 absolute top-1 right-1" onClick={() => removePhoto(photo.id)}>
                    <XCircle className="h-4 w-4" />
                  </Button>
                  <Button 
                    variant={photo.isPrimary ? "default" : "secondary"} 
                    size="sm" 
                    className="text-xs h-7 px-2" 
                    onClick={() => setPrimaryPhoto(photo.id)}
                    disabled={photo.isPrimary}
                  >
                    {photo.isPrimary ? <CheckCircle className="h-4 w-4 mr-1"/> : <ImageIconLucide className="h-4 w-4 mr-1"/>}
                    {photo.isPrimary ? "Principal" : "Hacer Principal"}
                  </Button>
                </div>
                {conceptualProgress[photo.id] !== undefined && conceptualProgress[photo.id] < 100 && (
                  <Progress value={conceptualProgress[photo.id]} className="absolute bottom-0 left-0 right-0 h-1 rounded-none" />
                )}
                {photo.isPrimary && (
                    <div className="absolute top-1 left-1 bg-primary text-primary-foreground text-xs px-1.5 py-0.5 rounded-sm">Principal</div>
                )}
              </div>
            ))}
          </div>
        </ScrollArea>
      )}
    </div>
  );
}
