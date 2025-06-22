
"use client";

import React, { useEffect, useState, useCallback } from 'react';
import Image from 'next/image';
import axios from 'axios';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  DialogClose
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Loader2 } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { auth } from '@/lib/firebase';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import type { WooCommerceCategory, WooCommerceImage, ProductPhoto } from '@/lib/types';
import { Badge } from '@/components/ui/badge';
import { ImageUploader } from '@/components/features/wizard/image-uploader';
import { cn } from '@/lib/utils';


interface ProductEditModalProps {
  productId: number;
  onClose: (refresh: boolean) => void;
}

interface ProductEditState {
  name: string;
  sku: string;
  regular_price: string;
  sale_price: string;
  short_description: string;
  description: string;
  images: ProductPhoto[]; // Unified to ProductPhoto
  status: 'publish' | 'draft' | 'pending' | 'private';
  tags: string;
  category_id: number | null;
}

const DescriptionToolbar = ({ onFormat }: { onFormat: (format: 'bold' | 'italic') => void }) => (
    <div className="flex items-center gap-1 mb-1">
        <Button type="button" variant="outline" size="icon-xs" onClick={() => onFormat('bold')} title="Negrita" className="w-6 h-6">
            <span className="font-bold">B</span>
        </Button>
        <Button type="button" variant="outline" size="icon-xs" onClick={() => onFormat('italic')} title="Cursiva" className="w-6 h-6">
            <span className="italic">I</span>
        </Button>
    </div>
);


