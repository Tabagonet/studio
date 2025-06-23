
"use client";

import React, { useState, useEffect } from 'react';
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from '@/components/ui/button';
import { ImageUploader } from '@/components/features/wizard/image-uploader';
import type { ProductData, ProductAttribute, ProductPhoto, ProductType, WooCommerceCategory } from '@/lib/types';
import { PRODUCT_TYPES } from '@/lib/constants';
import { PlusCircle, Trash2, Loader2 } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useToast } from '@/hooks/use-toast';
import { extractProductNameAndAttributesFromFilename } from '@/lib/utils';
import { Checkbox } from '@/components/ui/checkbox';
import { VariableProductManager } from '@/components/features/wizard/variable-product-manager';
import { GroupedProductSelector } from '@/components/features/wizard/grouped-product-selector';
import { auth } from '@/lib/firebase';

interface Step1DetailsPhotosProps {
  productData: ProductData;
  updateProductData: (data: Partial<ProductData>) => void;
  isProcessing?: boolean; // Accept isProcessing prop
}

export function Step1DetailsPhotos({ productData, updateProductData, isProcessing = false }: Step1DetailsPhotosProps) {
  const [wooCategories, setWooCategories] = useState<WooCommerceCategory[]>([]);
  const [isLoadingCategories, setIsLoadingCategories] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    const fetchCategories = async () => {
      setIsLoadingCategories(true);
      const user = auth.currentUser;
      if (!user) {
          setIsLoadingCategories(false);
          return;
      }
      try {
        const token = await user.getIdToken();
        const response = await fetch('/api/woocommerce/categories', {
            headers: { 'Authorization': `Bearer ${token}` },
        });
        if (!response.ok) {
          const errorData = await response.json();
          throw new Error(errorData.error || `Error: ${response.status}`);
        }
        const data: WooCommerceCategory[] = await response.json();
        setWooCategories(data);
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
    fetchCategories();
  }, [toast]);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    updateProductData({ [e.target.name]: e.target.value });
  };

  const handleSelectChange = (name: string, value: string | ProductType) => {
    if (name === 'category') {
      const selectedCategory = wooCategories.find(cat => cat.slug === value) || null;
      updateProductData({ category: selectedCategory });
    } else {
      updateProductData({ [name]: value });
    }
  };

  const handlePhotosChange = (newPhotos: ProductPhoto[]) => {
    if (!productData.name && newPhotos && newPhotos.length > 0) {
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
  
  const handleGroupedIdsChange = (ids: number[]) => {
    updateProductData({ groupedProductIds: ids });
  };

  const addAttribute = () => {
    updateProductData({ attributes: [...productData.attributes, { name: '', value: '', forVariations: false, visible: true }] });
  };

  const removeAttribute = (index: number) => {
    const newAttributes = productData.attributes.filter((_, i) => i !== index);
    updateProductData({ attributes: newAttributes });
  };

  return (
    <div className="space-y-8">
      <Card>
        <CardHeader>
          <CardTitle>Paso 1: Detalles y Fotos</CardTitle>
          <CardDescription>Completa la información básica y añade las imágenes de tu producto.</CardDescription>
        </CardHeader>
      </Card>
      
      <Card>
        <CardHeader>
          <CardTitle>Información del Producto</CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <Label htmlFor="name">Nombre del Producto</Label>
              <Input id="name" name="name" value={productData.name} onChange={handleInputChange} placeholder="Ej: Camiseta de Algodón" disabled={isProcessing} />
              <p className="text-xs text-muted-foreground mt-1">Se autocompleta desde el nombre de la imagen.</p>
            </div>
            <div>
              <Label htmlFor="sku">SKU</Label>
              <Input id="sku" name="sku" value={productData.sku} onChange={handleInputChange} placeholder="Ej: CAM-ALG-AZ-M" disabled={isProcessing} />
            </div>
          </div>

          <div>
            <Label htmlFor="productType">Tipo de Producto</Label>
            <Select name="productType" value={productData.productType} onValueChange={(value) => handleSelectChange('productType', value as ProductType)} disabled={isProcessing}>
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

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <Label htmlFor="regularPrice">Precio Regular (€)</Label>
              <Input id="regularPrice" name="regularPrice" type="number" value={productData.regularPrice} onChange={handleInputChange} placeholder="Ej: 29.99" disabled={isProcessing} />
            </div>
            <div>
              <Label htmlFor="salePrice">Precio de Oferta (€) (Opcional)</Label>
              <Input id="salePrice" name="salePrice" type="number" value={productData.salePrice} onChange={handleInputChange} placeholder="Ej: 19.99" disabled={isProcessing} />
            </div>
          </div>

          <div>
            <Label htmlFor="category">Categoría</Label>
            <Select name="category" value={productData.category?.slug ?? ''} onValueChange={(value) => handleSelectChange('category', value as string)} disabled={isProcessing || isLoadingCategories}>
              <SelectTrigger id="category">
                {isLoadingCategories ? (
                  <div className="flex items-center">
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    <SelectValue placeholder="Cargando categorías..." />
                  </div>
                ) : (
                  <SelectValue placeholder="Selecciona una categoría" />
                )}
              </SelectTrigger>
              <SelectContent>
                {!isLoadingCategories && wooCategories.length === 0 && <SelectItem value="" disabled>No hay categorías disponibles</SelectItem>}
                {wooCategories.map(cat => (
                  <SelectItem key={cat.id} value={cat.slug}>{cat.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            {isLoadingCategories && <p className="text-xs text-muted-foreground mt-1">Cargando categorías desde WooCommerce...</p>}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Descripciones y Palabras Clave</CardTitle>
          <CardDescription>Esta información es clave para el SEO y para informar a tus clientes.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
           <div>
            <Label htmlFor="keywords">Palabras Clave (separadas por comas)</Label>
            <Input id="keywords" name="keywords" value={productData.keywords} onChange={handleInputChange} placeholder="Ej: camiseta, algodón, verano, casual" disabled={isProcessing} />
            <p className="text-xs text-muted-foreground mt-1">Ayudan a la IA y al SEO de tu producto.</p>
          </div>

          <div>
              <Label htmlFor="shortDescription">Descripción Corta</Label>
              <Textarea
                id="shortDescription"
                name="shortDescription"
                value={productData.shortDescription}
                onChange={handleInputChange}
                placeholder="Un resumen atractivo y conciso de tu producto."
                rows={3}
                disabled={isProcessing}
              />
          </div>
        
          <div>
              <Label htmlFor="longDescription">Descripción Larga</Label>
              <Textarea
                id="longDescription"
                name="longDescription"
                value={productData.longDescription}
                onChange={handleInputChange}
                placeholder="Describe tu producto en detalle: características, materiales, usos, etc."
                rows={6}
                disabled={isProcessing}
              />
          </div>
        </CardContent>
      </Card>
      
      <Card>
        <CardHeader>
          <CardTitle>Atributos del Producto</CardTitle>
          <CardDescription>Añade atributos como talla, color, etc. Para productos variables, separa los valores con " | ".</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {productData.attributes.map((attr, index) => (
            <div key={index} className="flex items-end gap-2 p-3 border rounded-md bg-muted/20">
              <div className="grid grid-cols-2 gap-2 flex-1">
                <div>
                    <Label htmlFor={`attrName-${index}`}>Nombre</Label>
                    <Input 
                      id={`attrName-${index}`} 
                      value={attr.name} 
                      onChange={(e) => handleAttributeChange(index, 'name', e.target.value)}
                      placeholder="Ej: Color" 
                      disabled={isProcessing}
                    />
                </div>
                <div>
                    <Label htmlFor={`attrValue-${index}`}>Valor(es)</Label>
                    <Input 
                      id={`attrValue-${index}`} 
                      value={attr.value} 
                      onChange={(e) => handleAttributeChange(index, 'value', e.target.value)}
                      placeholder="Ej: Azul | Rojo | Verde" 
                      disabled={isProcessing}
                    />
                </div>
              </div>
              <div className="flex flex-col gap-2 pl-2 pt-5">
                {productData.productType === 'variable' && (
                    <div className="flex items-center space-x-2">
                        <Checkbox
                            id={`attrForVariations-${index}`}
                            checked={!!attr.forVariations}
                            onCheckedChange={(checked) => handleAttributeChange(index, 'forVariations', !!checked)}
                            disabled={isProcessing}
                        />
                        <Label htmlFor={`attrForVariations-${index}`} className="text-xs font-normal leading-none cursor-pointer">
                            Para<br/>variaciones
                        </Label>
                    </div>
                )}
                 <div className="flex items-center space-x-2">
                    <Checkbox
                        id={`attrVisible-${index}`}
                        checked={!!attr.visible}
                        onCheckedChange={(checked) => handleAttributeChange(index, 'visible', !!checked)}
                        disabled={isProcessing}
                    />
                    <Label htmlFor={`attrVisible-${index}`} className="text-xs font-normal leading-none cursor-pointer">
                        Visible
                    </Label>
                </div>
              </div>
              <Button variant="ghost" size="icon" onClick={() => removeAttribute(index)} aria-label="Eliminar atributo" disabled={isProcessing} className="self-center">
                <Trash2 className="h-4 w-4 text-destructive" />
              </Button>
            </div>
          ))}
          <Button type="button" variant="outline" onClick={addAttribute} className="mt-2" disabled={isProcessing}>
            <PlusCircle className="mr-2 h-4 w-4" /> Añadir Atributo
          </Button>
        </CardContent>
      </Card>
      
      {productData.productType === 'variable' && (
        <VariableProductManager 
          productData={productData}
          updateProductData={updateProductData}
        />
      )}

      {productData.productType === 'grouped' && (
        <Card>
          <CardHeader>
            <CardTitle>Productos Agrupados</CardTitle>
            <CardDescription>Selecciona los productos simples que formarán parte de este grupo.</CardDescription>
          </CardHeader>
          <CardContent>
            <GroupedProductSelector 
              productIds={productData.groupedProductIds || []}
              onProductIdsChange={handleGroupedIdsChange}
            />
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Imágenes del Producto</CardTitle>
          <CardDescription>Sube las imágenes para tu producto. La primera imagen se usará como principal.</CardDescription>
        </CardHeader>
        <CardContent>
          <ImageUploader photos={productData.photos} onPhotosChange={handlePhotosChange} isProcessing={isProcessing} />
        </CardContent>
      </Card>
    </div>
  );
}

    