
// src/app/(app)/products/edit/[id]/page.tsx
"use client";

import React, { useEffect, useState, Suspense, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Loader2, ArrowLeft, Save, Trash2 } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { auth, onAuthStateChanged } from '@/lib/firebase';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import type { WooCommerceCategory, ProductPhoto, ProductVariation } from '@/lib/types';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogHeader, AlertDialogTitle, AlertDialogDescription, AlertDialogFooter } from '@/components/ui/alert-dialog';
import { Step1DetailsPhotos } from '@/app/(app)/wizard/step-1-details-photos';
import { ProductData } from '@/lib/types';

export interface ProductEditState extends ProductData {
    id: number;
    variations?: ProductVariation[];
}

function EditProductPageContent() {
  const params = useParams();
  const router = useRouter();
  const productId = Number(params.id);

  const [product, setProduct] = useState<ProductEditState | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  const { toast } = useToast();

  const updateProductData = useCallback((data: Partial<ProductEditState>) => {
    setProduct(prev => (prev ? { ...prev, ...data } : null));
  }, []);

  const handlePhotosChange = useCallback((updatedPhotos: ProductPhoto[]) => {
    updateProductData({ photos: updatedPhotos });
  }, [updateProductData]);
  
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
        const formData = new FormData();
        
        // Append product data as a JSON string
        formData.append('productData', JSON.stringify(product));
        
        // Append only new image files
        const newPhotoFiles = product.photos.filter(p => p.file);
        newPhotoFiles.forEach(photo => {
            if (photo.file) {
                // Use a consistent key for the backend to receive the files
                formData.append('photos', photo.file, photo.name);
            }
        });
        
        const response = await fetch(`/api/woocommerce/products/${productId}`, {
            method: 'PUT',
            headers: { 'Authorization': `Bearer ${token}` },
            body: formData,
        });
        
        const result = await response.json();
        if (!response.ok) {
            throw new Error(result.error || result.details?.message || 'Fallo al guardar los cambios del producto.');
        }
        
        toast({ title: '¡Éxito!', description: 'El producto ha sido actualizado.' });
        router.push('/batch');

    } catch (e: any) {
        toast({ title: 'Error al Guardar', description: e.message, variant: 'destructive' });
    } finally {
        setIsSaving(false);
    }
  };


  const handleDelete = async () => {
    setIsDeleting(true);
    const user = auth.currentUser;
    if (!user) {
      toast({ title: 'Error de autenticación', variant: 'destructive' });
      setIsDeleting(false);
      return;
    }
    
    try {
        const token = await user.getIdToken();
        const response = await fetch(`/api/woocommerce/products/${productId}`, {
            method: 'DELETE',
            headers: { 'Authorization': `Bearer ${token}` }
        });
        if (!response.ok) throw new Error('Failed to delete product.');
        toast({ title: 'Producto eliminado permanentemente.'});
        router.push('/batch');
    } catch(e: any) {
        toast({ title: 'Error al eliminar', description: e.message, variant: 'destructive' });
    } finally {
        setIsDeleting(false);
    }
  };
  
  const fetchInitialData = useCallback(async () => {
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
        const productResponse = await fetch(`/api/woocommerce/products/${productId}`, { headers: { 'Authorization': `Bearer ${token}` }});

        if (!productResponse.ok) {
          const errorData = await productResponse.json();
          throw new Error(errorData.error || 'Failed to fetch product data.');
        }
        const productData = await productResponse.json();

        const existingImagesAsProductPhotos: ProductPhoto[] = (productData.images || []).map(
          (img: { id: number; src: string; name: string; }, index: number): ProductPhoto => ({
              id: img.id, previewUrl: img.src, name: img.name, isPrimary: index === 0, status: 'completed', progress: 100,
          })
        );
        
        const existingVariations: ProductVariation[] = (productData.variations || []).map((v: any) => ({
             variation_id: v.id, id: v.id.toString(), attributes: v.attributes, sku: v.sku, regularPrice: v.regular_price,
             salePrice: v.sale_price, manage_stock: v.manage_stock, stockQuantity: v.stock_quantity, weight: v.weight,
             dimensions: v.dimensions, shipping_class: v.shipping_class, image: v.image,
        }));

        const supplierAttribute = Array.isArray(productData.attributes) ? productData.attributes.find((a: any) => a.name === 'Proveedor') : null;
        
        let mainCategoryId = null;
        if(Array.isArray(productData.categories) && productData.categories.length > 0) {
            const categoriesResponse = await fetch('/api/woocommerce/categories', { headers: { 'Authorization': `Bearer ${token}` }});
            if(categoriesResponse.ok) {
                const allCategories = await categoriesResponse.json();
                const parentSupplierCategory = allCategories.find((c: WooCommerceCategory) => c.name.toLowerCase() === 'proveedores' && c.parent === 0);
                const supplierSubCats = parentSupplierCategory ? allCategories.filter((c: any) => c.parent === parentSupplierCategory.id).map((c: any) => c.id) : [];
                
                const mainCat = productData.categories.find((c: any) => !parentSupplierCategory || (c.id !== parentSupplierCategory.id && !supplierSubCats.includes(c.id)));
                mainCategoryId = mainCat ? mainCat.id : productData.categories[0].id;
            } else {
                 mainCategoryId = productData.categories[0].id;
            }
        }
        
        setProduct({
          id: productData.id,
          name: productData.name || '',
          sku: productData.sku || '',
          supplier: supplierAttribute ? supplierAttribute.options[0] : null,
          productType: productData.type || 'simple',
          regular_price: productData.regular_price || '',
          sale_price: productData.sale_price || '',
          short_description: productData.short_description || '',
          description: productData.description || '',
          photos: existingImagesAsProductPhotos,
          variations: existingVariations,
          status: productData.status || 'draft',
          tags: (productData.tags?.map((t: any) => t.name) || []),
          category_id: mainCategoryId,
          manage_stock: productData.manage_stock || false,
          stockQuantity: productData.stock_quantity?.toString() || '',
          weight: productData.weight || '',
          dimensions: productData.dimensions || { length: '', width: '', height: '' },
          shipping_class: productData.shipping_class || '',
          attributes: productData.attributes || [],
          language: 'Spanish', 
          targetLanguages: [], 
          shouldSaveSku: true, 
          source: 'wizard', 
          category: null,
        });

      } catch (e: any) {
        setError(e.message);
        toast({ title: 'Error', description: e.message, variant: 'destructive' });
      } finally {
        setIsLoading(false);
      }
    }, [productId, toast]);


  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
        if (user) {
            fetchInitialData();
        } else {
            router.push('/login');
        }
    });
    return () => unsubscribe();
  }, [fetchInitialData, router]);
  
  if (isLoading) {
    return <div className="flex items-center justify-center min-h-[calc(100vh-8rem)] w-full"><Loader2 className="h-10 w-10 animate-spin text-primary" /></div>;
  }
  
  if (error || !product) {
     return (
        <div className="container mx-auto py-8"><Alert variant="destructive"><AlertTitle>Error al Cargar</AlertTitle><AlertDescription>{error || "No se pudo cargar la información del producto."}</AlertDescription><Button variant="outline" onClick={() => router.push('/batch')} className="mt-4"><ArrowLeft className="mr-2 h-4 w-4" />Volver a la lista</Button></Alert></div>
     );
  }

  return (
    <>
      <div className="container mx-auto py-8 space-y-6">
          <Card>
              <CardHeader>
                  <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                      <div>
                          <CardTitle>Editor de Producto</CardTitle>
                          <CardDescription>Editando: {product.name}</CardDescription>
                      </div>
                      <div className="flex flex-wrap gap-2">
                          <Button variant="outline" onClick={() => router.back()}>
                              <ArrowLeft className="mr-2 h-4 w-4" />
                              Volver
                          </Button>
                          <Button onClick={handleSaveChanges} disabled={isSaving}>
                              {isSaving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                              Guardar Cambios
                          </Button>
                      </div>
                  </div>
              </CardHeader>
          </Card>
          
          <Step1DetailsPhotos 
            productData={product} 
            updateProductData={updateProductData} 
            onPhotosChange={handlePhotosChange}
            isProcessing={isSaving} 
            originalProduct={product} 
          />

          <Card>
              <CardHeader>
                  <CardTitle className="text-destructive">Zona de Peligro</CardTitle>
              </CardHeader>
              <CardContent>
                  <AlertDialog>
                      <AlertDialogTrigger asChild>
                          <Button variant="destructive" className="w-full" disabled={isDeleting}>
                              <Trash2 className="mr-2 h-4 w-4" /> Eliminar Producto Permanentemente
                          </Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                          <AlertDialogHeader><AlertDialogTitle>¿Estás absolutamente seguro?</AlertDialogTitle><AlertDialogDescription>Esta acción no se puede deshacer. Se eliminará permanentemente este producto.</AlertDialogDescription></AlertDialogHeader>
                          <AlertDialogFooter><AlertDialogCancel>Cancelar</AlertDialogCancel><AlertDialogAction onClick={handleDelete}>Sí, eliminar</AlertDialogAction></AlertDialogFooter>
                      </AlertDialogContent>
                  </AlertDialog>
              </CardContent>
          </Card>
      </div>
    </>
  );
}

export default function EditProductPage() {
    return (
        <Suspense fallback={<div className="flex items-center justify-center min-h-[calc(100vh-8rem)] w-full"><Loader2 className="h-10 w-10 animate-spin text-primary" /></div>}>
            <EditProductPageContent />
        </Suspense>
    )
}
