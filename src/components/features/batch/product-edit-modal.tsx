
"use client";

import React, { useEffect, useState } from 'react';
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
import { Card, CardContent } from '@/components/ui/card';

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
}

export function ProductEditModal({ productId, onClose }: ProductEditModalProps) {
  const [product, setProduct] = useState<ProductEditState | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { toast } = useToast();

  useEffect(() => {
    const fetchProductData = async () => {
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
        const response = await fetch(`/api/woocommerce/products/${productId}`, {
          headers: { 'Authorization': `Bearer ${token}` }
        });

        if (!response.ok) {
          const errorData = await response.json();
          throw new Error(errorData.error || 'Failed to fetch product data.');
        }

        const data = await response.json();
        setProduct({
          name: data.name || '',
          sku: data.sku || '',
          regular_price: data.regular_price || '',
          sale_price: data.sale_price || '',
          short_description: data.short_description || '',
          description: data.description || '',
          imageUrl: data.images?.length > 0 ? data.images[0].src : null,
        });
      } catch (e: any) {
        setError(e.message);
        toast({ title: 'Error', description: e.message, variant: 'destructive' });
      } finally {
        setIsLoading(false);
      }
    };

    fetchProductData();
  }, [productId, toast]);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    if (!product) return;
    setProduct({ ...product, [e.target.name]: e.target.value });
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
      onClose(true); // Close modal and trigger refresh

    } catch (e: any) {
      toast({ title: 'Error al Guardar', description: e.message, variant: 'destructive' });
    } finally {
      setIsSaving(false);
    }
  };


  return (
    <Dialog open={true} onOpenChange={() => onClose(false)}>
      <DialogContent className="sm:max-w-4xl">
        <DialogHeader>
          <DialogTitle>Editar Producto</DialogTitle>
          <DialogDescription>
            Realiza cambios en los detalles del producto. La vista previa se actualizará en tiempo real.
          </DialogDescription>
        </DialogHeader>
        
        {isLoading && (
          <div className="flex items-center justify-center h-64">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            <p className="ml-3 text-muted-foreground">Cargando datos del producto...</p>
          </div>
        )}

        {error && !isLoading && (
          <Alert variant="destructive">
            <AlertTitle>Error al cargar</AlertTitle>
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}
        
        {!isLoading && !error && product && (
           <div className="grid grid-cols-1 md:grid-cols-2 gap-8 py-4">
              <div className="md:col-span-1 space-y-4 max-h-[60vh] overflow-y-auto pr-4">
                <div>
                  <Label htmlFor="name">Nombre</Label>
                  <Input id="name" name="name" value={product.name} onChange={handleInputChange} />
                </div>
                <div>
                  <Label htmlFor="sku">SKU</Label>
                  <Input id="sku" name="sku" value={product.sku} onChange={handleInputChange} />
                </div>
                <div className="grid grid-cols-2 gap-4">
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
                    <Label htmlFor="short_description">Descripción Corta</Label>
                    <Textarea id="short_description" name="short_description" value={product.short_description} onChange={handleInputChange} rows={4} />
                </div>
                <div>
                    <Label htmlFor="description">Descripción Larga</Label>
                    <Textarea id="description" name="description" value={product.description} onChange={handleInputChange} rows={8} />
                </div>
              </div>
              
              <div className="md:col-span-1 hidden md:block">
                <h3 className="text-lg font-medium mb-4 text-center">Vista Previa</h3>
                <Card className="sticky top-4">
                  <CardContent className="p-4">
                    <div className="relative aspect-square w-full mb-4">
                      {product.imageUrl ? (
                        <Image
                          src={product.imageUrl}
                          alt={product.name || 'Product image'}
                          fill
                          className="rounded-md object-cover"
                        />
                      ) : (
                        <div className="bg-muted rounded-md w-full h-full flex items-center justify-center">
                          <span className="text-muted-foreground">Sin imagen</span>
                        </div>
                      )}
                    </div>
                    <h4 className="text-xl font-semibold truncate">{product.name || "Nombre del Producto"}</h4>
                    <div className="flex items-baseline gap-2 mt-2">
                      {product.sale_price ? (
                        <>
                          <p className="text-2xl font-bold text-primary">{product.sale_price}€</p>
                          <p className="text-lg text-muted-foreground line-through">{product.regular_price}€</p>
                        </>
                      ) : (
                        <p className="text-2xl font-bold">{product.regular_price ? `${product.regular_price}€` : 'N/A'}</p>
                      )}
                    </div>
                    <div className="mt-4 prose prose-sm max-w-none text-muted-foreground" dangerouslySetInnerHTML={{ __html: product.short_description || "Descripción corta..." }} />
                  </CardContent>
                </Card>
              </div>
           </div>
        )}

        <DialogFooter>
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
