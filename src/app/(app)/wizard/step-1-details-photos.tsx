
"use client";

import React, { useState, useEffect, useCallback } from 'react';
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from '@/components/ui/button';
import { ImageUploader } from '@/components/features/wizard/image-uploader';
import { VariableProductManager } from '@/components/features/wizard/variable-product-manager';
import { GroupedProductSelector } from '@/components/features/wizard/grouped-product-selector';
import type { ProductData, ProductAttribute, ProductPhoto, ProductType, WooCommerceCategory } from '@/lib/types';
import { PRODUCT_TYPES, ALL_LANGUAGES } from '@/lib/constants';
import { PlusCircle, Trash2, Loader2, Sparkles, Languages, CheckCircle, AlertCircle } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useToast } from '@/hooks/use-toast';
import { extractProductNameAndAttributesFromFilename } from '@/lib/utils';
import { Checkbox } from '@/components/ui/checkbox';
import { auth, onAuthStateChanged } from '@/lib/firebase';
import { useDebounce } from '@/hooks/use-debounce';
import { RichTextEditor } from '@/components/features/editor/rich-text-editor';
import { LinkSuggestionsDialog } from '@/components/features/editor/link-suggestions-dialog';
import type { LinkSuggestion, SuggestLinksOutput } from '@/ai/schemas';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { Alert, AlertTitle, AlertDescription } from '@/components/ui/alert';


interface Step1DetailsPhotosProps {
  productData: ProductData;
  updateProductData: (data: Partial<ProductData>) => void;
  isProcessing?: boolean;
}

const StatusIndicator = ({ status, message }: { status: 'idle' | 'checking' | 'exists' | 'available'; message: string }) => {
    if (status === 'idle' || !message) return null;
    if (status === 'checking') return <div className="flex items-center text-xs text-muted-foreground mt-1"><Loader2 className="h-3 w-3 mr-1 animate-spin" /> Verificando...</div>;
    const color = status === 'exists' ? 'text-destructive' : 'text-green-600';
    const Icon = status === 'exists' ? AlertCircle : CheckCircle;
    return <div className={`flex items-center text-xs ${color} mt-1`}><Icon className="h-3 w-3 mr-1" /> {message}</div>;
};


