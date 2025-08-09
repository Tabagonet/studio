// src/app/api/products/edit/[id]/page.tsx
"use client";

import React, { useEffect, useState, Suspense, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Loader2, ArrowLeft, Save, Trash2, AlertTriangle } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { auth, onAuthStateChanged } from '@/lib/firebase';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import type { WooCommerceCategory, ProductPhoto, ProductType, ProductVariation, WooCommerceImage, ProductVariationAttribute, ProductAttribute } from '@/lib/types';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { ImageUploader } from '@/components/features/wizard/image-uploader';
import { Checkbox } from '@/components/ui/checkbox';
import { ProductPreviewCard } from './product-preview-card';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogHeader, AlertDialogTitle, AlertDialogDescription, AlertDialogFooter, AlertDialogTrigger } from '@/components/ui/alert-dialog';
import { RichTextEditor } from '@/components/features/editor/rich-text-editor';
import { LinkSuggestionsDialog } from '@/components/features/editor/link-suggestions-dialog';
import type { LinkSuggestion, SuggestLinksOutput } from '@/ai/schemas';
import { VariationEditor } from '@/components/features/products/variation-editor';
import { PRODUCT_TYPES } from '@/lib/constants';
import { ComboBox } from '@/components/core/combobox';
import { PlusCircle } from 'lucide-react';


export interface ProductEditState {
  name: string;
  sku: string;
  supplier: string | null;
  newSupplier?: string; 
  type: ProductType;
  regular_price: string;
  sale_price: string;
  short_description: string;
  description: string;
  images: ProductPhoto[];
  variations?: ProductVariation[];
  status: 'publish' | 'draft' | 'pending' | 'private';
  tags: string[];
  category_id: number | null;
  manage_stock: boolean;
  stock_quantity: string;
  weight: string;
  dimensions: {
    length: string;
    width: string;
    height: string;
  };
  shipping_class: string;
  categoryPath?: string; 
  attributes: ProductAttribute[];
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

  const [wooCategories, setWooCategories] = useState<WooCommerceCategory[]>([]);
  const [supplierCategories, setSupplierCategories] = useState<WooCommerceCategory[]>([]);
  const [isLoadingCategories, setIsLoadingCategories] = useState(true);
  
  const { toast } = useToast();

  const [isImageDialogOpen, setIsImageDialogOpen] = useState(false);
  const [imageUrl, setImageUrl] = useState('');
  
  const [isSuggestingLinks, setIsSuggestingLinks] = useState<boolean>(false);
  const [linkSuggestions, setLinkSuggestions] = useState<LinkSuggestion[]>([]);

