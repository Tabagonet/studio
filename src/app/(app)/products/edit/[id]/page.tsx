
// src/app/(app)/products/edit/[id]/page.tsx
"use client";

import React, { useEffect, useState, Suspense, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { Button, buttonVariants } from '@/components/ui/button';
import { Loader2, ArrowLeft, Save, Trash2, PlusCircle, Sparkles } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { onAuthStateChanged, auth } from '@/lib/firebase';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import type { WooCommerceCategory, ProductPhoto, ProductVariation, ProductAttribute, ProductData, LinkSuggestion, SuggestLinksOutput } from '@/lib/types';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogHeader, AlertDialogTitle, AlertDialogDescription, AlertDialogFooter, AlertDialogTrigger } from '@/components/ui/alert-dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { RichTextEditor } from '@/components/features/editor/rich-text-editor';
import { LinkSuggestionsDialog } from '@/components/features/editor/link-suggestions-dialog';
import { VariationEditor } from '@/components/features/products/variation-editor';
import { PRODUCT_TYPES } from '@/lib/constants';
import { ComboBox } from '@/components/core/combobox';
import { ImageUploader } from '@/components/features/wizard/image-uploader';


function EditPageContent() {
  const params = useParams();
  const router = useRouter();
  const productId = Number(params.id);

  const [product, setProduct] = useState<ProductData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [wooCategories, setWooCategories] = useState<WooCommerceCategory[]>([]);
  const [supplierCategories, setSupplierCategories] = useState<WooCommerceCategory[]>([]);
  const [isLoadingCategories, setIsLoadingCategories] = useState(true);
  const [isImageDialogOpen, setIsImageDialogOpen] = useState(false);
  const [imageUrl, setImageUrl] = useState('');
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [isUploadingImage, setIsUploadingImage] = useState(false);
  const [isSuggestingLinks, setIsSuggestingLinks] = useState(false);
  const [linkSuggestions, setLinkSuggestions] = useState<LinkSuggestion[]>([]);

  const [isGenerating, setIsGenerating] = useState(false);
  const [isGeneratingImageMeta, setIsGeneratingImageMeta] = useState(false);
  
  const { toast } = useToast();
  
  const updateProductData = useCallback((data: Partial<ProductData> | ((prevState: ProductData) => Partial<ProductData>)) => {
    setProduct(prev => {
        if (!prev) return null;
        const updates = typeof data === 'function' ? data(prev) : data;
        const newState = { ...prev, ...updates };
        return newState;
    });
  }, []);
  
  const handlePhotosChange = useCallback((updatedPhotos: ProductPhoto[]) => {
      updateProductData({ photos: updatedPhotos });
  }, [updateProductData]);

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
        
        const [productResponse, categoriesResponse] = await Promise.all([
          fetch(`/api/woocommerce/products/${productId}`, { headers: { 'Authorization': `Bearer ${token}` } }),
          fetch('/api/woocommerce/categories', { headers: { 'Authorization': `Bearer ${token}` } }),
        ]);

        if (!productResponse.ok) {
          const errorData = await productResponse.json();
          throw new Error(errorData.error || 'Failed to fetch product data.');
        }
        const productData = await productResponse.json();
        
        let fetchedCategories: WooCommerceCategory[] = [];
        if (categoriesResponse.ok) {
            fetchedCategories = await categoriesResponse.json();
            const parentSupplierCategory = fetchedCategories.find((c: WooCommerceCategory) => c.name.toLowerCase() === 'proveedores' && c.parent === 0);
            const supplierParentId = parentSupplierCategory?.id;
            setSupplierCategories(supplierParentId ? fetchedCategories.filter((c: WooCommerceCategory) => c.parent === supplierParentId) : []);
            setWooCategories(fetchedCategories.filter((c: WooCommerceCategory) => !supplierParentId || (c.id !== supplierParentId && c.parent !== supplierParentId)));
        }
        setIsLoadingCategories(false);


        const existingImagesAsProductPhotos: ProductPhoto[] = (productData.images || []).map(
          (img: { id: number; src: string; name: string; }, index: number): ProductPhoto => ({
              id: img.id, previewUrl: img.src, name: img.name, isPrimary: index === 0, status: 'completed', progress: 100, toDelete: false
          })
        );
        
        const existingVariations: ProductVariation[] = (productData.variations || []).map((v: any) => ({
             variation_id: v.id, id: v.id.toString(), attributes: v.attributes, sku: v.sku, regularPrice: v.regular_price,
             salePrice: v.sale_price, manage_stock: v.manage_stock, stockQuantity: v.stock_quantity?.toString() || '', weight: v.weight,
             dimensions: v.dimensions, shipping_class: v.shipping_class, image: v.image,
        }));
        
        const supplierAttribute = Array.isArray(productData.attributes) ? productData.attributes.find((a: any) => a.name === 'Proveedor') : null;
        
        const mainCategory = productData.categories?.find((c: any) => {
            const supplierParent = fetchedCategories.find((cat: any) => cat.name.toLowerCase() === 'proveedores' && cat.parent === 0);
            return !supplierParent || (c.parent !== supplierParent.id && c.id !== supplierParent.id);
        });
        
        const formattedAttributes = (productData.attributes || []).map((attr: any): ProductAttribute => ({
            id: attr.id || 0,
            name: attr.name,
            value: (attr.options || []).join(' | '),
            options: (attr.options || []),
            position: attr.position,
            visible: attr.visible,
            forVariations: attr.variation || false,
            variation: attr.variation || false,
        }));

        const finalProductState: ProductData = {
          id: productData.id,
          name: productData.name || '',
          sku: productData.sku || '',
          productType: productData.type || 'simple',
          supplier: supplierAttribute ? supplierAttribute.options[0] : null,
          regularPrice: productData.regular_price || '',
          salePrice: productData.sale_price || '',
          shortDescription: productData.short_description || '',
          longDescription: productData.description || '',
          photos: existingImagesAsProductPhotos,
          variations: existingVariations,
          status: productData.status || 'draft',
          tags: productData.tags?.map((t: any) => t.name) || [],
          category_id: mainCategory ? mainCategory.id : null,
          category: mainCategory,
          manage_stock: productData.manage_stock || false,
          stockQuantity: productData.stock_quantity?.toString() || '',
          weight: productData.weight || '',
          dimensions: productData.dimensions || { length: '', width: '', height: '' },
          shipping_class: productData.shipping_class || '',
          attributes: formattedAttributes,
          language: productData.lang || 'es',
        };
        
        setProduct(finalProductState);

      } catch (e: any) {
        setError(e.message);
        toast({ title: 'Error', description: e.message, variant: 'destructive' });
      } finally {
        setIsLoading(false);
      }
    }, [productId, toast]);
    
  const handleSaveChanges = async () => {
    setIsSaving(true);
    const user = auth.currentUser;
    if (!user || !product) {
        toast({ title: 'Error', description: 'No se puede guardar el producto.', variant: 'destructive' });
        setIsSaving(false);
        return;
    }

    const sortedImages = [...product.photos].sort((a,b) => (a.isPrimary ? -1 : b.isPrimary ? 1 : 0));

    try {
        const token = await user.getIdToken();
        const formData = new FormData();

        const payloadForJson = {
            name: product.name,
            sku: product.sku,
            type: product.productType,
            status: product.status,
            regular_price: product.regularPrice,
            sale_price: product.salePrice,
            description: product.longDescription,
            short_description: product.shortDescription,
            tags: product.tags,
            category_id: product.category_id,
            categoryPath: product.categoryPath,
            supplier: product.supplier,
            newSupplier: product.newSupplier,
            manage_stock: product.manage_stock,
            stock_quantity: product.stockQuantity,
            weight: product.weight,
            dimensions: product.dimensions,
            shipping_class: product.shipping_class,
            attributes: product.attributes,
            variations: product.variations,
            images: sortedImages.map(img => ({
                id: img.id,
                isPrimary: img.isPrimary,
                toDelete: img.toDelete
            })),
            imageTitle: product.imageTitle,
            imageAltText: product.imageAltText,
            imageCaption: product.imageCaption,
            imageDescription: product.imageDescription,
        };
        
        formData.append('productData', JSON.stringify(payloadForJson));
        
        const newPhotoFiles = product.photos.filter(p => p.file && !p.toDelete);
        newPhotoFiles.forEach(photo => {
            if (photo.file) {
                 formData.append(photo.id.toString(), photo.file, photo.name);
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
        fetchInitialData(); 

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
  
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
        if (user) {
            fetchInitialData();
        } else {
            router.push('/login');
        }
    });
    return unsubscribe;
  }, [fetchInitialData, router]);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!product) return;
    updateProductData({ [e.target.name]: e.target.value });
  };
  
  const handleSelectChange = (name: 'status' | 'productType', value: string) => {
    if (!product) return;
    if (name === 'productType' && value === 'variable' && product.attributes.length === 0) {
      updateProductData({ [name]: value as any, attributes: [{ name: '', value: '', forVariations: false, visible: true, options: [] }] });
    } else {
      updateProductData({ [name]: value as any });
    }
  };
  
  const handleDimensionChange = (dim: 'length' | 'width' | 'height', value: string) => {
    if (!product) return;
    updateProductData({
      dimensions: { ...(product.dimensions || {}), [dim]: value } as any,
    });
  };

   const handleAttributeChange = (index: number, field: keyof ProductAttribute, value: string | boolean) => {
    if (!product) return;
    updateProductData(prev => {
        if (!prev) return prev;
        const newAttributes = [...prev.attributes];
        const updatedAttr = { ...newAttributes[index], [field]: value };
        if(field === 'value' && typeof value === 'string') {
            updatedAttr.options = value.split('|').map(s => s.trim()).filter(Boolean);
        }
        newAttributes[index] = updatedAttr;
        return { attributes: newAttributes };
    });
  };
  
  const addAttribute = () => {
    if (!product) return;
    updateProductData({ attributes: [...product.attributes, { name: '', value: '', forVariations: false, visible: true, options: [] }] });
  };

  const removeAttribute = (index: number) => {
    if (!product) return;
    const newAttributes = product.attributes.filter((_, i) => i !== index);
    updateProductData({ attributes: newAttributes });
  };
  
  const handleShortDescriptionChange = (newContent: string) => {
    if (!product) return;
    updateProductData({ shortDescription: newContent });
  };

  const handleLongDescriptionChange = (newContent: string) => {
    if (!product) return;
    updateProductData({ longDescription: newContent });
  };

  const handleInsertImageInLongDesc = async () => {
    let finalImageUrl = imageUrl;
    if (imageFile) {
        setIsUploadingImage(true);
        try {
            const user = auth.currentUser; if (!user) throw new Error("No autenticado.");
            const token = await user.getIdToken();
            const formData = new FormData(); formData.append('imagen', imageFile);
            const response = await fetch('/api/upload-image', { method: 'POST', headers: { 'Authorization': `Bearer ${token}` }, body: formData });
            if (!response.ok) throw new Error((await response.json()).error || 'Fallo en la subida de imagen.');
            finalImageUrl = (await response.json()).url;
        } catch (err: any) {
            toast({ title: 'Error al subir imagen', description: err.message, variant: 'destructive' });
            setIsUploadingImage(false); return;
        } finally { setIsUploadingImage(false); }
    }
    if (!finalImageUrl) {
        toast({ title: 'Falta la imagen', description: 'Por favor, sube un archivo o introduce una URL.', variant: 'destructive' }); return;
    }
    const imgTag = `<img src="${finalImageUrl}" alt="${product?.name || 'Imagen insertada'}" loading="lazy" style="max-width: 100%; height: auto; border-radius: 8px;" />`;
    updateProductData({ longDescription: (product?.longDescription || '') + `\n${imgTag}` });
    setImageUrl(''); setImageFile(null); setIsImageDialogOpen(false);
  };
  
  const handleSuggestLinks = async () => {
    if (!product?.longDescription.trim()) {
        toast({ title: "Contenido vacío", description: "Escribe algo en la descripción larga antes de pedir sugerencias.", variant: "destructive" }); return;
    }
    setIsSuggestingLinks(true);
    try {
        const user = auth.currentUser; if (!user) throw new Error("No autenticado.");
        const token = await user.getIdToken();
        const response = await fetch('/api/ai/suggest-links', {
            method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
            body: JSON.stringify({ content: product.longDescription })
        });
        if (!response.ok) throw new Error((await response.json()).message || "La IA falló al sugerir enlaces.");
        
        const data: SuggestLinksOutput = await response.json();
        setLinkSuggestions(data.suggestions || []);

    } catch(e: any) {
        toast({ title: "Error al sugerir enlaces", description: e.message, variant: "destructive" });
        setLinkSuggestions([]);
    } finally { setIsSuggestingLinks(false); }
  };

  const applyLink = (content: string, suggestion: LinkSuggestion): string => {
    const phrase = suggestion.phraseToLink.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const regex = new RegExp(`(?<!<a[^>]*>)${phrase}(?!<\\/a>)`, '');
    if (content.match(regex)) {
        return content.replace(regex, `<a href="${suggestion.targetUrl}" target="_blank">${suggestion.phraseToLink}</a>`);
    }
    return content;
  };

  const handleApplySuggestion = (suggestion: LinkSuggestion) => {
    if (!product || typeof product.longDescription !== 'string') return;
    const newContent = applyLink(product.longDescription, suggestion);
    if (newContent !== product.longDescription) {
        updateProductData({ longDescription: newContent });
        toast({ title: "Enlace aplicado", description: `Se ha enlazado la frase "${suggestion.phraseToLink}".` });
        setLinkSuggestions(prev => prev.filter(s => s.phraseToLink !== suggestion.phraseToLink || s.targetUrl !== suggestion.targetUrl));
    } else {
        toast({ title: "No se pudo aplicar", description: "No se encontró la frase exacta o ya estaba enlazada.", variant: "destructive" });
    }
  };
  
  const handleApplyAllSuggestions = () => {
     if (!product || typeof product.longDescription !== 'string') return;
     let updatedContent = product.longDescription;
     let appliedCount = 0;
     for (const suggestion of linkSuggestions) {
         const newContent = applyLink(updatedContent, suggestion);
         if (newContent !== updatedContent) {
             updatedContent = newContent;
             appliedCount++;
         }
     }
     if (appliedCount > 0) {
        updateProductData({ longDescription: updatedContent });
        toast({ title: "Enlaces aplicados", description: `Se han aplicado ${appliedCount} sugerencias de enlaces.` });
        setLinkSuggestions([]);
     } else {
        toast({ title: "No se aplicó nada", description: "No se encontraron frases o ya estaban enlazadas.", variant: "destructive" });
     }
  };

  const handleGenerateContentWithAI = async () => {
    if (!product) return;
    setIsGenerating(true);
    try {
        const user = auth.currentUser;
        if (!user) throw new Error("No autenticado.");
        const token = await user.getIdToken();
        const payload = {
            baseProductName: product.name,
            productName: product.name,
            productType: product.productType,
            tags: product.tags.join(','),
            language: product.language === 'es' ? 'Spanish' : 'English',
            groupedProductIds: product.groupedProductIds,
        };
        const response = await fetch('/api/generate-description', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
            body: JSON.stringify(payload)
        });
        if (!response.ok) throw new Error((await response.json()).error || 'Fallo de la IA');
        const aiContent = await response.json();
        updateProductData({
            name: aiContent.name,
            shortDescription: aiContent.shortDescription,
            longDescription: aiContent.longDescription,
            tags: aiContent.tags,
            imageTitle: aiContent.imageTitle,
            imageAltText: aiContent.imageAltText,
            imageCaption: aiContent.imageCaption,
            imageDescription: aiContent.imageDescription,
        });
        toast({ title: "¡Contenido generado!", description: "Se han actualizado las descripciones y etiquetas." });
    } catch (e: any) {
        toast({ title: "Error de IA", description: e.message, variant: "destructive" });
    } finally {
        setIsGenerating(false);
    }
  };

  const handleGenerateImageMetadata = async () => {
    if (!product) return;
    setIsGeneratingImageMeta(true);
    try {
        const user = auth.currentUser;
        if (!user) throw new Error("No autenticado.");
        const token = await user.getIdToken();
        const payload = {
            productName: product.name, productType: product.productType,
            tags: product.tags.join(','),
            language: product.language === 'es' ? 'Spanish' : 'English',
            mode: 'image_meta_only',
        };
        const response = await fetch('/api/generate-description', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
            body: JSON.stringify(payload)
        });
        if (!response.ok) throw new Error((await response.json()).error || 'Fallo de la IA');
        const aiContent = await response.json();
        updateProductData({
            imageTitle: aiContent.imageTitle, imageAltText: aiContent.imageAltText,
            imageCaption: aiContent.imageCaption, imageDescription: aiContent.imageDescription,
        });
        toast({ title: "Metadatos de imagen generados", description: "Se han actualizado los datos SEO para las imágenes." });
    } catch (e: any) {
        toast({ title: "Error de IA", description: e.message, variant: "destructive" });
    } finally {
        setIsGeneratingImageMeta(false);
    }
  };

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
                              <Save className="mr-2 h-4 w-4" />
                              Guardar Cambios
                          </Button>
                      </div>
                  </div>
              </CardHeader>
          </Card>
          
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start">
              <div className="lg:col-span-2 space-y-6">
                  <Card>
                      <CardHeader><CardTitle>Información Principal</CardTitle></CardHeader>
                      <CardContent className="space-y-4">
                          <div><Label htmlFor="name">Nombre del Producto</Label><Input id="name" name="name" value={product.name} onChange={handleInputChange} /></div>
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                              <div><Label htmlFor="sku">SKU</Label><Input id="sku" name="sku" value={product.sku} onChange={handleInputChange} /></div>
                               <div>
                                    <Label>Proveedor</Label>
                                    <ComboBox
                                        items={supplierCategories.map(s => ({ value: s.name, label: s.name }))}
                                        selectedValue={product.supplier || ''}
                                        onSelect={(value) => {
                                            updateProductData(prev => {
                                                if(!prev) return prev;
                                                const newAttributes = [...prev.attributes];
                                                const supplierAttrIndex = newAttributes.findIndex(a => a.name === 'Proveedor');
                                                if (supplierAttrIndex > -1) {
                                                    newAttributes[supplierAttrIndex].options = [value];
                                                    newAttributes[supplierAttrIndex].value = value;
                                                } else {
                                                    newAttributes.push({ name: 'Proveedor', value: value, options: [value], visible: true, forVariations: false });
                                                }
                                                return { supplier: value, newSupplier: '', attributes: newAttributes };
                                            });
                                        }}
                                        onNewItemChange={(value) => {
                                            updateProductData(prev => {
                                                if(!prev) return prev;
                                                const newAttributes = [...prev.attributes];
                                                const supplierAttrIndex = newAttributes.findIndex(a => a.name === 'Proveedor');
                                                if (supplierAttrIndex > -1) {
                                                    newAttributes[supplierAttrIndex].options = [value];
                                                    newAttributes[supplierAttrIndex].value = value;
                                                } else {
                                                    newAttributes.push({ name: 'Proveedor', value: value, options: [value], visible: true, forVariations: false });
                                                }
                                                return { supplier: null, newSupplier: value, attributes: newAttributes };
                                            });
                                        }}
                                        placeholder="Selecciona o crea un proveedor..."
                                        newItemValue={product.newSupplier || ''}
                                        loading={isLoadingCategories}
                                    />
                              </div>
                          </div>
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                              <div><Label htmlFor="status">Estado</Label><Select name="status" value={product.status} onValueChange={(value) => handleSelectChange('status', value)}><SelectTrigger id="status"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="publish">Publicado</SelectItem><SelectItem value="draft">Borrador</SelectItem><SelectItem value="pending">Pendiente</SelectItem><SelectItem value="private">Privado</SelectItem></SelectContent></Select></div>
                              <div>
                                <Label htmlFor="productType">Tipo de Producto</Label>
                                <Select name="productType" value={product.productType} onValueChange={(value) => handleSelectChange('productType', value)}>
                                  <SelectTrigger id="productType"><SelectValue /></SelectTrigger>
                                  <SelectContent>
                                    {PRODUCT_TYPES.map(type => (
                                      <SelectItem key={type.value} value={type.value}>{type.label}</SelectItem>
                                    ))}
                                  </SelectContent>
                                </Select>
                              </div>
                          </div>
                      </CardContent>
                  </Card>
                  
                  {product.productType === 'variable' && (
                     <>
                        <Card>
                          <CardHeader><CardTitle>Precio por Defecto (Opcional)</CardTitle><CardDescription>Este precio se aplicará a cualquier variación nueva que generes si no tiene un precio específico.</CardDescription></CardHeader>
                          <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-4">
                              <div><Label htmlFor="regularPrice">Precio Regular (€)</Label><Input id="regularPrice" name="regularPrice" type="number" value={product.regularPrice} onChange={handleInputChange} /></div>
                              <div><Label htmlFor="salePrice">Precio Oferta (€)</Label><Input id="salePrice" name="salePrice" type="number" value={product.salePrice} onChange={handleInputChange} /></div>
                          </CardContent>
                        </Card>
                        <Card>
                            <CardHeader><CardTitle>Atributos del Producto</CardTitle></CardHeader>
                            <CardContent>
                                {product.attributes.map((attr, index) => (
                                    <div key={index} className="flex flex-col sm:flex-row items-start sm:items-end gap-2 p-3 border rounded-md bg-muted/20 mb-2">
                                        <div className="flex-1 w-full"><Label>Nombre</Label><Input value={attr.name} onChange={(e) => handleAttributeChange(index, 'name', e.target.value)} placeholder="Ej: Color" /></div>
                                        <div className="flex-1 w-full"><Label>Valor(es) (separados por |)</Label><Input value={attr.value || ''} onChange={(e) => handleAttributeChange(index, 'value', e.target.value)} placeholder="Ej: Azul | Rojo | Verde" /></div>
                                        <div className="flex items-center gap-4 pt-2 sm:pt-0 sm:self-end sm:h-10">
                                            <div className="flex items-center space-x-2"><Checkbox checked={attr.forVariations} onCheckedChange={(checked) => handleAttributeChange(index, 'forVariations', !!checked)} /><Label className="text-sm font-normal whitespace-nowrap">Para variaciones</Label></div>
                                            <Button variant="ghost" size="icon" onClick={() => removeAttribute(index)} aria-label="Eliminar atributo" className="flex-shrink-0"><Trash2 className="h-4 w-4 text-destructive" /></Button>
                                        </div>
                                    </div>
                                ))}
                                <Button type="button" variant="outline" onClick={addAttribute} className="mt-2"><PlusCircle className="mr-2 h-4 w-4" /> Añadir Atributo</Button>
                            </CardContent>
                        </Card>
                         <VariationEditor 
                            product={product} 
                            onProductChange={updateProductData}
                            images={product.photos}
                        />
                    </>
                  )}
                  {product.productType === 'simple' && (
                     <>
                        <Card><CardHeader><CardTitle>Precios</CardTitle></CardHeader><CardContent className="grid grid-cols-1 md:grid-cols-2 gap-4"><div><Label htmlFor="regularPrice">Precio Regular (€)</Label><Input id="regularPrice" name="regularPrice" type="number" value={product.regularPrice} onChange={handleInputChange} /></div><div><Label htmlFor="salePrice">Precio Oferta (€)</Label><Input id="salePrice" name="salePrice" type="number" value={product.salePrice} onChange={handleInputChange} /></div></CardContent></Card>
                        <Card><CardHeader><CardTitle>Inventario</CardTitle></CardHeader><CardContent className="space-y-4"><div className="flex items-center space-x-2"><Checkbox id="manage_stock" checked={product.manage_stock} onCheckedChange={(checked) => updateProductData({ manage_stock: !!checked, stockQuantity: !!checked ? product.stockQuantity : '' })} /><Label htmlFor="manage_stock" className="font-normal">Gestionar inventario</Label></div>{product.manage_stock && (<div><Label htmlFor="stockQuantity">Cantidad</Label><Input id="stockQuantity" name="stockQuantity" type="number" value={product.stockQuantity} onChange={handleInputChange} /></div>)}</CardContent></Card>
                     </>
                  )}
                  
                   <Card>
                        <CardHeader>
                            <CardTitle>Descripciones y Asistente IA</CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-4">
                            <div className="flex flex-col sm:flex-row gap-2">
                                <Button onClick={handleGenerateContentWithAI} disabled={isSaving || isGenerating || isGeneratingImageMeta} className="flex-1">
                                    {isGenerating ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Sparkles className="mr-2 h-4 w-4" />}
                                    {isGenerating ? "Generando..." : "Generar Contenido con IA"}
                                </Button>
                                <Button onClick={handleGenerateImageMetadata} disabled={isSaving || isGenerating || isGeneratingImageMeta} className="flex-1" variant="outline">
                                    {isGeneratingImageMeta ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Sparkles className="mr-2 h-4 w-4" />}
                                    {isGeneratingImageMeta ? "Generando..." : "Generar SEO de Imágenes"}
                                </Button>
                            </div>
                            <div className="border-t pt-6 space-y-6">
                                <div>
                                    <Label htmlFor="shortDescription">Descripción Corta</Label>
                                    <RichTextEditor content={product.shortDescription} onChange={handleShortDescriptionChange} onInsertImage={() => setIsImageDialogOpen(true)} onSuggestLinks={handleSuggestLinks} placeholder="Un resumen atractivo y conciso de tu producto..." size="small"/>
                                </div>
                                <div>
                                    <Label htmlFor="longDescription">Descripción Larga</Label>
                                    <RichTextEditor content={product.longDescription} onChange={handleLongDescriptionChange} onInsertImage={() => setIsImageDialogOpen(true)} onSuggestLinks={handleSuggestLinks} placeholder="Describe tu producto en detalle: características, materiales, usos, etc."/>
                                </div>
                            </div>
                        </CardContent>
                    </Card>
              </div>
              
              <div className="space-y-6">
                   <Card>
                      <CardHeader><CardTitle>Organización</CardTitle></CardHeader>
                      <CardContent className="space-y-4">
                        <div>
                            <Label htmlFor="category_id">Categoría</Label>
                            <ComboBox 
                              items={wooCategories.map(c => ({ value: c.id.toString(), label: c.name.replace(/—/g, '') }))} 
                              selectedValue={product.category_id?.toString() || ''} 
                              onSelect={(value) => {
                                  const selectedCat = wooCategories.find(c => c.id.toString() === value);
                                  updateProductData({ category_id: Number(value), category: selectedCat || null, categoryPath: '' });
                              }}
                              onNewItemChange={(value) => {
                                  updateProductData({ category_id: null, category: null, categoryPath: value });
                              }}
                              placeholder="Selecciona o crea una categoría..." 
                              loading={isLoadingCategories}
                              newItemValue={product.categoryPath || ''}
                            />
                        </div>
                        <div>
                          <Label htmlFor="tags">Etiquetas (separadas por comas)</Label>
                          <Input id="tags" name="tags" value={product.tags.join(', ')} onChange={(e) => updateProductData({ tags: e.target.value.split(',').map(t=> t.trim()).filter(t => t) })} />
                        </div>
                      </CardContent>
                  </Card>
                   <Card><CardHeader><CardTitle>Envío</CardTitle></CardHeader><CardContent className="space-y-4"><div><Label htmlFor="weight">Peso (kg)</Label><Input id="weight" name="weight" type="number" value={product.weight} onChange={handleInputChange} /></div><div><Label>Dimensiones (cm)</Label><div className="grid grid-cols-3 gap-2"><Input value={product.dimensions?.length || ''} onChange={(e) => handleDimensionChange('length', e.target.value)} placeholder="Largo" /><Input value={product.dimensions?.width || ''} onChange={(e) => handleDimensionChange('width', e.target.value)} placeholder="Ancho" /><Input value={product.dimensions?.height || ''} onChange={(e) => handleDimensionChange('height', e.target.value)} placeholder="Alto" /></div></div><div><Label htmlFor="shipping_class">Clase de envío (slug)</Label><Input id="shipping_class" name="shipping_class" value={product.shipping_class} onChange={handleInputChange} /></div></CardContent></Card>
                  <Card><CardHeader><CardTitle>Imágenes</CardTitle></CardHeader><CardContent><ImageUploader photos={product.photos} onPhotosChange={handlePhotosChange} isProcessing={isSaving}/></CardContent></Card>
                  <Card><CardHeader><CardTitle className="text-destructive">Zona de Peligro</CardTitle></CardHeader><CardContent><AlertDialog><AlertDialogTrigger asChild><Button variant="destructive" className="w-full" disabled={isDeleting}><Trash2 className="mr-2 h-4 w-4" /> Eliminar Producto</Button></AlertDialogTrigger><AlertDialogContent><AlertDialogHeader><AlertDialogTitle>¿Estás absolutamente seguro?</AlertDialogTitle><AlertDialogDescription>Esta acción no se puede deshacer. Se eliminará permanentemente este producto.</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel>Cancelar</AlertDialogCancel><AlertDialogAction onClick={handleDelete} className={buttonVariants({ variant: "destructive"})}>Sí, eliminar</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog></CardContent></Card>
              </div>
          </div>
      </div>
       <AlertDialog open={isImageDialogOpen} onOpenChange={setIsImageDialogOpen}><AlertDialogContent><AlertDialogHeader><AlertDialogTitle>Insertar Imagen</AlertDialogTitle><AlertDialogDescription>Sube una imagen o introduce una URL para insertarla en el contenido.</AlertDialogDescription></AlertDialogHeader><div className="space-y-4"><div><Label htmlFor="image-upload">Subir archivo</Label><Input id="image-upload" type="file" accept="image/*" onChange={(e) => setImageFile(e.target.files?.[0] || null)} /></div><div className="relative"><div className="absolute inset-0 flex items-center"><span className="w-full border-t" /></div><div className="relative flex justify-center text-xs uppercase"><span className="bg-background px-2 text-muted-foreground">O</span></div></div><div><Label htmlFor="image-url">Insertar desde URL</Label><Input id="image-url" value={imageUrl} onChange={(e) => setImageUrl(e.target.value)} placeholder="https://ejemplo.com/imagen.jpg" /></div></div><AlertDialogFooter><AlertDialogCancel onClick={() => { setImageUrl(''); setImageFile(null); }}>Cancelar</AlertDialogCancel><AlertDialogAction onClick={handleInsertImageInLongDesc} disabled={isUploadingImage}>{isUploadingImage && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Insertar Imagen</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog>
       <LinkSuggestionsDialog open={linkSuggestions.length > 0 && !isSuggestingLinks} onOpenChange={(open) => { if (!open) setLinkSuggestions([]); }} suggestions={linkSuggestions} onApplySuggestion={handleApplySuggestion} onApplyAll={handleApplyAllSuggestions}/>
    </>
  );
}

export default function EditProductPage() {
    return (
        <Suspense fallback={<div className="flex items-center justify-center min-h-[calc(100vh-8rem)] w-full"><Loader2 className="h-10 w-10 animate-spin text-primary" /></div>}>
            <EditPageContent />
        </Suspense>
    )
}
