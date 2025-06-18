
// src/components/features/wizard/image-uploader.tsx
"use client";

import React, { useCallback, useState, useEffect } from 'react';
import { useDropzone, type FileWithPath } from 'react-dropzone';
import { UploadCloud, Image as ImageIcon, XCircle, CheckCircle } from 'lucide-react';
import NextImage from 'next/image'; // Renamed to avoid conflict with component name
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useToast } from '@/hooks/use-toast';
import type { ProductPhoto } from '@/lib/types';

interface ImageUploaderProps {
  photos: ProductPhoto[];
  onPhotosChange: (photos: ProductPhoto[]) => void;
  maxFiles?: number;
  maxSizeMB?: number;
}

const isValidFileType = (file: File) => file.type === 'image/jpeg';
const isValidNamePattern = (name: string) => /^.+-\\d+\\.(jpg|jpeg)$/i.test(name);


export function ImageUploader({
  photos,
  onPhotosChange,
  maxFiles = 50,
  maxSizeMB = 2,
}: ImageUploaderProps) {
  const { toast } = useToast();
  const [fileErrors, setFileErrors] = useState<Record<string, string[]>>({});
  // uploadProgress is now less relevant for local "uploads" but kept for consistency
  // as it could represent client-side processing before sending to backend if needed.
  const [uploadProgress, setUploadProgress] = useState<Record<string, number>>({});

  const onDrop = useCallback((acceptedFiles: FileWithPath[], rejectedFiles: any[]) => {
    const newFileErrors: Record<string, string[]> = {};
    
    rejectedFiles.forEach(rejectedFile => {
      const path = rejectedFile.file.path ?? rejectedFile.file.name;
      newFileErrors[path] = rejectedFile.errors.map((e: any) => {
        if (e.code === "file-too-large") return \`Archivo excede \${maxSizeMB}MB.\`;
        if (e.code === "file-invalid-type") return "Formato de archivo no válido. Solo se permiten archivos JPG/JPEG.";
        if (e.code === "too-many-files") return \`No puedes subir más de \${maxFiles} archivos.\`;
        return e.message;
      });
    });

    const validAcceptedFiles = acceptedFiles.filter(file => {
      const path = file.path ?? file.name;
      let isValid = true;
      const errors: string[] = [];

      if (!isValidFileType(file)) {
        errors.push("Formato no válido (solo JPG/JPEG).");
        isValid = false;
      }
      
      // Name pattern check can be less strict now or removed if local saving handles names differently
      // For now, kept for consistency with batch processing naming convention idea
      // if (!isValidNamePattern(file.name)) {
      //   errors.push("Nombre de archivo no sigue el patrón 'NombreProducto-Numero.jpg' (ej: MiProducto-123.jpg).");
      //   isValid = false;
      // }

      if (!isValid) {
        newFileErrors[path] = errors;
      }
      return isValid;
    });
    
    setFileErrors(prev => ({...prev, ...newFileErrors}));

    const newPhotos: ProductPhoto[] = validAcceptedFiles.map((file, index) => ({
      id: \`\${file.name}-\${Date.now()}\`,
      file,
      previewUrl: URL.createObjectURL(file), // Still useful for client-side preview before sending to backend
      name: file.name,
      isPrimary: photos.length === 0 && index === 0, 
    }));

    if (photos.length + newPhotos.length > maxFiles) {
        toast({
            title: "Límite de Archivos Excedido",
            description: \`Solo puedes subir hasta \${maxFiles} imágenes. \${newPhotos.length - (maxFiles - photos.length)} archivos no fueron añadidos.\`,
            variant: "destructive",
        });
        onPhotosChange([...photos, ...newPhotos.slice(0, maxFiles - photos.length)]);
    } else {
        onPhotosChange([...photos, ...newPhotos]);
    }

    // Simulate some client-side readiness or quick processing for progress
    newPhotos.forEach(p => {
      setUploadProgress(prev => ({ ...prev, [p.id]: 0 }));
      // For local "upload", progress is more about readiness or hypothetical client processing
      // Here, just set to 100 quickly as the actual "upload" is to the backend via fetch
      setTimeout(() => setUploadProgress(prev => ({ ...prev, [p.id]: 100 })), 100);
    });

  }, [photos, onPhotosChange, maxFiles, maxSizeMB, toast]);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: { 'image/jpeg': ['.jpg', '.jpeg'] }, 
    maxSize: maxSizeMB * 1024 * 1024,
    maxFiles: maxFiles - photos.length, // This might need adjustment if maxFiles isn't strict per drop
    disabled: photos.length >= maxFiles,
  });

  const removePhoto = (id: string) => {
    const photoToRemove = photos.find(p => p.id === id);
    if (photoToRemove) URL.revokeObjectURL(photoToRemove.previewUrl);
    onPhotosChange(photos.filter(p => p.id !== id));
    setUploadProgress(prev => {
        const newState = {...prev};
        delete newState[id];
        return newState;
    });
  };

  const setPrimaryPhoto = (id: string) => {
    onPhotosChange(photos.map(p => ({ ...p, isPrimary: p.id === id })));
  };
  
  useEffect(() => {
    // Revoke object URLs on component unmount or when photos change
    return () => photos.forEach(photo => URL.revokeObjectURL(photo.previewUrl));
  }, [photos]);

  return (
    <div className="space-y-4">
      <div
        {...getRootProps()}
        className={\`p-8 border-2 border-dashed rounded-lg text-center cursor-pointer transition-colors
                    \${isDragActive ? 'border-primary bg-primary/10' : 'border-border hover:border-primary/70'}
                    \${photos.length >= maxFiles ? 'opacity-50 cursor-not-allowed' : ''}\`}
      >
        <input {...getInputProps()} />
        <UploadCloud className="mx-auto h-12 w-12 text-muted-foreground mb-2" />
        {isDragActive ? (
          <p className="text-primary">Suelta las imágenes JPG aquí...</p>
        ) : (
          <p className="text-muted-foreground">
            Arrastra y suelta imágenes aquí, o haz clic para seleccionar.
            <br />
            <span className="text-xs">(Solo JPG/JPEG, máx \${maxFiles} archivos, hasta \${maxSizeMB}MB c/u)</span>
            {/* Removing strict name pattern message as it might be confusing for general uploader now
            <br />
            <span className="text-xs text-accent-foreground/80">Patrón de nombre requerido: <code className="bg-muted px-1 py-0.5 rounded-sm font-code">NombreProducto-NUMERO.jpg</code> (ej: <code className="bg-muted px-1 py-0.5 rounded-sm font-code">CamisetaAzul-1.jpg</code>)</span>
            */}
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
                {/* Use NextImage for optimized image rendering if photos.localPath points to public served path */}
                {/* Otherwise, stick to regular img for blob URLs or if NextImage has issues with dynamic local paths */}
                <NextImage 
                    src={photo.localPath ? photo.localPath : photo.previewUrl} 
                    alt={photo.name} 
                    layout="fill" 
                    objectFit="cover" 
                    data-ai-hint="product photo"
                    // Unoptimized if src is a blob URL, which is fine for local preview
                    unoptimized={photo.previewUrl.startsWith('blob:')}
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
                    {photo.isPrimary ? <CheckCircle className="h-4 w-4 mr-1"/> : <ImageIcon className="h-4 w-4 mr-1"/>}
                    {photo.isPrimary ? "Principal" : "Hacer Principal"}
                  </Button>
                </div>
                {uploadProgress[photo.id] < 100 && uploadProgress[photo.id] !== undefined && (
                  <Progress value={uploadProgress[photo.id]} className="absolute bottom-0 left-0 right-0 h-1 rounded-none" />
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
