
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

export function ProductEditModal({ productId, onClose }: ProductEditModalProps) {
  const [product, setProduct] = useState<ProductEditState | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [wooCategories, setWooCategories] = useState<WooCommerceCategory[]>([]);
  const [categoryTree, setCategoryTree] = useState<{ category: WooCommerceCategory; depth: number }[]>([]);
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

  const handlePhotosChange = (newPhotos: ProductPhoto[]) => {
      if (!product) return;
      // This function from ImageUploader gives the full new array of photos
      // We need to merge it correctly, keeping existing WooCommerceImages
      const existingImages = product.images.filter(img => 'alt' in img); // Simple check for WooCommerceImage
      setProduct(p => p ? { ...p, images: [...existingImages, ...newPhotos] } : null);
  };

  const handleSetPrimary = (id: number | string) => {
      if (!product) return;
      const newImages = [...product.images];
      const primaryIndex = newImages.findIndex(img => ('id' in img && img.id === id) || ('file' in img && img.id === id) );
      if (primaryIndex > -1) {
          const [primaryImage] = newImages.splice(primaryIndex, 1);
          newImages.unshift(primaryImage);
          setProduct({ ...product, images: newImages });
      }
  };

  const handleDeleteImage = async (id: number | string) => {
      if (!product) return;
      
      const imageToDelete = product.images.find(img => ('id' in img && img.id === id) || ('file' in img && img.id === id));
      if (!imageToDelete) return;

      const remainingImages = product.images.filter(img => (('id' in img && img.id !== id) || ('file' in img && img.id !== id)));
      setProduct({ ...product, images: remainingImages });
      
      toast({ title: `Imagen "${imageToDelete.name}" eliminada de la cola.` });

      // If it's an existing image from WordPress, call the API to delete it
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

        // 1. Upload any new images to the temporary server
        const uploadedImages: (WooCommerceImage | { src: string })[] = [];
        for (const img of product.images) {
            if ('file' in img && img.file) { // It's a new ProductPhoto
                const formData = new FormData();
                formData.append('imagen', img.file);
                const response = await axios.post('/api/upload-image', formData, {
                    headers: { 'Authorization': `Bearer ${token}` }
                });
                if (!response.data.success) throw new Error(`Error subiendo ${img.name}`);
                uploadedImages.push({ src: response.data.url });
            } else if ('alt' in img) { // It's an existing WooCommerceImage
                uploadedImages.push({ id: img.id });
            }
        }

        // 2. Prepare final payload
        const { images, ...rest } = product;
        const payload = {
            ...rest,
            images: uploadedImages,
            // Pass image metadata for new uploads
            imageTitle: product.name,
            imageAltText: `Imagen de ${product.name}`,
            imageCaption: `Foto de ${product.name}`,
            imageDescription: `Descripción detallada de la imagen de ${product.name}`,
        };
        
        // 3. Send final payload to the update endpoint
        const response = await fetch(`/api/woocommerce/products/${productId}`, {
            method: 'PUT',
            headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`
            },
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
  
  useEffect(() => {
    if (wooCategories.length === 0) {
        setCategoryTree([]);
        return;
    }
    const buildTree = (parentId = 0, depth = 0): { category: WooCommerceCategory; depth: number }[] => {
        const children = wooCategories.filter(cat => cat.parent === parentId).sort((a, b) => a.name.localeCompare(b.name));
        let result: { category: WooCommerceCategory; depth: number }[] = [];
        for (const child of children) {
            result.push({ category: child, depth });
            result = result.concat(buildTree(child.id, depth + 1));
        }
        return result;
    };
    setCategoryTree(buildTree());
  }, [wooCategories]);

  return (
    <Dialog open={true} onOpenChange={() => onClose(false)}>
      <DialogContent className="sm:max-w-4xl flex flex-col max-h-[90vh]">
        <DialogHeader>
          <DialogTitle>Editar Producto</DialogTitle>
          <DialogDescription>
            Realiza cambios en los detalles del producto. Los cambios se guardarán al hacer clic en "Guardar Cambios".
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
           <div className="flex-1 overflow-y-auto pr-4 space-y-6">
              
                <div className="space-y-4 p-4 border rounded-lg">
                  <h3 className="text-lg font-medium text-foreground">Información General</h3>
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
                
                <div className="space-y-4 p-4 border rounded-lg">
                   <h3 className="text-lg font-medium text-foreground">Precios y Catálogo</h3>
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
                                {categoryTree.map(({ category, depth }) => (
                                    <SelectItem key={category.id} value={category.id.toString()}>
                                        <span style={{ paddingLeft: `${depth * 1.25}rem` }}>
                                            {depth > 0 && '— '} {category.name}
                                        </span>
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>
                    <div>
                        <Label htmlFor="tags">Etiquetas (separadas por comas)</Label>
                        <Input id="tags" name="tags" value={product.tags} onChange={handleInputChange} />
                    </div>
                </div>
                
                <div className="space-y-4 p-4 border rounded-lg">
                   <h3 className="text-lg font-medium text-foreground">Descripciones</h3>
                    <div>
                        <Label htmlFor="short_description">Descripción Corta</Label>
                        <Textarea id="short_description" name="short_description" value={product.short_description} onChange={handleInputChange} rows={4} />
                    </div>
                    <div>
                        <Label htmlFor="description">Descripción Larga</Label>
                        <Textarea id="description" name="description" value={product.description} onChange={handleInputChange} rows={10} />
                    </div>
                </div>

                <div className="space-y-4 p-4 border rounded-lg">
                   <h3 className="text-lg font-medium text-foreground">Imágenes</h3>
                    <p className="text-sm text-muted-foreground">Gestiona la galería de imágenes de tu producto. La primera imagen es la principal.</p>

                    <div className="grid grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
                        {product.images.map((img, index) => {
                            const isPrimary = index === 0;
                            const imageId = 'file' in img ? img.id : img.id;
                            const imageUrl = 'file' in img ? img.previewUrl : img.src;
                            return (
                                <div key={imageId} className="relative group border rounded-lg overflow-hidden shadow-sm aspect-square">
                                    <Image src={imageUrl} alt={img.name || 'Product image'} fill sizes="(max-width: 768px) 33vw, 17vw" className="object-cover" />
                                    <div className="absolute inset-0 bg-black/40 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                                        {!isPrimary && (
                                            <Button variant="ghost" size="icon" onClick={() => handleSetPrimary(imageId)} title="Marcar como principal">
                                                <Star className="h-5 w-5 text-white" />
                                            </Button>
                                        )}
                                        <Button variant="ghost" size="icon" onClick={() => handleDeleteImage(imageId)} title="Eliminar imagen">
                                            <Trash2 className="h-5 w-5 text-destructive" />
                                        </Button>
                                    </div>
                                    {isPrimary && (
                                        <div className="absolute top-1 left-1 bg-primary text-primary-foreground text-xs font-bold px-1.5 py-0.5 rounded">
                                            PRINCIPAL
                                        </div>
                                    )}
                                </div>
                            );
                        })}
                    </div>
                    
                    <Separator className="my-4" />
                    
                    <ImageUploader photos={product.images.filter((i): i is ProductPhoto => 'file' in i)} onPhotosChange={handlePhotosChange} isProcessing={isSaving} />

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
