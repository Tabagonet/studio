
"use client";

import React, { useState, useRef, useEffect } from 'react';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter, DialogClose
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import { Loader2, Crop, UploadCloud, RotateCw, Edit } from 'lucide-react';
import Cropper from 'react-cropper';
import 'cropperjs/dist/cropper.css';
import type { ContentImage } from '@/lib/types';
import Image from 'next/image';

interface ImageCropperDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  imageToCrop: ContentImage | null;
  onSave: (croppedImageFile: File) => void;
  isSaving: boolean;
}

export function ImageCropperDialog({
  open, onOpenChange, imageToCrop, onSave, isSaving
}: ImageCropperDialogProps) {
  const [sourceImage, setSourceImage] = useState<string | null>(null);
  const [originalFilename, setOriginalFilename] = useState<string>('cropped-image.png');
  const cropperRef = useRef<any>(null);
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    // Reset state when the dialog is closed or a new image is passed
    if (!open || !imageToCrop) {
      setSourceImage(null);
      setOriginalFilename('cropped-image.png');
    }
  }, [open, imageToCrop]);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    e.preventDefault();
    const files = e.target.files;
    if (files && files.length > 0) {
      const file = files[0];
      if (!file.type.startsWith('image/')) {
        toast({ title: 'Archivo no válido', description: 'Por favor, selecciona un archivo de imagen.', variant: 'destructive' });
        return;
      }
      setOriginalFilename(file.name);
      const reader = new FileReader();
      reader.onload = () => {
        setSourceImage(reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  };
  
  const handleLoadOriginal = async () => {
      if (!imageToCrop?.src) return;
      setSourceImage(imageToCrop.src);
      try {
        const response = await fetch(imageToCrop.src);
        const blob = await response.blob();
        const filename = imageToCrop.src.split('/').pop() || 'original.png';
        setOriginalFilename(filename);
      } catch (e) {
          console.warn("Could not fetch original image to determine filename, using default.", e);
          setOriginalFilename('original-image.png');
      }
  }

  const handleSaveCrop = () => {
    if (typeof cropperRef.current?.cropper?.getCroppedCanvas !== 'function') {
      toast({ title: 'Error', description: 'El recortador no está listo.', variant: 'destructive' });
      return;
    }
      
    const cropper = cropperRef.current.cropper;
    const canvas = cropper.getCroppedCanvas({
      minWidth: 256,
      minHeight: 256,
      maxWidth: 4096,
      maxHeight: 4096,
      fillColor: '#fff',
      imageSmoothingEnabled: true,
      imageSmoothingQuality: 'high',
    });

    if (!canvas) {
      toast({ title: 'Error al recortar', description: 'No se pudo obtener el lienzo recortado.', variant: 'destructive' });
      return;
    }

    canvas.toBlob((blob: Blob | null) => {
      if (blob) {
        // Ensure the file extension is correct based on blob type, fallback to png
        const extension = blob.type.split('/')[1] || 'png';
        const filenameWithoutExt = originalFilename.substring(0, originalFilename.lastIndexOf('.')) || originalFilename;
        const newFilename = `${filenameWithoutExt}.${extension}`;
        
        const newFile = new File([blob], newFilename, { type: blob.type });
        onSave(newFile);
      } else {
        toast({ title: 'Error al convertir imagen', description: 'No se pudo crear el archivo a partir del lienzo.', variant: 'destructive' });
      }
    }, 'image/webp', 0.85); // Save as WebP with 85% quality for optimization
  };
  
  const rotateCropper = () => {
    if (cropperRef.current?.cropper) {
      cropperRef.current.cropper.rotate(90);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl">
        <DialogHeader>
          <DialogTitle>Editor de Imagen</DialogTitle>
          <DialogDescription>
            Ajusta, recorta y reemplaza la imagen. La nueva imagen se optimizará para la web.
          </DialogDescription>
        </DialogHeader>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 items-start py-4">
          <div className="space-y-3">
             <h4 className="font-semibold text-sm">1. Elige una Imagen</h4>
              <Input 
                id="new-image-upload" 
                type="file" 
                accept="image/*" 
                onChange={handleFileChange} 
                disabled={isSaving} 
                className="hidden"
                ref={fileInputRef}
              />
               <Button onClick={() => fileInputRef.current?.click()} variant="outline" className="w-full" disabled={isSaving}>
                  <UploadCloud className="mr-2 h-4 w-4" />
                  Subir nueva imagen...
               </Button>
            
             {imageToCrop && (
                <div className="border rounded-md p-3 space-y-2 bg-muted/50">
                    <p className="text-xs text-muted-foreground">O puedes editar la imagen original:</p>
                    <Button variant="secondary" size="sm" onClick={handleLoadOriginal} className="w-full">
                       <Edit className="mr-2 h-4 w-4" />
                       Cargar y editar original
                    </Button>
                </div>
             )}
          </div>
          <div className="space-y-3">
            <h4 className="font-semibold text-sm">2. Previsualización y Recorte</h4>
            <div className="w-full aspect-square bg-muted rounded-md border flex items-center justify-center relative overflow-hidden">
                {sourceImage ? (
                    <Cropper
                        ref={cropperRef}
                        src={sourceImage}
                        style={{ height: '100%', width: '100%' }}
                        aspectRatio={imageToCrop && imageToCrop.width && imageToCrop.height ? Number(imageToCrop.width) / Number(imageToCrop.height) : undefined}
                        viewMode={1}
                        dragMode="move"
                        guides={true}
                        background={false}
                        responsive={true}
                        checkOrientation={false}
                        autoCropArea={0.8}
                        cropBoxMovable={true}
                        cropBoxResizable={true}
                    />
                ) : (
                    <div className="text-center text-muted-foreground p-4">
                        <Crop className="mx-auto h-12 w-12 text-muted-foreground/50" />
                        <p className="mt-2">Sube una imagen para empezar a recortar</p>
                    </div>
                )}
            </div>
             {sourceImage && (
                 <Button onClick={rotateCropper} variant="outline" size="sm">
                    <RotateCw className="mr-2 h-4 w-4"/> Rotar 90°
                 </Button>
             )}
          </div>
        </div>
        <DialogFooter>
          <DialogClose asChild>
            <Button type="button" variant="secondary" disabled={isSaving}>Cancelar</Button>
          </DialogClose>
          <Button onClick={handleSaveCrop} disabled={isSaving || !sourceImage}>
            {isSaving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Guardar y Reemplazar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