  const updateProductData = useCallback((data: Partial<ProductEditState>) => {
    setProduct(prev => (prev ? { ...prev, ...data } : null));
  }, []);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!product) return;
    setProduct({ ...product, [e.target.name]: e.target.value });
  };
  
  const handleShortDescriptionChange = (newContent: string) => {
    if (!product) return;
    setProduct({ ...product, short_description: newContent });
  };

  const handleLongDescriptionChange = (newContent: string) => {
    if (!product) return;
    setProduct({ ...product, description: newContent });
  };

  const handleSelectChange = (name: 'status' | 'type', value: string) => {
    if (!product) return;
    setProduct({ ...product, [name]: value as any });
  };
  
  const handlePhotosChange = (updatedPhotos: ProductPhoto[]) => {
      if (!product) return;
      setProduct({ ...product, images: updatedPhotos });
  };
  
  const handleDimensionChange = (dim: 'length' | 'width' | 'height', value: string) => {
    if (!product) return;
    setProduct({
      ...product,
      dimensions: { ...product.dimensions, [dim]: value },
    });
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
        const formData = new FormData();
        
        const payload = {
          ...product,
          images: product.images.filter(p => !p.file).map(p => ({ id: p.id })), // Only send existing image IDs
        };
        formData.append('productData', JSON.stringify(payload));
        
        const newPhotos = product.images.filter(p => p.file);
        newPhotos.forEach(photo => {
            if (photo.file) {
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
            throw new Error(result.error || 'Fallo al guardar los cambios.');
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
          const parentSupplierCategory = catData.find((c: WooCommerceCategory) => c.name.toLowerCase() === 'proveedores' && c.parent === 0);
          const supplierParentId = parentSupplierCategory?.id;
          const suppliers = supplierParentId ? catData.filter((c: WooCommerceCategory) => c.parent === supplierParentId) : [];
          setSupplierCategories(suppliers);
          setWooCategories(catData.filter((c: WooCommerceCategory) => !supplierParentId || (c.id !== supplierParentId && c.parent !== supplierParentId)));
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
        
        const existingVariations: ProductVariation[] = (productData.variations || []).map((v: any) => ({
             variation_id: v.id,
             id: v.id.toString(),
             attributes: v.attributes,
             sku: v.sku,
             regularPrice: v.regular_price,
             salePrice: v.sale_price,
             manage_stock: v.manage_stock,
             stockQuantity: v.stock_quantity,
             weight: v.weight,
             dimensions: v.dimensions,
             shipping_class: v.shipping_class,
             image: v.image,
        }));

        const supplierAttribute = productData.attributes.find((a: any) => a.name === 'Proveedor');

        setProduct({
          name: productData.name || '',
          sku: productData.sku || '',
          supplier: supplierAttribute ? supplierAttribute.options[0] : null,
          type: productData.type || 'simple',
          regular_price: productData.regular_price || '',
          sale_price: productData.sale_price || '',
          short_description: productData.short_description || '',
          description: productData.description || '',
          images: existingImagesAsProductPhotos,
          variations: existingVariations,
          status: productData.status || 'draft',
          tags: productData.tags?.map((t: any) => t.name) || [],
          category_id: productData.categories?.length > 0 ? productData.categories[0].id : null,
          manage_stock: productData.manage_stock || false,
          stock_quantity: productData.stock_quantity?.toString() || '',
          weight: productData.weight || '',
          dimensions: productData.dimensions || { length: '', width: '', height: '' },
          shipping_class: productData.shipping_class || '',
          attributes: productData.attributes || [],
        });

      } catch (e: any) {
        setError(e.message);
        toast({ title: 'Error', description: e.message, variant: 'destructive' });
      } finally {
        setIsLoading(false);
      }
    };

    if (productId) {
      fetchInitialData();
    }
  }, [productId, toast]);
  
  const handleInsertImageInLongDesc = async (url: string) => {
    const imgTag = `<img src="${url}" alt="${product?.name || 'Imagen insertada'}" loading="lazy" style="max-width: 100%; height: auto; border-radius: 8px;" />`;
    if (product) {
      setProduct({ ...product, description: product.description + `\n${imgTag}` });
    }
    setImageUrl('');
    setIsImageDialogOpen(false);
  };

  const handleSuggestLinks = async () => {
    if (!product || !product.description.trim()) {
        toast({ title: "Contenido vacío", description: "Escribe algo en la descripción larga antes de pedir sugerencias.", variant: "destructive" });
        return;
    }
    setIsSuggestingLinks(true);
    try {
        const user = auth.currentUser;
        if (!user) throw new Error("No autenticado.");
        const token = await user.getIdToken();
        const response = await fetch('/api/ai/suggest-links', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
            body: JSON.stringify({ content: product.description })
        });
        if (!response.ok) throw new Error((await response.json()).message || "La IA falló al sugerir enlaces.");
        
        const data: SuggestLinksOutput = await response.json();
        setLinkSuggestions(data.suggestions || []);

    } catch(e: any) {
        toast({ title: "Error al sugerir enlaces", description: e.message, variant: "destructive" });
        setLinkSuggestions([]);
    } finally {
        setIsSuggestingLinks(false);
    }
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
    if (!product) return;
    const newContent = applyLink(product.description, suggestion);
    if (newContent !== product.description) {
        setProduct(p => p ? { ...p, description: newContent } : null);
        toast({ title: "Enlace aplicado", description: `Se ha enlazado la frase "${suggestion.phraseToLink}".` });
        setLinkSuggestions(prev => prev.filter(s => s.phraseToLink !== suggestion.phraseToLink || s.targetUrl !== suggestion.targetUrl));
    } else {
        toast({ title: "No se pudo aplicar", description: "No se encontró la frase exacta o ya estaba enlazada.", variant: "destructive" });
    }
  };

  const handleApplyAllSuggestions = () => {
     if (!product) return;
     let updatedContent = product.description;
     let appliedCount = 0;
     for (const suggestion of linkSuggestions) {
         const newContent = applyLink(updatedContent, suggestion);
         if (newContent !== updatedContent) {
             updatedContent = newContent;
             appliedCount++;
         }
     }
     if (appliedCount > 0) {
        setProduct(p => p ? { ...p, description: updatedContent } : null);
        toast({ title: "Enlaces aplicados", description: `Se han aplicado ${appliedCount} sugerencias de enlaces.` });
        setLinkSuggestions([]);
     } else {
        toast({ title: "No se aplicó nada", description: "No se encontraron frases o ya estaban enlazadas.", variant: "destructive" });
     }
  };
  
  const handleAttributeChange = (index: number, field: keyof ProductAttribute, value: string | boolean) => {
    if (!product) return;
    const newAttributes = [...product.attributes];
    newAttributes[index] = { ...newAttributes[index], [field]: value };
    setProduct({ ...product, attributes: newAttributes });
  };
  
  const addAttribute = () => {
    if (!product) return;
    setProduct({ ...product, attributes: [...product.attributes, { name: '', value: '', forVariations: false, visible: true }] });
  };

  const removeAttribute = (index: number) => {
    if (!product) return;
    const newAttributes = product.attributes.filter((_, i) => i !== index);
    setProduct({ ...product, attributes: newAttributes });
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
                          <Button variant="outline" onClick={() => router.push('/batch')}>
                              <ArrowLeft className="mr-2 h-4 w-4" />
                              Volver a la lista
                          </Button>
                          <Button onClick={handleSaveChanges} disabled={isSaving || isSuggestingLinks}>
                              {isSaving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
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
                                        onSelect={(value) => setProduct({...product, supplier: value, newSupplier: ''})}
                                        onNewItemChange={(value) => setProduct({...product, newSupplier: value, supplier: ''})}
                                        placeholder="Selecciona o crea un proveedor..."
                                        newItemValue={product.newSupplier || ''}
                                        loading={isLoadingCategories}
                                    />
                              </div>
                          </div>
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                              <div><Label htmlFor="status">Estado</Label><Select name="status" value={product.status} onValueChange={(value) => handleSelectChange('status', value)}><SelectTrigger id="status"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="publish">Publicado</SelectItem><SelectItem value="draft">Borrador</SelectItem><SelectItem value="pending">Pendiente</SelectItem><SelectItem value="private">Privado</SelectItem></SelectContent></Select></div>
                              <div>
                                <Label htmlFor="type">Tipo de Producto</Label>
                                <Select name="type" value={product.type} onValueChange={(value) => handleSelectChange('type', value)}>
                                  <SelectTrigger id="type"><SelectValue /></SelectTrigger>
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
                  
                  {product.type === 'variable' ? (
                     <>
                        <Card>
                          <CardHeader><CardTitle>Precio por Defecto (Opcional)</CardTitle></CardHeader>
                          <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-4">
                              <div><Label htmlFor="regular_price">Precio Regular (€)</Label><Input id="regular_price" name="regular_price" type="number" value={product.regular_price} onChange={handleInputChange} /></div>
                              <div><Label htmlFor="sale_price">Precio Oferta (€)</Label><Input id="sale_price" name="sale_price" type="number" value={product.sale_price} onChange={handleInputChange} /></div>
                          </CardContent>
                        </Card>
                        <Card>
                            <CardHeader><CardTitle>Atributos del Producto</CardTitle></CardHeader>
                            <CardContent>
                                {product.attributes.map((attr, index) => (
                                    <div key={index} className="flex flex-col sm:flex-row items-start sm:items-end gap-2 p-3 border rounded-md bg-muted/20 mb-2">
                                        <div className="flex-1 w-full"><Label>Nombre</Label><Input value={attr.name} onChange={(e) => handleAttributeChange(index, 'name', e.target.value)} placeholder="Ej: Color" /></div>
                                        <div className="flex-1 w-full"><Label>Valor(es)</Label><Input value={attr.value} onChange={(e) => handleAttributeChange(index, 'value', e.target.value)} placeholder="Ej: Azul | Rojo | Verde" /></div>
                                        <div className="flex items-center gap-4 pt-2 sm:pt-0 sm:self-end sm:h-10">
                                            <div className="flex items-center space-x-2"><Checkbox checked={attr.forVariations} onCheckedChange={(checked) => handleAttributeChange(index, 'forVariations', !!checked)} /><Label className="text-sm font-normal whitespace-nowrap">Para variaciones</Label></div>
                                            <Button variant="ghost" size="icon" onClick={() => removeAttribute(index)} aria-label="Eliminar atributo" className="flex-shrink-0"><Trash2 className="h-4 w-4 text-destructive" /></Button>
                                        </div>
                                    </div>
                                ))}
                                <Button type="button" variant="outline" onClick={addAttribute} className="mt-2"><PlusCircle className="mr-2 h-4 w-4" /> Añadir Atributo</Button>
                            </CardContent>
                        </Card>
                        <Card>
                          <CardHeader><CardTitle>Variaciones</CardTitle></CardHeader>
                          <CardContent>
                            <VariationEditor 
                              product={product} 
                              onProductChange={updateProductData} 
                              images={product.images}
                            />
                          </CardContent>
                        </Card>
                    </>
                  ) : product.type === 'simple' ? (
                    <><Card><CardHeader><CardTitle>Precios</CardTitle></CardHeader><CardContent className="grid grid-cols-1 md:grid-cols-2 gap-4"><div><Label htmlFor="regular_price">Precio Regular (€)</Label><Input id="regular_price" name="regular_price" type="number" value={product.regular_price} onChange={handleInputChange} /></div><div><Label htmlFor="sale_price">Precio Oferta (€)</Label><Input id="sale_price" name="sale_price" type="number" value={product.sale_price} onChange={handleInputChange} /></div></CardContent></Card><Card><CardHeader><CardTitle>Inventario</CardTitle></CardHeader><CardContent className="space-y-4"><div className="flex items-center space-x-2"><Checkbox id="manage_stock" checked={product.manage_stock} onCheckedChange={(checked) => setProduct({ ...product, manage_stock: !!checked, stock_quantity: !!checked ? product.stock_quantity : '' })} /><Label htmlFor="manage_stock" className="font-normal">Gestionar inventario</Label></div>{product.manage_stock && (<div><Label htmlFor="stock_quantity">Cantidad en Stock</Label><Input id="stock_quantity" name="stock_quantity" type="number" value={product.stock_quantity} onChange={handleInputChange} /></div>)}</CardContent></Card></>
                  ) : ( <Alert><AlertTriangle className="h-4 w-4" /><AlertTitle>Producto de tipo '{product.type}'</AlertTitle><AlertDescription>El precio y el inventario para este tipo de producto se gestionan de forma diferente y no se pueden editar aquí.</AlertDescription></Alert> )}
                  
                   <Card><CardHeader><CardTitle>Descripciones</CardTitle></CardHeader><CardContent className="space-y-4"><div><Label htmlFor="short_description">Descripción Corta</Label><RichTextEditor content={product.short_description} onChange={handleShortDescriptionChange} onInsertImage={() => setIsImageDialogOpen(true)} onSuggestLinks={handleSuggestLinks} placeholder="Escribe la descripción corta aquí..." size="small"/></div><div><Label htmlFor="description">Descripción Larga</Label><RichTextEditor content={product.description} onChange={handleLongDescriptionChange} onInsertImage={() => setIsImageDialogOpen(true)} onSuggestLinks={handleSuggestLinks} placeholder="Escribe la descripción larga aquí..." /></div></CardContent></Card>
                   <Card><CardHeader><CardTitle>Envío</CardTitle></CardHeader><CardContent className="space-y-4"><div><Label htmlFor="weight">Peso (kg)</Label><Input id="weight" name="weight" type="number" value={product.weight} onChange={handleInputChange} /></div><div><Label>Dimensiones (cm)</Label><div className="grid grid-cols-3 gap-2"><Input value={product.dimensions.length} onChange={(e) => handleDimensionChange('length', e.target.value)} placeholder="Largo" /><Input value={product.dimensions.width} onChange={(e) => handleDimensionChange('width', e.target.value)} placeholder="Ancho" /><Input value={product.dimensions.height} onChange={(e) => handleDimensionChange('height', e.target.value)} placeholder="Alto" /></div></div><div><Label htmlFor="shipping_class">Clase de envío (slug)</Label><Input id="shipping_class" name="shipping_class" value={product.shipping_class} onChange={handleInputChange} /></div></CardContent></Card>
              </div>
              
              <div className="space-y-6">
                  <ProductPreviewCard product={product} categories={wooCategories} />
                  <Card><CardHeader><CardTitle>Organización</CardTitle></CardHeader><CardContent className="space-y-4"><div><Label htmlFor="category_id">Categoría</Label><ComboBox items={wooCategories.map(c => ({ value: c.id.toString(), label: c.name.replace(/—/g, '') }))} selectedValue={product.category_id?.toString() || ''} onSelect={(value) => setProduct({...product, category_id: Number(value), categoryPath: ''})} onNewItemChange={(value) => setProduct({...product, category_id: null, categoryPath: value})} placeholder="Selecciona o crea una categoría..." loading={isLoadingCategories} newItemValue={product.categoryPath || ''}/></div><div><Label htmlFor="tags">Etiquetas (separadas por comas)</Label><Input id="tags" name="tags" value={product.tags.join(', ')} onChange={(e) => setProduct({ ...product, tags: e.target.value.split(',').map(t => t.trim()) })} /></div></CardContent></Card>
                   <Card><CardHeader><CardTitle>Imágenes</CardTitle></CardHeader><CardContent><ImageUploader photos={product.images} onPhotosChange={handlePhotosChange} isProcessing={isSaving}/></CardContent></Card>
                   <Card><CardHeader><CardTitle className="text-destructive">Zona de Peligro</CardTitle></CardHeader><CardContent><AlertDialog><AlertDialogTrigger asChild><Button variant="destructive" className="w-full" disabled={isDeleting}><Trash2 className="mr-2 h-4 w-4" /> Eliminar Producto</Button></AlertDialogTrigger><AlertDialogContent><AlertDialogHeader><AlertDialogTitle>¿Estás absolutamente seguro?</AlertDialogTitle><AlertDialogDescription>Esta acción no se puede deshacer. Se eliminará permanentemente este producto.</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel>Cancelar</AlertDialogCancel><AlertDialogAction onClick={handleDelete}>Sí, eliminar</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog></CardContent></Card>
              </div>
          </div>
      </div>
       <AlertDialog open={isImageDialogOpen} onOpenChange={setIsImageDialogOpen}>
          <AlertDialogContent>
              <AlertDialogHeader>
                  <AlertDialogTitle>Insertar Imagen desde URL</AlertDialogTitle>
                  <AlertDialogDescription>Pega la URL de una imagen para insertarla en el contenido.</AlertDialogDescription>
              </AlertDialogHeader>
              <div className="py-4">
                  <Label htmlFor="image-url">URL de la Imagen</Label>
                  <Input id="image-url" value={imageUrl} onChange={(e) => setImageUrl(e.target.value)} placeholder="https://ejemplo.com/imagen.jpg" />
              </div>
              <AlertDialogFooter>
                  <AlertDialogCancel>Cancelar</AlertDialogCancel>
                  <AlertDialogAction onClick={() => handleInsertImageInLongDesc(imageUrl)}>Insertar Imagen</AlertDialogAction>
              </AlertDialogFooter>
          </AlertDialogContent>
      </AlertDialog>
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
