
"use client";

import React, { useEffect, useState, useRef } from 'react';
import Image from 'next/image';
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
import { Badge } from '@/components/ui/badge';
import type { WooCommerceCategory } from '@/lib/types';
import { Separator } from '@/components/ui/separator';


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
  imageUrl: string | null;
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

  const shortDescRef = useRef<HTMLTextAreaElement>(null);
  const longDescRef = useRef<HTMLTextAreaElement>(null);

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
          imageUrl: productData.images?.length > 0 ? productData.images[0].src : null,
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

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    if (!product) return;
    setProduct({ ...product, [e.target.name]: e.target.value });
  };
  
   const handleSelectChange = (name: 'status' | 'category_id', value: string) => {
    if (!product) return;
    const finalValue = name === 'category_id' ? (value ? parseInt(value, 10) : null) : value;
    setProduct({ ...product, [name]: finalValue });
  };

  const handleApplyTag = (
    ref: React.RefObject<HTMLTextAreaElement>,
    field: keyof Omit<ProductEditState, 'imageUrl'>,
    tag: 'strong' | 'em'
  ) => {
    const textarea = ref.current;
    if (!textarea || !product) return;

    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const selectedText = textarea.value.substring(start, end);

    if (!selectedText) {
        textarea.focus();
        toast({
            title: "Selecciona texto primero",
            description: "Debes seleccionar el texto al que quieres aplicar el formato.",
            variant: "default"
        });
        return;
    }

    const newValue = 
      textarea.value.substring(0, start) +
      `<${tag}>${selectedText}</${tag}>` +
      textarea.value.substring(end);
      
    setProduct({ ...product, [field]: newValue });

    setTimeout(() => {
      textarea.focus();
      textarea.setSelectionRange(start + `<${tag}>`.length, end + `<${tag}>`.length);
    }, 0);
  };

  const handleSaveChanges = async () => {
    setIsSaving(true);
    const user = auth.currentUser;
    if (!user || !product) {
      toast({ title: 'Error', description: 'Cannot save product.', variant: 'destructive' });
      setIsSaving(false);
      return;
    }
    
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { imageUrl, ...payload } = product;

    try {
      const token = await user.getIdToken();
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


  return (
    <Dialog open={true} onOpenChange={() => onClose(false)}>
      <DialogContent className="sm:max-w-6xl flex flex-col max-h-[90vh]">
        <DialogHeader>
          <DialogTitle>Editar Producto</DialogTitle>
          <DialogDescription>
            Realiza cambios en los detalles del producto. La vista previa de la derecha se actualizará en tiempo real.
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
           <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 py-4 flex-1 overflow-y-hidden">
              {/* --- EDITING PANE --- */}
              <div className="lg:col-span-2 space-y-6 overflow-y-auto pr-4">
                
                <section className="space-y-4">
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
                </section>
                
                <Separator />

                <section className="space-y-4">
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
                </section>
                
                <Separator />

                <section className="space-y-4">
                   <h3 className="text-lg font-medium text-foreground">Descripciones</h3>
                    <div>
                        <Label htmlFor="short_description">Descripción Corta</Label>
                        <div className="mt-1 rounded-md border bg-background">
                            <div className="p-1 flex items-center gap-1 border-b bg-muted/50">
                                <Button type="button" size="sm" variant="ghost" className="font-bold" onClick={() => handleApplyTag(shortDescRef, 'short_description', 'strong')}>B</Button>
                                <Button type="button" size="sm" variant="ghost" className="italic" onClick={() => handleApplyTag(shortDescRef, 'short_description', 'em')}>I</Button>
                            </div>
                            <Textarea ref={shortDescRef} id="short_description" name="short_description" value={product.short_description} onChange={handleInputChange} rows={4} className="border-0 focus-visible:ring-0 focus-visible:ring-offset-0 rounded-t-none" />
                        </div>
                    </div>
                    <div>
                        <Label htmlFor="description">Descripción Larga</Label>
                        <div className="mt-1 rounded-md border bg-background">
                             <div className="p-1 flex items-center gap-1 border-b bg-muted/50">
                                <Button type="button" size="sm" variant="ghost" className="font-bold" onClick={() => handleApplyTag(longDescRef, 'description', 'strong')}>B</Button>
                                <Button type="button" size="sm" variant="ghost" className="italic" onClick={() => handleApplyTag(longDescRef, 'description', 'em')}>I</Button>
                            </div>
                            <Textarea ref={longDescRef} id="description" name="description" value={product.description} onChange={handleInputChange} rows={10} className="border-0 focus-visible:ring-0 focus-visible:ring-offset-0 rounded-t-none" />
                        </div>
                    </div>
                </section>
              </div>
              
              {/* --- PREVIEW PANE --- */}
              <div className="lg:col-span-1 hidden lg:flex flex-col bg-muted/30 rounded-lg p-4 space-y-4 overflow-y-auto">
                <h3 className="text-lg font-medium text-center sticky top-0 bg-muted/30 py-2 z-10 border-b -mx-4 px-4">Vista Previa</h3>
                <div className="pt-2 space-y-4">
                    <div className="relative aspect-square w-32 h-32 mx-auto rounded-lg overflow-hidden">
                      {product.imageUrl ? (
                        <Image
                          src={product.imageUrl}
                          alt={product.name || 'Product image'}
                          fill
                          className="object-cover"
                        />
                      ) : (
                        <div className="bg-muted rounded-md w-full h-full flex items-center justify-center">
                          <span className="text-muted-foreground text-xs">Sin imagen</span>
                        </div>
                      )}
                    </div>
                    <h4 className="text-xl font-semibold truncate text-center">{product.name || "Nombre del Producto"}</h4>
                     <div className="text-center space-x-1">
                        <Badge variant={product.status === 'publish' ? 'default' : 'secondary'} className="capitalize">{product.status}</Badge>
                        <Badge variant="outline">{categoryTree.find(c => c.category.id === product.category_id)?.category.name || 'Sin Categoría'}</Badge>
                    </div>
                    <div className="flex items-baseline justify-center gap-2 mt-2">
                      {product.sale_price ? (
                        <>
                          <p className="text-2xl font-bold text-primary">{product.sale_price}€</p>
                          <p className="text-md text-muted-foreground line-through">{product.regular_price}€</p>
                        </>
                      ) : (
                        <p className="text-2xl font-bold">{product.regular_price ? `${product.regular_price}€` : 'N/A'}</p>
                      )}
                    </div>
                    <div className="space-y-4 text-sm">
                        <Separator />
                        <div>
                            <h5 className="font-semibold mb-2">Descripción Corta</h5>
                            <div className="prose prose-sm max-w-none text-muted-foreground" dangerouslySetInnerHTML={{ __html: product.short_description || "..." }} />
                        </div>
                         <div>
                            <h5 className="font-semibold mb-2">Descripción Larga</h5>
                            <div className="prose prose-sm max-w-none text-muted-foreground [&_strong]:text-foreground [&_em]:text-foreground" dangerouslySetInnerHTML={{ __html: product.description || "..." }} />
                        </div>
                        {product.tags && (
                          <div>
                            <h5 className="font-semibold mb-2">Etiquetas</h5>
                            <div className="flex flex-wrap gap-2">
                              {product.tags.split(',').map(k => k.trim()).filter(k => k).map((keyword, index) => (
                                <Badge key={index} variant="secondary">{keyword}</Badge>
                              ))}
                            </div>
                          </div>
                        )}
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

    