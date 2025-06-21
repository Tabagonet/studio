
"use client";

import React, { useState, useEffect } from 'react';
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from '@/components/ui/button';
import { ImageUploader } from '@/components/features/wizard/image-uploader';
import { AiAttributeSuggester } from '@/components/features/wizard/ai-attribute-suggester';
import type { ProductData, ProductAttribute, ProductPhoto, ProductType, WooCommerceCategory } from '@/lib/types';
import { PRODUCT_TYPES } from '@/lib/constants';
import { PlusCircle, Trash2, Loader2, CheckCircle2, XCircle } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useToast } from '@/hooks/use-toast';
import { auth } from '@/lib/firebase';
import { cn } from '@/lib/utils';

interface Step1DetailsPhotosProps {
  productData: ProductData;
  updateProductData: (data: Partial<ProductData>) => void;
  isProcessing: boolean;
}

type ValidationStatus = 'idle' | 'checking' | 'valid' | 'invalid';
interface ValidationState {
  status: ValidationStatus;
  message: string;
}

export function Step1DetailsPhotos({ productData, updateProductData }: Step1DetailsPhotosProps) {
  const [wooCategories, setWooCategories] = useState<WooCommerceCategory[]>([]);
  const [isLoadingCategories, setIsLoadingCategories] = useState(false);
  const { toast } = useToast();

  const [skuValidation, setSkuValidation] = useState<ValidationState>({ status: 'idle', message: '' });
  const [nameValidation, setNameValidation] = useState<ValidationState>({ status: 'idle', message: '' });


  // --- Validation Logic ---
  const checkExistence = async (type: 'sku' | 'name', value: string) => {
    if (!value.trim()) {
      return { exists: false };
    }
    const user = auth.currentUser;
    if (!user) {
      // Cannot check if not logged in, but don't show an error
      return { exists: false };
    }
    const token = await user.getIdToken();
    const response = await fetch(`/api/woocommerce/products/check?${type}=${encodeURIComponent(value)}`, {
        headers: { 'Authorization': `Bearer ${token}` }
    });
    if (!response.ok) {
      throw new Error('Network response was not ok');
    }
    return response.json();
  };

  useEffect(() => {
    const skuValue = productData.sku;
    if (!skuValue) {
      setSkuValidation({ status: 'idle', message: '' });
      return;
    }

    setSkuValidation({ status: 'checking', message: '' });
    const handler = setTimeout(async () => {
      try {
        const data = await checkExistence('sku', skuValue);
        if (data.exists) {
          setSkuValidation({ status: 'invalid', message: data.message });
        } else {
          setSkuValidation({ status: 'valid', message: 'SKU disponible' });
        }
      } catch (error) {
        console.error("SKU check failed:", error);
        setSkuValidation({ status: 'idle', message: 'Error al verificar SKU' });
      }
    }, 800); // Debounce delay

    return () => clearTimeout(handler);
  }, [productData.sku]);
  
  useEffect(() => {
    const nameValue = productData.name;
    if (!nameValue) {
      setNameValidation({ status: 'idle', message: '' });
      return;
    }

    setNameValidation({ status: 'checking', message: '' });
    const handler = setTimeout(async () => {
      try {
        const data = await checkExistence('name', nameValue);
        if (data.exists) {
          setNameValidation({ status: 'invalid', message: data.message });
        } else {
          setNameValidation({ status: 'valid', message: 'Nombre disponible' });
        }
      } catch (error) {
        console.error("Name check failed:", error);
        setNameValidation({ status: 'idle', message: 'Error al verificar el nombre' });
      }
    }, 800); // Debounce delay

    return () => clearTimeout(handler);
  }, [productData.name]);

  // --- End Validation Logic ---


  useEffect(() => {
    const fetchCategories = async () => {
      setIsLoadingCategories(true);
      try {
        const response = await fetch('/api/woocommerce/categories');
        if (!response.ok) {
          let errorMessage = `Error fetching categories: ${response.status} ${response.statusText}`;
          const responseText = await response.text();
          try {
            const errorData = JSON.parse(responseText);
            errorMessage = errorData.error || errorData.message || JSON.stringify(errorData);
          } catch (parseError) {
            errorMessage = `Server returned non-JSON error for categories. Status: ${response.status}. Body: ${responseText.substring(0,100)}...`;
            console.error("Non-JSON error response from /api/woocommerce/categories:", responseText);
          }
          throw new Error(errorMessage);
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
    updateProductData({ [name]: value });
  };

  const handlePhotosChange = (photos: ProductPhoto[]) => {
    updateProductData({ photos });
    if (!productData.name && photos.length > 0) {
      // Find the first photo that was just added (has a `file` object)
      // The `p &&` check adds robustness against sparse arrays.
      const firstNewFile = photos.find(p => p && p.file);
      
      if (firstNewFile) {
        const potentialName = firstNewFile.name.replace(/-\d+\.\w+$/, '').replace(/[_-]/g, ' ');
        updateProductData({ name: potentialName });
      }
    }
  };

  const handleAttributeChange = (index: number, field: keyof ProductAttribute, value: string) => {
    const newAttributes = [...productData.attributes];
    newAttributes[index] = { ...newAttributes[index], [field]: value };
    updateProductData({ attributes: newAttributes });
  };

  const addAttribute = () => {
    updateProductData({ attributes: [...productData.attributes, { name: '', value: '' }] });
  };

  const removeAttribute = (index: number) => {
    const newAttributes = productData.attributes.filter((_, i) => i !== index);
    updateProductData({ attributes: newAttributes });
  };

  const handleSuggestedAttributes = (suggested: ProductAttribute[]) => {
    const existingNames = new Set(productData.attributes.map(attr => attr.name.toLowerCase()));
    const newAttributesToAdd = suggested.filter(sAttr => !existingNames.has(sAttr.name.toLowerCase()));
    updateProductData({ attributes: [...productData.attributes, ...newAttributesToAdd] });
  };

  return (
    <div className="space-y-8">
      <Card>
        <CardHeader>
          <CardTitle>Información del Producto</CardTitle>
          <CardDescription>Completa los detalles básicos de tu producto.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <Label htmlFor="name">Nombre del Producto</Label>
              <div className="relative">
                <Input
                  id="name"
                  name="name"
                  value={productData.name}
                  onChange={handleInputChange}
                  placeholder="Ej: Camiseta de Algodón"
                  className={cn(
                    nameValidation.status === 'invalid' && 'border-destructive focus-visible:ring-destructive',
                    nameValidation.status === 'valid' && 'border-green-500 focus-visible:ring-green-500'
                  )}
                />
                <div className="absolute inset-y-0 right-0 flex items-center pr-3 pointer-events-none">
                  {nameValidation.status === 'checking' && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
                  {nameValidation.status === 'valid' && <CheckCircle2 className="h-4 w-4 text-green-500" />}
                  {nameValidation.status === 'invalid' && <XCircle className="h-4 w-4 text-destructive" />}
                </div>
              </div>
              {nameValidation.message && (
                <p className={`text-xs mt-1 ${nameValidation.status === 'invalid' ? 'text-destructive' : 'text-green-600'}`}>
                  {nameValidation.message}
                </p>
              )}
              <p className="text-xs text-muted-foreground mt-1">Se puede autocompletar desde el nombre de la primera imagen.</p>
            </div>

            <div>
              <Label htmlFor="sku">SKU</Label>
               <div className="relative">
                <Input
                  id="sku"
                  name="sku"
                  value={productData.sku}
                  onChange={handleInputChange}
                  placeholder="Ej: CAM-ALG-AZ-M"
                  className={cn(
                    skuValidation.status === 'invalid' && 'border-destructive focus-visible:ring-destructive',
                    skuValidation.status === 'valid' && 'border-green-500 focus-visible:ring-green-500'
                  )}
                />
                <div className="absolute inset-y-0 right-0 flex items-center pr-3 pointer-events-none">
                  {skuValidation.status === 'checking' && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
                  {skuValidation.status === 'valid' && <CheckCircle2 className="h-4 w-4 text-green-500" />}
                  {skuValidation.status === 'invalid' && <XCircle className="h-4 w-4 text-destructive" />}
                </div>
              </div>
              {skuValidation.message && (
                <p className={`text-xs mt-1 ${skuValidation.status === 'invalid' ? 'text-destructive' : 'text-green-600'}`}>
                  {skuValidation.message}
                </p>
              )}
            </div>
          </div>

          <div>
            <Label htmlFor="productType">Tipo de Producto</Label>
            <Select name="productType" value={productData.productType} onValueChange={(value) => handleSelectChange('productType', value as ProductType)}>
              <SelectTrigger id="productType">
                <SelectValue placeholder="Selecciona un tipo de producto" />
              </SelectTrigger>
              <SelectContent>
                {PRODUCT_TYPES && PRODUCT_TYPES.map(type => (
                  <SelectItem key={type.value} value={type.value}>{type.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            {productData.productType !== 'simple' && (
              <p className="text-xs text-muted-foreground mt-1">
                La configuración detallada para productos variables o agrupados se realizará en WooCommerce.
              </p>
            )}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <Label htmlFor="regularPrice">Precio Regular (€)</Label>
              <Input id="regularPrice" name="regularPrice" type="number" value={productData.regularPrice} onChange={handleInputChange} placeholder="Ej: 29.99" />
            </div>
            <div>
              <Label htmlFor="salePrice">Precio de Oferta (€) (Opcional)</Label>
              <Input id="salePrice" name="salePrice" type="number" value={productData.salePrice} onChange={handleInputChange} placeholder="Ej: 19.99" />
            </div>
          </div>

          <div>
            <Label htmlFor="category">Categoría</Label>
            <Select name="category" value={productData.category} onValueChange={(value) => handleSelectChange('category', value)}>
              <SelectTrigger id="category" disabled={isLoadingCategories}>
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
                {!isLoadingCategories && wooCategories.length === 0 && <SelectItem value="no-cat" disabled>No hay categorías disponibles</SelectItem>}
                {wooCategories.map(cat => (
                  <SelectItem key={cat.id} value={cat.slug}>{cat.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            {isLoadingCategories && <p className="text-xs text-muted-foreground mt-1">Cargando categorías desde WooCommerce...</p>}
          </div>

          <div>
            <Label htmlFor="keywords">Palabras Clave (separadas por comas)</Label>
            <Input id="keywords" name="keywords" value={productData.keywords} onChange={handleInputChange} placeholder="Ej: camiseta, algodón, verano, casual" />
          </div>
        </CardContent>
      </Card>
      
      <Card>
        <CardHeader>
          <CardTitle>Atributos del Producto</CardTitle>
          <CardDescription>Añade atributos como talla, color, material, etc. Para productos variables, define aquí los atributos que usarás para las variaciones.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {productData.attributes.map((attr, index) => (
            <div key={index} className="flex items-end gap-2 p-3 border rounded-md bg-muted/20">
              <div className="flex-1">
                <Label htmlFor={`attrName-${index}`}>Nombre del Atributo</Label>
                <Input 
                  id={`attrName-${index}`} 
                  value={attr.name} 
                  onChange={(e) => handleAttributeChange(index, 'name', e.target.value)}
                  placeholder="Ej: Color" 
                />
              </div>
              <div className="flex-1">
                <Label htmlFor={`attrValue-${index}`}>Valor(es) del Atributo</Label>
                <Input 
                  id={`attrValue-${index}`} 
                  value={attr.value} 
                  onChange={(e) => handleAttributeChange(index, 'value', e.target.value)}
                  placeholder="Ej: Azul | Rojo | Verde (para variaciones)" 
                />
                 {productData.productType === 'variable' && (
                    <p className="text-xs text-muted-foreground mt-1">Para variaciones, separa los valores con " | " (ej: S | M | L)</p>
                  )}
              </div>
              <Button variant="ghost" size="icon" onClick={() => removeAttribute(index)} aria-label="Eliminar atributo">
                <Trash2 className="h-4 w-4 text-destructive" />
              </Button>
            </div>
          ))}
          <Button type="button" variant="outline" onClick={addAttribute} className="mt-2">
            <PlusCircle className="mr-2 h-4 w-4" /> Añadir Atributo
          </Button>
          <AiAttributeSuggester keywords={productData.keywords} onAttributesSuggested={handleSuggestedAttributes} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Imágenes del Producto</CardTitle>
          <CardDescription>Sube las imágenes para tu producto. La primera imagen se usará como principal por defecto.</CardDescription>
        </CardHeader>
        <CardContent>
          <ImageUploader photos={productData.photos} onPhotosChange={handlePhotosChange} isProcessing={false} />
        </CardContent>
      </Card>
    </div>
  );
}
