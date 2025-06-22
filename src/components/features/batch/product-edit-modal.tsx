
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
import { Loader2, Star, Trash2 } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { auth } from '@/lib/firebase';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import type { WooCommerceCategory, WooCommerceImage, ProductPhoto } from '@/lib/types';
import { Separator } from '@/components/ui/separator';
import { ImageUploader } from '@/components/features/wizard/image-uploader';
import { v4 as uuidv4 } from 'uuid';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';


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
  images: (WooCommerceImage | ProductPhoto)[];
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

  const handlePhotosChange = (newPhotos: ProductPhoto[]) => {
      if (!product) return;
      const existingImages = product.images.filter(img => 'alt' in img);
      const updatedPhotos = [...existingImages, ...newPhotos];
      setProduct(p => p ? { ...p, images: updatedPhotos } : null);
  };

  const handleSetPrimary = (id: number | string) => {
      if (!product) return;
      const newImages = [...product.images];
      const primaryIndex = newImages.findIndex(img => ('id' in img && img.id === id) );
      if (primaryIndex > -1) {
          const [primaryImage] = newImages.splice(primaryIndex, 1);
          newImages.unshift(primaryImage);
          setProduct({ ...product, images: newImages });
      }
  };

  const handleDeleteImage = async (id: number | string) => {
      if (!product) return;
      
      const imageToDelete = product.images.find(img => ('id' in img && img.id === id));
      if (!imageToDelete) return;

      const remainingImages = product.images.filter(img => ('id' in img && img.id !== id));
      setProduct({ ...product, images: remainingImages });
      
      toast({ title: `Imagen eliminada de la cola.` });

      if ('alt' in imageToDelete && typeof id === 'number') {
        try {
            const user = auth.currentUser;
            if (!user) return;
            const token = await user.getIdToken();
            await fetch(`/api/wordpress/media/${id}`, {
                method: 'DELETE',
                headers: { 'Authorization': `Bearer ${token}` }
            });
            toast({ title: 'Imagen eliminada de WordPress', description: `La imagen ha sido eliminada permanentemente de tu biblioteca de medios.` });
        } catch (e) {
            console.error('Failed to delete image from WordPress:', e);
            toast({ title: 'Error al eliminar imagen de WP', description: 'La imagen se ha quitado del producto, pero no se pudo eliminar de la biblioteca de medios.', variant: 'destructive'});
        }
      }
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
        const uploadedImages: ({id: number; position: number} | {src: string; position: number})[] = [];
        let imageIndex = 0;
        
        for (const img of product.images) {
            let processedImage;
            if ('file' in img && img.file) {
                const formData = new FormData();
                formData.append('imagen', img.file);
                const response = await axios.post('/api/upload-image', formData, {
                    headers: { 'Authorization': `Bearer ${token}` }
                });
                if (!response.data.success) throw new Error(`Error subiendo ${img.name}`);
                processedImage = { src: response.data.url, position: imageIndex };
            } else if ('alt' in img) {
                processedImage = { id: img.id, position: imageIndex };
            }
            if (processedImage) {
                uploadedImages.push(processedImage);
                imageIndex++;
            }
        }

        const { images, ...rest } = product;
        const payload = {
            ...rest,
            images: uploadedImages,
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
    } finally {
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

        setProduct({
          name: productData.name || '',
          sku: productData.sku || '',
          regular_price: productData.regular_price || '',
          sale_price: productData.sale_price || '',
          short_description: productData.short_description || '',
          description: productData.description || '',
          images: productData.images || [],
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
  const previewImageUrl = primaryPhoto ? ('src' in primaryPhoto ? primaryPhoto.src : (primaryPhoto as ProductPhoto).previewUrl) : 'https://placehold.co/128x128.png';
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
                        <p className="text-sm text-muted-foreground mb-4">Gestiona la galería de imágenes de tu producto. La primera imagen es la principal.</p>
                        <div className="grid grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4 mb-4">
                            {product.images.filter(img => 'alt' in img).map((img, index) => {
                                const imageId = (img as WooCommerceImage).id;
                                return (
                                    <div key={imageId} className="relative group border rounded-lg overflow-hidden shadow-sm aspect-square">
                                        <Image src={(img as WooCommerceImage).src} alt={img.name || 'Product image'} fill sizes="(max-width: 768px) 33vw, 17vw" className="object-cover" />
                                        <div className="absolute inset-0 bg-black/40 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                                            {index > 0 && (
                                                <Button variant="ghost" size="icon" onClick={() => handleSetPrimary(imageId)} title="Marcar como principal">
                                                    <Star className="h-5 w-5 text-white" />
                                                </Button>
                                            )}
                                            <Button variant="ghost" size="icon" onClick={() => handleDeleteImage(imageId)} title="Eliminar imagen">
                                                <Trash2 className="h-5 w-5 text-destructive" />
                                            </Button>
                                        </div>
                                        {index === 0 && (
                                            <div className="absolute top-1 left-1 bg-primary text-primary-foreground text-xs font-bold px-1.5 py-0.5 rounded">
                                                PRINCIPAL
                                            </div>
                                        )}
                                    </div>
                                );
                            })}
                        </div>
                        <Separator />
                        <h4 className="text-md font-medium mt-4">Añadir nuevas imágenes</h4>
                        <ImageUploader photos={product.images.filter((i): i is ProductPhoto => 'file' in i)} onPhotosChange={handlePhotosChange} isProcessing={isSaving} />
                    </div>
                </div>

                <div className="md:col-span-4 lg:col-span-3 bg-card border rounded-lg p-4 space-y-3 overflow-y-auto">
                    <div className="aspect-square w-32 h-32 relative mx-auto rounded-md overflow-hidden border">
                       <Image src={previewImageUrl} alt={product.name || 'Vista previa del producto'} fill sizes="128px" className="object-cover" />
                    </div>
                    <Separator />
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
                    <Separator />
                     <div className="space-y-3 text-xs text-muted-foreground">
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