export function ProductEditModal({ productId, onClose }: ProductEditModalProps) {
  const [product, setProduct] = useState<ProductEditState | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [wooCategories, setWooCategories] = useState<WooCommerceCategory[]>([]);
  const [isLoadingCategories, setIsLoadingCategories] = useState(true);
  
  const { toast } = useToast();

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    if (!product) return;
    setProduct({ ...product, [e.target.name]: e.target.value });
  };
  
  const handleSelectChange = (name: 'status' | 'category_id', value: string) => {
    if (!product) return;
    const finalValue = name === 'category_id' ? (value ? parseInt(value, 10) : null) : value;
    setProduct({ ...product, [name]: finalValue as any });
  };

  const handleFormatDescription = (field: 'short_description' | 'description', format: 'bold' | 'italic') => {
        const textarea = document.getElementById(field) as HTMLTextAreaElement;
        if (!textarea || !product) return;

        const start = textarea.selectionStart;
        const end = textarea.selectionEnd;
        const selectedText = textarea.value.substring(start, end);
        const tag = format === 'bold' ? 'strong' : 'em';

        const newText = `${textarea.value.substring(0, start)}<${tag}>${selectedText}</${tag}>${textarea.value.substring(end)}`;
        
        setProduct({ ...product, [field]: newText });

        setTimeout(() => {
            textarea.focus();
            textarea.setSelectionRange(start + tag.length + 2, end + tag.length + 2);
        }, 0);
    };
  
  const handlePhotosChange = (updatedPhotos: ProductPhoto[]) => {
      if (!product) return;
      setProduct({ ...product, images: updatedPhotos });
  };


  const handleSaveChanges = async () => {
    setIsSaving(true);
    const user = auth.currentUser;
    if (!user || !product) {
      toast({ title: 'Error', description: 'No se puede guardar el producto.', variant: 'destructive' });
      setIsSaving(false);
      return;
    }

    try {
        const token = await user.getIdToken();
        const finalImagesForApi: ({id: number} | {src: string})[] = [];

        // Add existing images to the final list first
        product.images
          .filter(img => !img.file && typeof img.id === 'number')
          .forEach(img => finalImagesForApi.push({ id: img.id as number }));
        
        const newPhotosToUpload = product.images.filter(p => p.file);

        for (const photo of newPhotosToUpload) {
            // Set status to 'uploading' for this photo
            setProduct(prev => {
                if (!prev) return null;
                return { ...prev, images: prev.images.map(p => p.id === photo.id ? { ...p, status: 'uploading', progress: 0 } : p) };
            });

            const formData = new FormData();
            formData.append('imagen', photo.file);

            const response = await axios.post('/api/upload-image', formData, {
                headers: { 'Authorization': `Bearer ${token}` },
                onUploadProgress: (progressEvent) => {
                    const total = progressEvent.total || (photo.file?.size || 0);
                    const percentCompleted = Math.round((progressEvent.loaded * 100) / total);
                    setProduct(prev => {
                        if (!prev) return null;
                        return { ...prev, images: prev.images.map(p => p.id === photo.id ? { ...p, progress: percentCompleted } : p)};
                    });
                }
            });

            if (!response.data.success) {
                 setProduct(prev => {
                    if (!prev) return null;
                    return { ...prev, images: prev.images.map(p => p.id === photo.id ? { ...p, status: 'error', error: response.data.error || 'Upload failed' } : p)};
                });
               throw new Error(`Error subiendo ${photo.name}: ${response.data.error}`);
            }

            finalImagesForApi.push({ src: response.data.url });
            
            // Mark as completed in the UI state
            setProduct(prev => {
                if (!prev) return null;
                return { ...prev, images: prev.images.map(p => p.id === photo.id ? { ...p, status: 'completed', progress: 100 } : p) };
            });
        }
        
        const { images, ...rest } = product;
        const payload = {
            ...rest,
            images: finalImagesForApi,
            imageTitle: product.name,
            imageAltText: `Imagen de ${product.name}`,
            imageCaption: `Foto de ${product.name}`,
            imageDescription: `Descripción detallada de la imagen de ${product.name}`,
        };
        
        const response = await fetch(`/api/woocommerce/products/${productId}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
            body: JSON.stringify(payload)
        });

        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.error || 'Failed to save changes.');
        }
        
        toast({ title: '¡Éxito!', description: 'El producto ha sido actualizado.' });
        onClose(true);

    } catch (e: any) {
        toast({ title: 'Error al Guardar', description: e.message, variant: 'destructive' });
        setIsSaving(false);
    }
  };

  useEffect(() => {
    const fetchInitialData = async () => {
      setIsLoading(true);
      setError(null);
      const user = auth.currentUser;
      if (!user) {
        setError('Authentication required.');
        setIsLoading(false);
        return;
      }

      try {
        const token = await user.getIdToken();
        const [productResponse, categoriesResponse] = await Promise.all([
           fetch(`/api/woocommerce/products/${productId}`, { headers: { 'Authorization': `Bearer ${token}` }}),
           fetch('/api/woocommerce/categories', { headers: { 'Authorization': `Bearer ${token}` }}),
        ]);

        if (!productResponse.ok) {
          const errorData = await productResponse.json();
          throw new Error(errorData.error || 'Failed to fetch product data.');
        }
        const productData = await productResponse.json();

        if (categoriesResponse.ok) {
          const catData = await categoriesResponse.json();
          setWooCategories(catData);
        } else {
          console.error("Failed to fetch categories");
        }
        setIsLoadingCategories(false);

        const existingImagesAsProductPhotos: ProductPhoto[] = productData.images.map(
          (img: WooCommerceImage, index: number): ProductPhoto => ({
              id: img.id,
              previewUrl: img.src,
              name: img.name,
              isPrimary: index === 0,
              status: 'completed',
              progress: 100,
          })
        );


        setProduct({
          name: productData.name || '',
          sku: productData.sku || '',
          regular_price: productData.regular_price || '',
          sale_price: productData.sale_price || '',
          short_description: productData.short_description || '',
          description: productData.description || '',
          images: existingImagesAsProductPhotos,
          status: productData.status || 'draft',
          tags: productData.tags?.map((t: any) => t.name).join(', ') || '',
          category_id: productData.categories?.length > 0 ? productData.categories[0].id : null,
        });

      } catch (e: any) {
        setError(e.message);
        toast({ title: 'Error', description: e.message, variant: 'destructive' });
      } finally {
        setIsLoading(false);
      }
    };

    fetchInitialData();
  }, [productId, toast]);
  
  const primaryPhoto = product?.images?.[0];
  const previewImageUrl = primaryPhoto ? primaryPhoto.previewUrl : 'https://placehold.co/128x128.png';
  const categoryName = wooCategories.find(c => c.id === product?.category_id)?.name || 'Sin categoría';

  return (
    <Dialog open={true} onOpenChange={() => onClose(false)}>
      <DialogContent className="sm:max-w-6xl flex flex-col max-h-[90vh]">
        <DialogHeader>
          <DialogTitle>Editar Producto: {product?.name || 'Cargando...'}</DialogTitle>
          <DialogDescription>
            Realiza cambios en los detalles del producto. La vista previa se actualiza al instante.
          </DialogDescription>
        </DialogHeader>
        
        {isLoading && (
          <div className="flex items-center justify-center min-h-[400px]">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            <p className="ml-3 text-muted-foreground">Cargando datos del producto...</p>
          </div>
        )}

        {error && !isLoading && (
           <div className="flex items-center justify-center min-h-[400px]">
                <Alert variant="destructive" className="w-auto">
                    <AlertTitle>Error al cargar</AlertTitle>
                    <AlertDescription>{error}</AlertDescription>
                </Alert>
            </div>
        )}
        
        {!isLoading && !error && product && (
           <div className="grid grid-cols-1 md:grid-cols-10 gap-6 flex-1 min-h-0">
                <div className="md:col-span-6 lg:col-span-7 flex flex-col gap-4 overflow-y-auto pr-2">
                    <div className="p-4 border rounded-lg bg-muted/20">
                        <h3 className="text-lg font-medium mb-4">Información General</h3>
                        <div className="space-y-4">
                            <div>
                                <Label htmlFor="name">Nombre del Producto</Label>
                                <Input id="name" name="name" value={product.name} onChange={handleInputChange} />
                            </div>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div>
                                <Label htmlFor="sku">SKU</Label>
                                <Input id="sku" name="sku" value={product.sku} onChange={handleInputChange} />
                                </div>
                                <div>
                                <Label htmlFor="status">Estado</Label>
                                <Select name="status" value={product.status} onValueChange={(value) => handleSelectChange('status', value)}>
                                    <SelectTrigger id="status"><SelectValue /></SelectTrigger>
                                    <SelectContent>
                                    <SelectItem value="publish">Publicado</SelectItem>
                                    <SelectItem value="draft">Borrador</SelectItem>
                                    <SelectItem value="pending">Pendiente</SelectItem>
                                    <SelectItem value="private">Privado</SelectItem>
                                    </SelectContent>
                                </Select>
                                </div>
                            </div>
                        </div>
                    </div>
                    
                    <div className="p-4 border rounded-lg bg-muted/20">
                        <h3 className="text-lg font-medium mb-4">Precios y Catálogo</h3>
                        <div className="space-y-4">
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div>
                                <Label htmlFor="regular_price">Precio Regular (€)</Label>
                                <Input id="regular_price" name="regular_price" type="number" value={product.regular_price} onChange={handleInputChange} />
                                </div>
                                <div>
                                <Label htmlFor="sale_price">Precio Oferta (€)</Label>
                                <Input id="sale_price" name="sale_price" type="number" value={product.sale_price} onChange={handleInputChange} />
                                </div>
                            </div>
                            <div>
                                <Label htmlFor="category_id">Categoría</Label>
                                <Select name="category_id" value={product.category_id?.toString() || ''} onValueChange={(value) => handleSelectChange('category_id', value)} disabled={isLoadingCategories}>
                                    <SelectTrigger><SelectValue placeholder="Selecciona una categoría..." /></SelectTrigger>
                                    <SelectContent>
                                        {wooCategories.map((cat) => (
                                            <SelectItem key={cat.id} value={cat.id.toString()}>{cat.name}</SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>
                            <div>
                                <Label htmlFor="tags">Etiquetas (separadas por comas)</Label>
                                <Input id="tags" name="tags" value={product.tags} onChange={handleInputChange} />
                            </div>
                        </div>
                    </div>

                    <div className="p-4 border rounded-lg bg-muted/20">
                        <h3 className="text-lg font-medium mb-4">Descripciones</h3>
                        <div className="space-y-4">
                            <div>
                                <Label htmlFor="short_description">Descripción Corta</Label>
                                <DescriptionToolbar onFormat={(format) => handleFormatDescription('short_description', format)} />
                                <Textarea id="short_description" name="short_description" value={product.short_description} onChange={handleInputChange} rows={4} />
                            </div>
                            <div>
                                <Label htmlFor="description">Descripción Larga</Label>
                                <DescriptionToolbar onFormat={(format) => handleFormatDescription('description', format)} />
                                <Textarea id="description" name="description" value={product.description} onChange={handleInputChange} rows={10} />
                            </div>
                        </div>
                    </div>

                    <div className="p-4 border rounded-lg bg-muted/20">
                        <h3 className="text-lg font-medium">Imágenes</h3>
                        <p className="text-sm text-muted-foreground mb-4">Gestiona la galería. La primera imagen es la principal. Arrastra nuevas imágenes a la zona de carga.</p>
                        <ImageUploader
                            photos={product.images}
                            onPhotosChange={handlePhotosChange}
                            isProcessing={isSaving}
                        />
                    </div>
                </div>

                <div className="md:col-span-4 lg:col-span-3 bg-card border rounded-lg p-4 space-y-3 overflow-y-auto">
                    <div className="aspect-square w-32 h-32 relative mx-auto rounded-md overflow-hidden border">
                       <Image src={previewImageUrl} alt={product.name || 'Vista previa del producto'} fill sizes="128px" className="object-cover" />
                    </div>
                    
                    <h4 className="font-bold text-base leading-tight text-center">{product.name || "Nombre del Producto"}</h4>
                    <p className="text-center text-sm">
                        <span className={cn("font-bold text-xl", product.sale_price && "line-through text-muted-foreground text-base")}>
                        {product.regular_price ? `${product.regular_price}€` : "N/A"}
                        </span>
                        {product.sale_price && <span className="ml-2 font-bold text-xl text-primary">{`${product.sale_price}€`}</span>}
                    </p>
                    <div className="text-center text-xs space-x-1">
                        <Badge variant="outline">{product.status}</Badge>
                        <Badge variant="secondary">{categoryName}</Badge>
                    </div>
                     {product.tags && (
                        <div className="flex flex-wrap gap-1 justify-center">
                            {product.tags.split(',').map(k => k.trim()).filter(k => k).map((keyword, index) => (
                                <Badge key={index} variant="secondary" className="text-xs">{keyword}</Badge>
                            ))}
                        </div>
                    )}
                     <div className="space-y-3 text-xs text-muted-foreground pt-3 border-t">
                        <div>
                            <h5 className="font-semibold text-foreground mb-1">Descripción Corta</h5>
                            <div className="prose prose-xs max-w-none [&_strong]:text-foreground/90 [&_em]:text-foreground/90" dangerouslySetInnerHTML={{ __html: product.short_description || "..." }} />
                        </div>
                         <div>
                            <h5 className="font-semibold text-foreground mb-1">Descripción Larga</h5>
                            <div className="prose prose-xs max-w-none [&_strong]:text-foreground/90 [&_em]:text-foreground/90" dangerouslySetInnerHTML={{ __html: product.description || "..." }} />
                        </div>
                    </div>
                </div>
           </div>
        )}

        <DialogFooter className="mt-auto pt-4 border-t">
          <DialogClose asChild>
            <Button type="button" variant="secondary" onClick={() => onClose(false)}>
              Cancelar
            </Button>
          </DialogClose>
          <Button type="submit" onClick={handleSaveChanges} disabled={isSaving || isLoading || !!error}>
            {isSaving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Guardar Cambios
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