export function Step1DetailsPhotos({ productData, updateProductData, isProcessing = false }: Step1DetailsPhotosProps) {
  const [wooCategories, setWooCategories] = useState<WooCommerceCategory[]>([]);
  const [supplierCategories, setSupplierCategories] = useState<WooCommerceCategory[]>([]);

  const [isLoadingCategories, setIsLoadingCategories] = useState(true);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isGeneratingImageMeta, setIsGeneratingImageMeta] = useState(false);
  const [skuStatus, setSkuStatus] = useState<{ status: 'idle' | 'checking' | 'exists' | 'available'; message: string }>({ status: 'idle', message: '' });
  const [nameStatus, setNameStatus] = useState<{ status: 'idle' | 'checking' | 'exists' | 'available'; message: string }>({ status: 'idle', message: '' });
  
  const [isImageDialogOpen, setIsImageDialogOpen] = useState(false);
  const [imageUrl, setImageUrl] = useState('');
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [isUploadingImage, setIsUploadingImage] = useState(false);
  
  const [isSuggestingLinks, setIsSuggestingLinks] = useState(false);
  const [linkSuggestions, setLinkSuggestions] = useState<LinkSuggestion[]>([]);

  const { toast } = useToast();
  
  const debouncedSku = useDebounce(productData.sku, 500);
  const debouncedName = useDebounce(productData.name, 500);

  useEffect(() => {
    const fetchCategories = async (token: string) => {
      setIsLoadingCategories(true);
      try {
        const response = await fetch('/api/woocommerce/categories', {
          headers: { 'Authorization': `Bearer ${token}` }
        });

        if (!response.ok) {
          const errorData = await response.json();
          throw new Error(errorData.error || `Error: ${response.status}`);
        }
        const data: WooCommerceCategory[] = await response.json();
        
        const categoryMap = new Map<number, WooCommerceCategory>(data.map(cat => ({ ...cat, children: [] })).map(cat => [cat.id, cat]));
        const tree: WooCommerceCategory[] = [];
        
        const parentSupplierCategory = data.find(c => c.name.toLowerCase() === 'proveedores' && c.parent === 0);
        const supplierParentId = parentSupplierCategory?.id;

        const suppliers = supplierParentId ? data.filter(c => c.parent === supplierParentId) : [];
        setSupplierCategories(suppliers);


        data.forEach(cat => {
            if (cat.parent === 0) {
                tree.push(categoryMap.get(cat.id)!);
            } else {
                const parent = categoryMap.get(cat.parent);
                if (parent) {
                    (parent as any).children.push(categoryMap.get(cat.id)!);
                }
            }
        });
        
        const flattenedHierarchy: WooCommerceCategory[] = [];
        const flatten = (categories: WooCommerceCategory[], depth: number) => {
            for (const category of categories) {
                flattenedHierarchy.push({
                    ...category,
                    name: '— '.repeat(depth) + category.name,
                });
                if ((category as any).children.length > 0) {
                    flatten((category as any).children, depth + 1);
                }
            }
        };

        flatten(tree, 0);
        setWooCategories(flattenedHierarchy);

      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        toast({
          title: "Error al Cargar Categorías",
          description: errorMessage || "No se pudieron cargar las categorías de WooCommerce.",
          variant: "destructive",
        });
      } finally {
        setIsLoadingCategories(false);
      }
    };
    
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
        if (user) {
            const token = await user.getIdToken();
            fetchCategories(token);
        } else {
            setIsLoadingCategories(false);
            setWooCategories([]);
        }
    });

    return () => unsubscribe();
  }, [toast]);
  
  const checkProductExistence = useCallback(async (field: 'sku' | 'name', value: string, signal: AbortSignal) => {
    const setStatus = field === 'sku' ? setSkuStatus : setNameStatus;
    const user = auth.currentUser;
    if (!user) return;
    const token = await user.getIdToken();

    setStatus({ status: 'checking', message: '' });

    try {
        const response = await fetch(`/api/woocommerce/products/check?${field}=${encodeURIComponent(value)}`, {
            headers: { 'Authorization': `Bearer ${token}` },
            signal: signal,
        });
        if (signal.aborted) return;
        
        const data = await response.json();
        if (response.ok) {
            setStatus({ status: data.exists ? 'exists' : 'available', message: data.message });
        } else {
            setStatus({ status: 'idle', message: '' }); 
        }
    } catch (error: any) {
        if (error.name !== 'AbortError') {
            console.error(`Error checking ${field}:`, error);
            setStatus({ status: 'idle', message: '' }); // Reset on error
        }
    }
  }, []);

  useEffect(() => {
    if (!debouncedSku || debouncedSku.length < 3) {
      setSkuStatus({ status: 'idle', message: '' });
      return;
    }
    const controller = new AbortController();
    checkProductExistence('sku', debouncedSku, controller.signal);
    return () => controller.abort();
  }, [debouncedSku, checkProductExistence]);

  useEffect(() => {
    if (!debouncedName || debouncedName.length < 3) {
      setNameStatus({ status: 'idle', message: '' });
      return;
    }
    const controller = new AbortController();
    checkProductExistence('name', debouncedName, controller.signal);
    return () => controller.abort();
  }, [debouncedName, checkProductExistence]);


  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    updateProductData({ [e.target.name]: e.target.value });
  };
  
  const handleShortDescriptionChange = (newContent: string) => {
    updateProductData({ shortDescription: newContent });
  };

  const handleLongDescriptionChange = (newContent: string) => {
    updateProductData({ longDescription: newContent });
  };


  const handleSelectChange = (name: 'productType' | 'category' | 'supplier', value: string) => {
    if (name === 'productType') {
      updateProductData({ 
        productType: value as ProductType, 
        attributes: [{ name: '', value: '', forVariations: false, visible: true }], 
        variations: [] 
      });
    } else if (name === 'category') {
      const selectedCat = wooCategories.find(c => c.id.toString() === value);
      updateProductData({ category: selectedCat || null, categoryPath: '' });
    } else if (name === 'supplier') {
        const selectedSupplier = supplierCategories.find(s => s.name === value);
        if (selectedSupplier) {
             updateProductData({ supplier: selectedSupplier.name, newSupplier: '' });
        } else {
            updateProductData({ supplier: '' });
        }
    }
  };

  const handlePhotosChange = (newPhotos: ProductPhoto[]) => {
    if (!productData.name && newPhotos.length > 0) {
      const firstNewFile = newPhotos.find(p => p && p.file);
      if (firstNewFile) {
        const { extractedProductName } = extractProductNameAndAttributesFromFilename(firstNewFile.name);
        updateProductData({ photos: newPhotos, name: extractedProductName });
        return;
      }
    }
    updateProductData({ photos: newPhotos });
  };
  
  const handleAttributeChange = (index: number, field: keyof ProductAttribute, value: string | boolean) => {
    const newAttributes = [...productData.attributes];
    newAttributes[index] = { ...newAttributes[index], [field]: value };
    updateProductData({ attributes: newAttributes });
  };

  const addAttribute = () => {
    updateProductData({ attributes: [...productData.attributes, { name: '', value: '', forVariations: false, visible: true }] });
  };

  const removeAttribute = (index: number) => {
    const newAttributes = productData.attributes.filter((_, i) => i !== index);
    updateProductData({ attributes: newAttributes });
  };
  
  const handleLanguageToggle = (langCode: string) => {
      const newLangs = productData.targetLanguages?.includes(langCode)
          ? productData.targetLanguages.filter(l => l !== langCode)
          : [...(productData.targetLanguages || []), langCode];
      updateProductData({ targetLanguages: newLangs });
  };
  
  const handleSourceLanguageChange = (newSourceLang: string) => {
      updateProductData({
          language: newSourceLang as ProductData['language'],
          targetLanguages: productData.targetLanguages?.filter(l => l !== newSourceLang)
      });
  };
  
  const availableTargetLanguages = ALL_LANGUAGES.filter(lang => lang.code !== productData.language);

  const handleGenerateContentWithAI = async () => {
    if (!productData.name) {
        toast({ title: "Falta el nombre", description: "Por favor, introduce un nombre para el producto antes de usar la IA.", variant: "destructive" });
        return;
    }
    setIsGenerating(true);
    try {
        const user = auth.currentUser;
        if (!user) throw new Error("No autenticado.");
        const token = await user.getIdToken();

        const payload = {
            baseProductName: productData.name,
            productName: productData.name,
            productType: productData.productType,
            tags: productData.tags,
            language: productData.language,
            groupedProductIds: productData.groupedProductIds,
        };

        const response = await fetch('/api/generate-description', {
            method: 'POST',
            headers: { 
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify(payload)
        });

        if (!response.ok) {
            let errorToastDescription = `El servidor respondió con un error ${response.status}.`;
            try {
                const errorData = await response.json();
                errorToastDescription = errorData.error || errorData.message || errorToastDescription;
            } catch (e) {
                errorToastDescription = `Error interno del servidor (${response.status}). La respuesta no es un JSON válido.`;
            }
            throw new Error(errorToastDescription);
        }

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

        toast({ title: "¡Contenido generado!", description: "La IA ha rellenado las descripciones, palabras clave y metadatos de imagen." });

    } catch (error: any) {
        toast({ title: "Error de IA", description: error.message, variant: "destructive", duration: 10000 });
    } finally {
        setIsGenerating(false);
    }
  };

  const handleGenerateImageMetadata = async () => {
    if (!productData.name) {
        toast({ title: "Falta el nombre", description: "Por favor, introduce un nombre para el producto.", variant: "destructive" });
        return;
    }
    setIsGeneratingImageMeta(true);
    try {
        const user = auth.currentUser;
        if (!user) throw new Error("No autenticado.");
        const token = await user.getIdToken();

        const payload = {
            productName: productData.name,
            productType: productData.productType,
            tags: productData.tags.split(',').map(t => t.trim()).filter(Boolean),
            language: productData.language,
            mode: 'image_meta_only',
        };

        const response = await fetch('/api/generate-description', {
            method: 'POST',
            headers: { 
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify(payload)
        });

        if (!response.ok) {
            let errorToastDescription = `El servidor respondió con un error ${response.status}.`;
            try {
                const errorData = await response.json();
                errorToastDescription = errorData.error || errorData.message || errorToastDescription;
            } catch (e) {
                // Ignore if parsing fails
            }
            throw new Error(errorToastDescription);
        }

        const aiContent = await response.json();
        
        updateProductData({
            imageTitle: aiContent.imageTitle,
            imageAltText: aiContent.imageAltText,
            imageCaption: aiContent.imageCaption,
            imageDescription: aiContent.imageDescription,
        });

        toast({ title: "Metadatos de imagen generados", description: "La IA ha rellenado los datos SEO para las imágenes." });

    } catch (error: any) {
        toast({ title: "Error de IA", description: error.message, variant: "destructive", duration: 7000 });
    } finally {
        setIsGeneratingImageMeta(false);
    }
  };
  
    const handleInsertImageInLongDesc = async () => {
    let finalImageUrl = imageUrl;
    if (imageFile) {
        setIsUploadingImage(true);
        try {
            const user = auth.currentUser;
            if (!user) throw new Error("No autenticado.");
            const token = await user.getIdToken();
            const formData = new FormData();
            formData.append('imagen', imageFile);
            const response = await fetch('/api/upload-image', { method: 'POST', headers: { 'Authorization': `Bearer ${token}` }, body: formData });
            if (!response.ok) throw new Error((await response.json()).error || 'Fallo en la subida de imagen.');
            finalImageUrl = (await response.json()).url;
        } catch (err: any) {
            toast({ title: 'Error al subir imagen', description: err.message, variant: 'destructive' });
            setIsUploadingImage(false);
            return;
        } finally {
            setIsUploadingImage(false);
        }
    }
    if (!finalImageUrl) {
        toast({ title: 'Falta la imagen', description: 'Por favor, sube un archivo o introduce una URL.', variant: 'destructive' });
        return;
    }

    const imgTag = `<img src="${finalImageUrl}" alt="${productData.name || 'Imagen insertada'}" loading="lazy" style="max-width: 100%; height: auto; border-radius: 8px;" />`;
    updateProductData({ longDescription: productData.longDescription + `\n${imgTag}` });

    setImageUrl('');
    setImageFile(null);
    setIsImageDialogOpen(false);
  };

  const handleSuggestLinks = async () => {
    if (!productData.longDescription.trim()) {
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
            body: JSON.stringify({ content: productData.longDescription })
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
    const newContent = applyLink(productData.longDescription, suggestion);
    if (newContent !== productData.longDescription) {
        updateProductData({ longDescription: newContent });
        toast({ title: "Enlace aplicado", description: `Se ha enlazado la frase "${suggestion.phraseToLink}".` });
        setLinkSuggestions(prev => prev.filter(s => s.phraseToLink !== suggestion.phraseToLink || s.targetUrl !== suggestion.targetUrl));
    } else {
        toast({ title: "No se pudo aplicar", description: "No se encontró la frase exacta o ya estaba enlazada.", variant: "destructive" });
    }
  };

  const handleApplyAllSuggestions = () => {
     let updatedContent = productData.longDescription;
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

  const isDuplicateButResolved = nameStatus.status === 'exists' && skuStatus.status === 'available' && (!!productData.supplier || !!productData.newSupplier);


  return (
    <>
      <div className="space-y-8">
        <Card>
          <CardHeader>
            <CardTitle>Paso 1: Detalles y Fotos</CardTitle>
            <CardDescription>Completa la información básica y añade las imágenes de tu producto.</CardDescription>
          </CardHeader>
        </Card>
        
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          <div className="lg:col-span-2 space-y-8">
              <Card>
                <CardHeader>
                  <CardTitle>Información del Producto</CardTitle>
                  <CardDescription>Define los detalles clave de tu producto. Las opciones cambiarán según el tipo que elijas.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-6">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div>
                      <Label htmlFor="name">Nombre del Producto</Label>
                      <Input id="name" name="name" value={productData.name} onChange={handleInputChange} placeholder="Ej: Camiseta de Algodón" disabled={isProcessing} />
                      <StatusIndicator status={nameStatus.status} message={nameStatus.message} />
                    </div>
                    <div>
                      <Label htmlFor="sku">SKU</Label>
                      <Input id="sku" name="sku" value={productData.sku} onChange={handleInputChange} placeholder="Ej: CAM-ALG-AZ-M" disabled={isProcessing} />
                      <StatusIndicator status={skuStatus.status} message={skuStatus.message} />
                    </div>
                  </div>
                  
                  {nameStatus.status === 'exists' && (
                    isDuplicateButResolved ? (
                       <Alert variant="success">
                        <CheckCircle className="h-4 w-4" />
                        <AlertTitle>¡Conflicto Resuelto!</AlertTitle>
                        <AlertDescription>
                          Has proporcionado un SKU y un proveedor, ¡perfecto! Se generará un slug único para diferenciarlo.
                        </AlertDescription>
                      </Alert>
                    ) : (
                      <Alert variant="destructive">
                        <AlertCircle className="h-4 w-4" />
                        <AlertTitle>¡Atención! Nombre Duplicado</AlertTitle>
                        <AlertDescription>
                          Para crear el producto, ahora será **obligatorio** que rellenes los campos **Proveedor** y **SKU** para diferenciarlo y evitar problemas de SEO.
                        </AlertDescription>
                      </Alert>
                    )
                  )}

                   <div>
                      <Label>Proveedor</Label>
                      <div className="flex gap-2">
                           <Select value={productData.supplier} onValueChange={(value) => handleSelectChange('supplier', value)} disabled={isProcessing || isLoadingCategories}>
                              <SelectTrigger id="supplier">
                                  <SelectValue placeholder="Selecciona un proveedor..." />
                              </SelectTrigger>
                              <SelectContent>
                                  {supplierCategories.map(cat => (
                                      <SelectItem key={cat.id} value={cat.name}>{cat.name}</SelectItem>
                                  ))}
                              </SelectContent>
                          </Select>
                          <Input
                              name="newSupplier"
                              value={productData.newSupplier || ''}
                              onChange={(e) => updateProductData({ newSupplier: e.target.value, supplier: '' })}
                              placeholder="O crea un nuevo proveedor"
                              disabled={isProcessing}
                          />
                      </div>
                      <p className="text-xs text-muted-foreground mt-1">El proveedor se asignará a la categoría padre "Proveedores".</p>
                  </div>

                  <div>
                    <Label htmlFor="productType">Tipo de Producto</Label>
                    <Select name="productType" value={productData.productType} onValueChange={(value) => handleSelectChange('productType', value)} disabled={isProcessing}>
                      <SelectTrigger id="productType">
                        <SelectValue placeholder="Selecciona un tipo de producto" />
                      </SelectTrigger>
                      <SelectContent>
                        {PRODUCT_TYPES.map(type => (
                          <SelectItem key={type.value} value={type.value}>{type.label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  
                   <div>
                      <Label htmlFor="category">Categoría</Label>
                      <div className="flex gap-2">
                          <Select name="category" value={productData.category?.id.toString() || ''} onValueChange={(value) => handleSelectChange('category', value)} disabled={isProcessing || isLoadingCategories}>
                          <SelectTrigger id="category">
                              {isLoadingCategories ? (
                              <div className="flex items-center">
                                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                  <SelectValue placeholder="Cargando categorías..." />
                              </div>
                              ) : (
                              <SelectValue placeholder="Selecciona una categoría existente..." />
                              )}
                          </SelectTrigger>
                          <SelectContent>
                              {!isLoadingCategories && wooCategories.length === 0 && <SelectItem value="" disabled>No hay categorías disponibles</SelectItem>}
                              {wooCategories.map(cat => (
                                  <SelectItem key={cat.id} value={cat.id.toString()}>{cat.name}</SelectItem>
                              ))}
                          </SelectContent>
                          </Select>
                          <Input
                              name="categoryPath"
                              value={productData.categoryPath || ''}
                              onChange={(e) => updateProductData({ categoryPath: e.target.value, category: null })}
                              placeholder="O crea una nueva (Ej: Ropa > Camisetas)"
                              disabled={isProcessing}
                          />
                      </div>
                  </div>

                  {productData.productType === 'simple' && (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6 border-t pt-6">
                      <div>
                        <Label htmlFor="regularPrice">Precio Regular (€)</Label>
                        <Input id="regularPrice" name="regularPrice" type="number" value={productData.regularPrice} onChange={handleInputChange} placeholder="Ej: 29.99" disabled={isProcessing} />
                      </div>
                      <div>
                        <Label htmlFor="salePrice">Precio de Oferta (€)</Label>
                        <Input id="salePrice" name="salePrice" type="number" value={productData.salePrice} onChange={handleInputChange} placeholder="Opcional" disabled={isProcessing} />
                      </div>
                    </div>
                  )}
                  
                  {productData.productType === 'grouped' && (
                      <div className="border-t pt-6 mt-6">
                          <h3 className="text-lg font-medium mb-2">Productos Agrupados</h3>
                          <p className="text-sm text-muted-foreground mb-4">Busca y selecciona los productos simples que formarán parte de este grupo.</p>
                          <GroupedProductSelector 
                              productIds={productData.groupedProductIds || []} 
                              onProductIdsChange={(ids) => updateProductData({ groupedProductIds: ids })} 
                          />
                      </div>
                  )}

                  {productData.productType !== 'grouped' && (
                      <div className="border-t pt-6 mt-6">
                          <h3 className="text-lg font-medium mb-2">Atributos del Producto</h3>
                          <p className="text-sm text-muted-foreground mb-4">Añade atributos como talla, color, etc. Para productos variables, marca la casilla "Para variaciones" y separa los valores con " | ".</p>
                          {productData.attributes.map((attr, index) => (
                             <div key={index} className="flex flex-col sm:flex-row items-start sm:items-end gap-2 p-3 border rounded-md bg-muted/20 mb-2">
                                  <div className="flex-1 w-full">
                                      <Label htmlFor={`attrName-${index}`}>Nombre</Label>
                                      <Input id={`attrName-${index}`} value={attr.name} onChange={(e) => handleAttributeChange(index, 'name', e.target.value)} placeholder="Ej: Color" disabled={isProcessing || isGenerating} />
                                  </div>
                                  <div className="flex-1 w-full">
                                      <Label htmlFor={`attrValue-${index}`}>Valor(es)</Label>
                                      <Input id={`attrValue-${index}`} value={attr.value} onChange={(e) => handleAttributeChange(index, 'value', e.target.value)} placeholder="Ej: Azul | Rojo | Verde" disabled={isProcessing || isGenerating} />
                                  </div>
                                  <div className="flex items-center gap-4 pt-2 sm:pt-0 sm:self-end sm:h-10">
                                      {productData.productType === 'variable' && (
                                          <div className="flex items-center space-x-2">
                                              <Checkbox id={`attrVar-${index}`} checked={attr.forVariations} onCheckedChange={(checked) => handleAttributeChange(index, 'forVariations', !!checked)} disabled={isProcessing || isGenerating} />
                                              <Label htmlFor={`attrVar-${index}`} className="text-sm font-normal whitespace-nowrap">Para variaciones</Label>
                                          </div>
                                      )}
                                      <Button variant="ghost" size="icon" onClick={() => removeAttribute(index)} aria-label="Eliminar atributo" disabled={isProcessing || isGenerating} className="flex-shrink-0">
                                          <Trash2 className="h-4 w-4 text-destructive" />
                                      </Button>
                                  </div>
                              </div>
                          ))}
                          <Button type="button" variant="outline" onClick={addAttribute} className="mt-2" disabled={isProcessing || isGenerating}>
                              <PlusCircle className="mr-2 h-4 w-4" /> Añadir Atributo
                          </Button>
                      </div>
                  )}

                  {productData.productType === 'variable' && (
                      <div className="border-t pt-6 mt-6">
                          <VariableProductManager productData={productData} updateProductData={updateProductData} />
                      </div>
                  )}
                  
                  {productData.productType !== 'variable' && (
                      <div className="border-t pt-6 mt-6 space-y-4">
                          <h3 className="text-lg font-medium">Inventario y Envío</h3>
                          <div className="flex items-center space-x-2">
                              <Checkbox id="manage_stock" checked={productData.manage_stock} onCheckedChange={(checked) => updateProductData({ manage_stock: !!checked })} disabled={isProcessing} />
                              <Label htmlFor="manage_stock" className="text-sm font-normal">Gestionar inventario a nivel de producto</Label>
                          </div>
                          {productData.manage_stock && (
                              <div>
                                  <Label htmlFor="stockQuantity">Cantidad en Stock</Label>
                                  <Input id="stockQuantity" name="stockQuantity" type="number" value={productData.stockQuantity} onChange={handleInputChange} placeholder="Ej: 100" disabled={isProcessing} />
                              </div>
                          )}
                          <div>
                              <Label htmlFor="weight">Peso (kg)</Label>
                              <Input id="weight" name="weight" type="number" value={productData.weight} onChange={handleInputChange} placeholder="Ej: 0.5" disabled={isProcessing} />
                          </div>
                          <div>
                              <Label>Dimensiones (cm)</Label>
                              <div className="grid grid-cols-3 gap-2">
                                  <Input name="length" value={productData.dimensions?.length} onChange={(e) => updateProductData({ dimensions: { ...(productData.dimensions || {}), length: e.target.value } as any })} placeholder="Largo" disabled={isProcessing} />
                                  <Input name="width" value={productData.dimensions?.width} onChange={(e) => updateProductData({ dimensions: { ...(productData.dimensions || {}), width: e.target.value } as any })} placeholder="Ancho" disabled={isProcessing} />
                                  <Input name="height" value={productData.dimensions?.height} onChange={(e) => updateProductData({ dimensions: { ...(productData.dimensions || {}), height: e.target.value } as any })} placeholder="Alto" disabled={isProcessing} />
                              </div>
                          </div>
                          <div>
                              <Label htmlFor="shipping_class">Clase de envío</Label>
                              <Input id="shipping_class" name="shipping_class" value={productData.shipping_class} onChange={handleInputChange} placeholder="Introduce el slug de la clase de envío" disabled={isProcessing} />
                              <p className="text-xs text-muted-foreground mt-1">Encuentra el slug en WooCommerce &gt; Ajustes &gt; Envío &gt; Clases de envío.</p>
                          </div>
                      </div>
                  )}

                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Descripciones y Etiquetas</CardTitle>
                  <CardDescription>Esta información es clave para el SEO y para informar a tus clientes.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-6">
                   <div>
                    <Label htmlFor="tags">Etiquetas (separadas por comas)</Label>
                    <Input id="tags" name="tags" value={productData.tags} onChange={handleInputChange} placeholder="Ej: camiseta, algodón, verano, casual" disabled={isProcessing || isGenerating} />
                    <p className="text-xs text-muted-foreground mt-1">Ayudan a la IA y al SEO de tu producto.</p>
                  </div>

                  <div className="pt-2">
                    <Button onClick={handleGenerateContentWithAI} disabled={isProcessing || isGenerating || !productData.name} className="w-full sm:w-auto">
                        {isGenerating ? ( <Loader2 className="mr-2 h-4 w-4 animate-spin" /> ) : ( <Sparkles className="mr-2 h-4 w-4" /> )}
                        {isGenerating ? "Generando..." : "Generar Contenido con IA"}
                    </Button>
                    {!productData.name && <p className="text-xs text-destructive mt-1">Introduce un nombre de producto para activar la IA.</p>}
                  </div>

                  <div className="border-t pt-6 space-y-6">
                    <div>
                        <Label htmlFor="shortDescription">Descripción Corta</Label>
                        <RichTextEditor 
                            content={productData.shortDescription}
                            onChange={handleShortDescriptionChange}
                            onInsertImage={() => setIsImageDialogOpen(true)}
                            onSuggestLinks={handleSuggestLinks}
                            placeholder="Un resumen atractivo y conciso de tu producto..."
                            size="small"
                        />
                    </div>
                  
                    <div>
                        <Label htmlFor="longDescription">Descripción Larga</Label>
                        <RichTextEditor 
                            content={productData.longDescription}
                            onChange={handleLongDescriptionChange}
                            onInsertImage={() => setIsImageDialogOpen(true)}
                            onSuggestLinks={handleSuggestLinks}
                            placeholder="Describe tu producto en detalle: características, materiales, usos, etc."
                        />
                    </div>
                  </div>
                </CardContent>
              </Card>
          </div>
          <div className="lg:col-span-1 space-y-8">
              <Card>
                <CardHeader>
                  <CardTitle>Imágenes del Producto</CardTitle>
                  <CardDescription>Sube las imágenes para tu producto. La primera se usará como principal.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <ImageUploader photos={productData.photos} onPhotosChange={handlePhotosChange} isProcessing={isProcessing || isGenerating} maxPhotos={15} />
                  <Button 
                    onClick={handleGenerateImageMetadata} 
                    disabled={isProcessing || isGenerating || isGeneratingImageMeta || !productData.name} 
                    className="w-full"
                    variant="outline"
                  >
                    {isGeneratingImageMeta ? ( <Loader2 className="mr-2 h-4 w-4 animate-spin" /> ) : ( <Sparkles className="mr-2 h-4 w-4" /> )}
                    {isGeneratingImageMeta ? "Generando..." : "Generar SEO de Imágenes con IA"}
                  </Button>
                </CardContent>
              </Card>

              <Card>
                  <CardHeader>
                      <CardTitle className="flex items-center gap-2"><Languages /> Traducción (Opcional)</CardTitle>
                      <CardDescription>Crea automáticamente copias de este producto en otros idiomas.</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                      <div>
                          <Label>Idioma de Origen</Label>
                          <Select name="language" value={productData.language} onValueChange={handleSourceLanguageChange}>
                              <SelectTrigger><SelectValue /></SelectTrigger>
                              <SelectContent>
                                  {ALL_LANGUAGES.map(lang => (<SelectItem key={lang.code} value={lang.code}>{lang.name}</SelectItem>))}
                              </SelectContent>
                          </Select>
                      </div>
                      <div>
                          <Label>Crear traducciones en:</Label>
                           <div className="grid grid-cols-2 gap-2 pt-2">
                              {availableTargetLanguages.map(lang => (
                                  <div key={lang.code} className="flex items-center space-x-2">
                                      <Checkbox id={`lang-${lang.code}`} checked={productData.targetLanguages?.includes(lang.code)} onCheckedChange={() => handleLanguageToggle(lang.code)} />
                                      <Label htmlFor={`lang-${lang.code}`} className="font-normal">{lang.name}</Label>
                                  </div>
                              ))}
                          </div>
                      </div>
                  </CardContent>
              </Card>
          </div>
        </div>
      </div>
      <AlertDialog open={isImageDialogOpen} onOpenChange={setIsImageDialogOpen}>
          <AlertDialogContent>
              <AlertDialogHeader>
                  <AlertDialogTitle>Insertar Imagen</AlertDialogTitle>
                  <AlertDialogDescription>Sube una imagen o introduce una URL para insertarla en el contenido.</AlertDialogDescription>
              </AlertDialogHeader>
              <div className="space-y-4">
                  <div>
                      <Label htmlFor="image-upload">Subir archivo</Label>
                      <Input id="image-upload" type="file" accept="image/*" onChange={(e) => setImageFile(e.target.files?.[0] || null)} />
                  </div>
                  <div className="relative">
                      <div className="absolute inset-0 flex items-center">
                          <span className="w-full border-t" />
                      </div>
                      <div className="relative flex justify-center text-xs uppercase">
                          <span className="bg-background px-2 text-muted-foreground">O</span></div>
                  </div>
                  <div>
                      <Label htmlFor="image-url">Insertar desde URL</Label>
                      <Input id="image-url" value={imageUrl} onChange={(e) => setImageUrl(e.target.value)} placeholder="https://ejemplo.com/imagen.jpg" />
                  </div>
              </div>
              <AlertDialogFooter>
                  <AlertDialogCancel onClick={() => { setImageUrl(''); setImageFile(null); }}>Cancelar</AlertDialogCancel>
                  <AlertDialogAction onClick={handleInsertImageInLongDesc} disabled={isUploadingImage}>
                      {isUploadingImage && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                      Insertar Imagen
                  </AlertDialogAction>
              </AlertDialogFooter>
          </AlertDialogContent>
      </AlertDialog>
       <LinkSuggestionsDialog
          open={linkSuggestions.length > 0 && !isSuggestingLinks}
          onOpenChange={(open) => { if (!open) setLinkSuggestions([]); }}
          suggestions={linkSuggestions}
          onApplySuggestion={handleApplySuggestion}
          onApplyAll={handleApplyAllSuggestions}
      />
    </>
  );
}
