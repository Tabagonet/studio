
"use client";

import React, { useState, useEffect } from 'react';
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

interface Step1DetailsPhotosProps {
  productData: ProductData;
  updateProductData: (data: Partial<ProductData>) => void;
  isProcessing?: boolean;
}

const StatusIndicator = ({ status, message }: { status: 'checking' | 'exists' | 'available' | 'idle', message: string }) => {
    if (status === 'idle') return null;
    if (status === 'checking') return <div className="flex items-center text-xs text-muted-foreground mt-1"><Loader2 className="h-3 w-3 mr-1 animate-spin" /> Verificando...</div>;
    const color = status === 'exists' ? 'text-destructive' : 'text-green-600';
    const Icon = status === 'exists' ? AlertCircle : CheckCircle;
    return <div className={`flex items-center text-xs ${color} mt-1`}><Icon className="h-3 w-3 mr-1" /> {message}</div>;
};


export function Step1DetailsPhotos({ productData, updateProductData, isProcessing = false }: Step1DetailsPhotosProps) {
  const [wooCategories, setWooCategories] = useState<WooCommerceCategory[]>([]);
  const [isLoadingCategories, setIsLoadingCategories] = useState(true);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isGeneratingImageMeta, setIsGeneratingImageMeta] = useState(false);
  const [skuStatus, setSkuStatus] = useState<{ status: 'idle' | 'checking' | 'exists' | 'available'; message: string }>({ status: 'idle', message: '' });
  const [nameStatus, setNameStatus] = useState<{ status: 'idle' | 'checking' | 'exists' | 'available'; message: string }>({ status: 'idle', message: '' });
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
        console.error("Error fetching WooCommerce categories:", error);
        toast({
          title: "Error al Cargar Categorías",
          description: (error as Error).message || "No se pudieron cargar las categorías de WooCommerce.",
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
  
    useEffect(() => {
    const checkProductExistence = async (field: 'sku' | 'name', value: string) => {
        if (!value || value.length < 3) {
            (field === 'sku' ? setSkuStatus : setNameStatus)({ status: 'idle', message: '' });
            return;
        }

        const user = auth.currentUser;
        if (!user) return;
        const token = await user.getIdToken();

        (field === 'sku' ? setSkuStatus : setNameStatus)({ status: 'checking', message: '' });

        try {
            const response = await fetch(`/api/woocommerce/products/check?${field}=${encodeURIComponent(value)}`, {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            const data = await response.json();
            if (response.ok) {
                if (data.exists) {
                    (field === 'sku' ? setSkuStatus : setNameStatus)({ status: 'exists', message: data.message });
                } else {
                    (field === 'sku' ? setSkuStatus : setNameStatus)({ status: 'available', message: `El ${field.toUpperCase()} está disponible.` });
                }
            } else {
                 (field === 'sku' ? setSkuStatus : setNameStatus)({ status: 'idle', message: '' }); // Reset on error
            }
        } catch (error) {
            console.error(`Error checking ${field}:`, error);
            (field === 'sku' ? setSkuStatus : setNameStatus)({ status: 'idle', message: '' });
        }
    };

    if (debouncedSku) checkProductExistence('sku', debouncedSku);
    if (debouncedName) checkProductExistence('name', debouncedName);

  }, [debouncedSku, debouncedName]);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    updateProductData({ [e.target.name]: e.target.value });
  };

  const handleSelectChange = (name: 'productType' | 'category', value: string) => {
    if (name === 'productType') {
      updateProductData({ 
        productType: value as ProductType, 
        // Reset attributes and variations when type changes to avoid inconsistencies
        attributes: [{ name: '', value: '', forVariations: false, visible: true }], 
        variations: [] 
      });
    } else if (name === 'category') {
      const selectedCat = wooCategories.find(c => c.id.toString() === value);
      updateProductData({ category: selectedCat || null, categoryPath: '' });
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
            productName: productData.name,
            productType: productData.productType,
            keywords: productData.keywords,
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
            shortDescription: aiContent.shortDescription,
            longDescription: aiContent.longDescription,
            keywords: aiContent.keywords,
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
            keywords: productData.keywords,
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


  return (
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
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
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
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                  <CardTitle>Inventario y Envío</CardTitle>
                  <CardDescription>Define el stock, peso y dimensiones del producto.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                  <div className="flex items-center space-x-2">
                  <Checkbox
                      id="manage_stock"
                      checked={productData.manage_stock}
                      onCheckedChange={(checked) => updateProductData({ manage_stock: !!checked })}
                      disabled={isProcessing}
                  />
                  <Label htmlFor="manage_stock" className="text-sm font-normal">
                      Gestionar inventario a nivel de producto
                  </Label>
                  </div>
                  {productData.manage_stock && (
                  <div>
                      <Label htmlFor="stockQuantity">Cantidad en Stock</Label>
                      <Input
                      id="stockQuantity"
                      name="stockQuantity"
                      type="number"
                      value={productData.stockQuantity}
                      onChange={handleInputChange}
                      placeholder="Ej: 100"
                      disabled={isProcessing}
                      />
                  </div>
                  )}
                  <div>
                  <Label htmlFor="weight">Peso (kg)</Label>
                  <Input
                      id="weight"
                      name="weight"
                      type="number"
                      value={productData.weight}
                      onChange={handleInputChange}
                      placeholder="Ej: 0.5"
                      disabled={isProcessing}
                  />
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
                  <Input
                      id="shipping_class"
                      name="shipping_class"
                      value={productData.shipping_class}
                      onChange={handleInputChange}
                      placeholder="Introduce el slug de la clase de envío"
                      disabled={isProcessing}
                  />
                  <p className="text-xs text-muted-foreground mt-1">
                      Encuentra el slug en WooCommerce &gt; Ajustes &gt; Envío &gt; Clases de envío.
                  </p>
                  </div>
              </CardContent>
            </Card>
            
            {productData.productType === 'grouped' && (
                <Card>
                    <CardHeader>
                        <CardTitle>Productos Agrupados</CardTitle>
                        <CardDescription>Busca y selecciona los productos simples que formarán parte de este grupo.</CardDescription>
                    </CardHeader>
                    <CardContent>
                        <GroupedProductSelector 
                            productIds={productData.groupedProductIds || []} 
                            onProductIdsChange={(ids) => updateProductData({ groupedProductIds: ids })} 
                        />
                    </CardContent>
                </Card>
            )}

            <Card>
              <CardHeader>
                <CardTitle>Descripciones y Palabras Clave</CardTitle>
                <CardDescription>Esta información es clave para el SEO y para informar a tus clientes.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                 <div>
                  <Label htmlFor="keywords">Palabras Clave (separadas por comas)</Label>
                  <Input id="keywords" name="keywords" value={productData.keywords} onChange={handleInputChange} placeholder="Ej: camiseta, algodón, verano, casual" disabled={isProcessing || isGenerating} />
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
                      <Textarea
                        id="shortDescription"
                        name="shortDescription"
                        value={productData.shortDescription}
                        onChange={handleInputChange}
                        placeholder="Un resumen atractivo y conciso de tu producto que será generado por la IA."
                        rows={3}
                        disabled={isProcessing || isGenerating}
                      />
                  </div>
                
                  <div>
                      <Label htmlFor="longDescription">Descripción Larga</Label>
                      <Textarea
                        id="longDescription"
                        name="longDescription"
                        value={productData.longDescription}
                        onChange={handleInputChange}
                        placeholder="Describe tu producto en detalle: características, materiales, usos, etc. La IA lo generará por ti."
                        rows={6}
                        disabled={isProcessing || isGenerating}
                      />
                  </div>
                </div>
              </CardContent>
            </Card>

            {productData.productType !== 'grouped' && (
            <Card>
                <CardHeader>
                    <CardTitle>Atributos del Producto</CardTitle>
                    <CardDescription>Añade atributos como talla, color, etc. Para productos variables, separa los valores con " | ".</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                {productData.attributes.map((attr, index) => (
                    <div key={index} className="flex flex-col sm:flex-row items-start sm:items-end gap-2 p-3 border rounded-md bg-muted/20">
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
                </CardContent>
            </Card>
            )}

             {productData.productType === 'variable' && (
                <VariableProductManager productData={productData} updateProductData={updateProductData} />
            )}
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
  );
}
