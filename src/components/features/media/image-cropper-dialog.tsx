
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
  const [initialLoad, setInitialLoad] = useState(true); // To check if we need to auto-load

  const cropperRef = useRef<any>(null);
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Calculate aspect ratio safely
  const cropperAspectRatio = (() => {
    if (imageToCrop?.width && imageToCrop?.height && !isNaN(Number(imageToCrop.width)) && !isNaN(Number(imageToCrop.height)) && Number(imageToCrop.height) !== 0) {
      return Number(imageToCrop.width) / Number(imageToCrop.height);
    }
    // Fallback to a default aspect ratio if dimensions are not available
    return 1;
  })();

  const handleLoadOriginal = async () => {
    if (!imageToCrop?.src && !('previewUrl' in imageToCrop && imageToCrop.previewUrl)) {
        toast({ title: 'No hay imagen de origen', variant: 'destructive'});
        return;
    }

    setIsOriginalLoading(true);
    try {
        const imageUrlToLoad = imageToCrop.src || (imageToCrop as ProductPhoto).previewUrl;
        
        if (imageUrlToLoad.startsWith('blob:')) {
            setSourceImage(imageUrlToLoad);
            setOriginalFilename((imageToCrop as ProductPhoto).name || 'image.png');
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
        // If an image object is passed, it means we are in "edit" mode (e.g., from wizard).
        // Load it directly into the cropper.
        if (('file' in imageToCrop && imageToCrop.file) || ('previewUrl' in imageToCrop && imageToCrop.previewUrl)) {
            const photo = imageToCrop as ProductPhoto;
            setSourceImage(photo.previewUrl);
            setOriginalFilename(photo.name);
            setInitialLoad(false);
        } else {
             // We are in "replace" mode, so show the options.
             setInitialLoad(true);
             setSourceImage(null);
        }
        setIsAspectRatioLocked(true);
    } else {
      setSourceImage(null);
      setOriginalFilename('cropped-image.png');
      setIsAspectRatioLocked(true);
      setInitialLoad(true);
    }
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
            Ajusta, recorta y reemplaza la imagen. La nueva imagen se optimizará para la web.
          </DialogDescription>
        </DialogHeader>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 items-start py-4">
          <div className="space-y-3">
             <h4 className="font-semibold text-sm">1. Origen de la Imagen</h4>
             {!sourceImage && (
              <div className="space-y-3">
                <Button onClick={() => fileInputRef.current?.click()} variant="outline" className="w-full" disabled={isSaving}>
                  <UploadCloud className="mr-2 h-4 w-4" />
                  Subir nueva imagen...
                </Button>
                {imageToCrop && (
                  <div className="border rounded-md p-3 space-y-2 bg-muted/50">
                    <p className="text-xs text-muted-foreground">O puedes editar la imagen que ya existe:</p>
                    <Button variant="secondary" size="sm" onClick={handleLoadOriginal} className="w-full" disabled={isOriginalLoading}>
                      {isOriginalLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Edit className="mr-2 h-4 w-4" />}
                      Cargar y editar original
                    </Button>
                  </div>
                )}
              </div>
            )}
             <Input
              id="new-image-upload"
              type="file"
              accept="image/*"
              onChange={handleFileChange}
              disabled={isSaving}
              className="hidden"
              ref={fileInputRef}
            />
            {sourceImage && (
              <div className="border rounded-md p-3 space-y-2">
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
                <Button onClick={() => setSourceImage(null)} variant="link" className="p-0 h-auto text-xs">Cambiar imagen</Button>
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
                  key={sourceImage + isAspectRatioLocked}
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
                <RotateCw className="mr-2 h-4 w-4" /> Rotar 90°
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
