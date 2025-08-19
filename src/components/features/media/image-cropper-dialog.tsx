
"use client";

import React, { useState, useRef, useEffect } from 'react';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter, DialogClose
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import { Loader2, Crop, UploadCloud, RotateCw } from 'lucide-react';
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
      setOriginalFilename(file.name);
      const reader = new FileReader();
      reader.onload = () => {
        setSourceImage(reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  const handleSaveCrop = () => {
    if (typeof cropperRef.current?.cropper?.getCroppedCanvas === 'function') {
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
          const newFile = new File([blob], originalFilename, { type: blob.type });
          onSave(newFile);
        } else {
          toast({ title: 'Error al convertir imagen', description: 'No se pudo crear el archivo a partir del lienzo.', variant: 'destructive' });
        }
      }, 'image/png', 0.9); // Use PNG for better quality after crop
    }
  };
  
  const rotateCropper = () => {
    if (cropperRef.current?.cropper) {
      cropperRef.current.cropper.rotate(90);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>Editor de Imagen</DialogTitle>
          <DialogDescription>
            Ajusta, recorta y reemplaza la imagen. La nueva imagen se optimizará para la web.
          </DialogDescription>
        </DialogHeader>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 items-start py-4">
          <div className="space-y-3">
             <h4 className="font-semibold text-sm">1. Carga una nueva imagen</h4>
             <Input id="new-image-upload" type="file" accept="image/*" onChange={handleFileChange} disabled={isSaving} />
             {imageToCrop && !sourceImage && (
                <div className="border rounded-md p-2 space-y-2">
                    <p className="text-xs text-muted-foreground">O recorta la imagen original:</p>
                    <Button variant="outline" size="sm" onClick={() => setSourceImage(imageToCrop.src)}>Cargar original para recortar</Button>
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
                        aspectRatio={imageToCrop && imageToCrop.width && imageToCrop.height ? Number(imageToCrop.width) / Number(imageToCrop.height) : 1}
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
                        <UploadCloud className="mx-auto h-8 w-8" />
                        <p>Sube una imagen para empezar a recortar</p>
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
