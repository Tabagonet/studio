
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
import type { ContentImage, ProductPhoto } from '@/lib/types';
import { Checkbox } from '@/components/ui/checkbox';
import { auth } from '@/lib/firebase';
import axios from 'axios';

interface ImageCropperDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  // Can accept a remote image or a local file wrapper
  imageToCrop: ContentImage | ProductPhoto | null; 
  onSave: (croppedImageFile: File) => void;
  isSaving: boolean;
}

// Helper to convert a blob to a data URL
function blobToDataURL(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = (error) => reject(error);
    reader.readAsDataURL(blob);
  });
}

export function ImageCropperDialog({
  open, onOpenChange, imageToCrop, onSave, isSaving
}: ImageCropperDialogProps) {
  const [sourceImage, setSourceImage] = useState<string | null>(null);
  const [originalFilename, setOriginalFilename] = useState<string>('cropped-image.png');
  const [isAspectRatioLocked, setIsAspectRatioLocked] = useState(true);
  const [isOriginalLoading, setIsOriginalLoading] = useState(false);

  const cropperRef = useRef<any>(null);
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Calculate aspect ratio safely
  const cropperAspectRatio = (() => {
    if (imageToCrop && 'width' in imageToCrop && 'height' in imageToCrop && imageToCrop.width && imageToCrop.height && !isNaN(Number(imageToCrop.width)) && !isNaN(Number(imageToCrop.height)) && Number(imageToCrop.height) !== 0) {
      return Number(imageToCrop.width) / Number(imageToCrop.height);
    }
    // Fallback to a default aspect ratio if dimensions are not available
    return 1;
  })();

  const loadOriginalImage = async (image: ContentImage | ProductPhoto) => {
    const imageUrlToLoad = 'src' in image ? image.src : image.previewUrl;
    if (!imageUrlToLoad) {
        toast({ title: 'No hay imagen de origen', variant: 'destructive'});
        return;
    }

    setIsOriginalLoading(true);
    setSourceImage(null);
    try {
        if (imageUrlToLoad.startsWith('blob:')) {
            setSourceImage(imageUrlToLoad);
            setOriginalFilename((image as ProductPhoto).name || 'image.png');
            return;
        }

        const user = auth.currentUser; if (!user) throw new Error("No autenticado.");
        const token = await user.getIdToken();

        const response = await axios.post('/api/process-image', { imageUrl: imageUrlToLoad }, { headers: { 'Authorization': `Bearer ${token}` }, responseType: 'blob' });
        const blob = response.data;
        const dataUrl = await blobToDataURL(blob);
        
        setSourceImage(dataUrl);
        setOriginalFilename(imageUrlToLoad.split('/').pop()?.split('?')[0] || 'original.png');
    } catch (e) {
        console.error("No se pudo cargar la imagen original:", e);
        toast({ title: 'Error al Cargar Imagen', description: 'No se pudo obtener la imagen original. Puede que ya no esté disponible o haya un problema de red.', variant: 'destructive' });
        setSourceImage(null);
    } finally {
        setIsOriginalLoading(false);
    }
  };

  // Effect to manage state when dialog opens/closes or image prop changes
  useEffect(() => {
    if (open && imageToCrop) {
        setIsAspectRatioLocked(true);

        const photo = imageToCrop as ProductPhoto;
        // If it's a new image (has a file object), load it directly.
        if (photo.file) {
            setSourceImage(photo.previewUrl);
            setOriginalFilename(photo.name);
        } else {
            // It's an existing image, load it from the server.
            loadOriginalImage(imageToCrop);
        }
    } else {
      setSourceImage(null);
      setOriginalFilename('cropped-image.png');
      setIsAspectRatioLocked(true);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, imageToCrop]);


  // Update Cropper when aspect ratio lock changes
  useEffect(() => {
    if (cropperRef.current?.cropper && sourceImage) {
      const cropper = cropperRef.current.cropper;
      cropper.setAspectRatio(isAspectRatioLocked ? cropperAspectRatio : NaN);
    }
  }, [isAspectRatioLocked, cropperAspectRatio, sourceImage]);

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
        const extension = blob.type.split('/')[1] || 'png';
        const filenameWithoutExt = originalFilename.substring(0, originalFilename.lastIndexOf('.')) || originalFilename;
        const newFilename = `${filenameWithoutExt}.${extension}`;

        const newFile = new File([blob], newFilename, { type: blob.type });
        onSave(newFile);
      } else {
        toast({ title: 'Error al convertir imagen', description: 'No se pudo crear el archivo a partir del lienzo.', variant: 'destructive' });
      }
    }, 'image/webp', 0.85);
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
            Ajusta, recorta y optimiza la imagen para la web.
          </DialogDescription>
        </DialogHeader>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 items-start py-4">
          <div className="space-y-3">
             <h4 className="font-semibold text-sm">Controles</h4>
             <div className="border rounded-md p-3 space-y-3 bg-muted/30">
                <Button onClick={() => fileInputRef.current?.click()} variant="outline" className="w-full" disabled={isSaving}>
                  <UploadCloud className="mr-2 h-4 w-4" />
                  Subir otra imagen...
                </Button>
                 <Input
                  id="new-image-upload"
                  type="file"
                  accept="image/*"
                  onChange={handleFileChange}
                  disabled={isSaving}
                  className="hidden"
                  ref={fileInputRef}
                />
                 <div className="flex items-center space-x-2">
                  <Checkbox
                    id="lock-aspect-ratio"
                    checked={isAspectRatioLocked}
                    onCheckedChange={(checked) => setIsAspectRatioLocked(!!checked)}
                  />
                  <Label htmlFor="lock-aspect-ratio" className="text-sm font-normal cursor-pointer">
                    Mantener proporción de aspecto
                  </Label>
                </div>
                <p className="text-xs text-muted-foreground">
                  {isAspectRatioLocked
                    ? `El recorte mantendrá la proporción ${cropperAspectRatio.toFixed(2)}:1.`
                    : 'Recorte libre: puedes definir cualquier proporción.'}
                </p>
                <Button onClick={rotateCropper} variant="secondary" size="sm" className="w-full" disabled={!sourceImage}>
                    <RotateCw className="mr-2 h-4 w-4" /> Rotar 90°
                </Button>
              </div>
          </div>
          <div className="space-y-3">
            <h4 className="font-semibold text-sm">Previsualización</h4>
            <div className="w-full aspect-square bg-muted rounded-md border flex items-center justify-center relative overflow-hidden">
              {isOriginalLoading ? (
                  <div className="text-center text-muted-foreground p-4">
                    <Loader2 className="mx-auto h-12 w-12 text-primary animate-spin" />
                    <p className="mt-2">Cargando imagen original...</p>
                  </div>
              ) : sourceImage ? (
                <Cropper
                  ref={cropperRef}
                  src={sourceImage}
                  style={{ height: '100%', width: '100%' }}
                  aspectRatio={isAspectRatioLocked ? cropperAspectRatio : NaN}
                  viewMode={1}
                  dragMode="move"
                  guides={true}
                  background={false}
                  responsive={true}
                  checkOrientation={false}
                  autoCropArea={0.8}
                  cropBoxMovable={true}
                  cropBoxResizable={true}
                  key={sourceImage} // Force re-render when image changes
                />
              ) : (
                <div className="text-center text-muted-foreground p-4">
                  <Crop className="mx-auto h-12 w-12 text-muted-foreground/50" />
                  <p className="mt-2">No hay imagen cargada.</p>
                </div>
              )}
            </div>
          </div>
        </div>
        <DialogFooter>
          <DialogClose asChild>
            <Button type="button" variant="secondary" disabled={isSaving}>Cancelar</Button>
          </DialogClose>
          <Button onClick={handleSaveCrop} disabled={isSaving || !sourceImage || isOriginalLoading}>
            {isSaving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Guardar y Reemplazar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
