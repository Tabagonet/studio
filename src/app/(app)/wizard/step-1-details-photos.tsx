
"use client";

import React from 'react';
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from '@/components/ui/button';
import { ImageUploader } from '@/components/features/wizard/image-uploader';
import { AiAttributeSuggester } from '@/components/features/wizard/ai-attribute-suggester';
import type { ProductData, ProductAttribute, ProductPhoto, ProductType, WooCommerceCategory } from '@/lib/types';
import { PRODUCT_TYPES } from '@/lib/constants';
import { PlusCircle, Trash2, Loader2, CheckCircle2, XCircle, Sparkles } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useToast } from '@/hooks/use-toast';
import { auth, onAuthStateChanged } from '@/lib/firebase';
import { cn } from '@/lib/utils';
import Link from 'next/link';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';


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

export function Step1DetailsPhotos({ productData, updateProductData, isProcessing }: Step1DetailsPhotosProps) {
  const [wooCategories, setWooCategories] = React.useState<WooCommerceCategory[]>([]);
  const [isLoadingCategories, setIsLoadingCategories] = React.useState(false);
  const { toast } = useToast();

  const [skuValidation, setSkuValidation] = React.useState<ValidationState>({ status: 'idle', message: '' });
  const [nameValidation, setNameValidation] = React.useState<ValidationState>({ status: 'idle', message: '' });
  const [isGenerating, setIsGenerating] = React.useState(false);
  const [isAiConfigured, setIsAiConfigured] = React.useState<boolean | null>(null);


  // --- AI Config Check ---
  React.useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      if (user) {
        try {
          const token = await user.getIdToken();
          const response = await fetch('/api/check-config', {
            headers: { 'Authorization': `Bearer ${token}` }
          });
          if (response.ok) {
            const configStatus = await response.json();
            setIsAiConfigured(configStatus.googleAiApiKey);
          } else {
            setIsAiConfigured(false);
          }
        } catch (error) {
          console.error("Error checking AI configuration:", error);
          setIsAiConfigured(false);
        }
      } else {
        // No user logged in, AI is not available
        setIsAiConfigured(false);
      }
    });
    return () => unsubscribe();
  }, []);


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

  React.useEffect(() => {
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
  
  React.useEffect(() => {
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


  React.useEffect(() => {
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
  
  const handleCategoryChange = (value: string) => {
    const categoryId = value ? parseInt(value, 10) : null;
    const selectedCategory = wooCategories.find(c => c.id === categoryId) || null;
    updateProductData({ category: selectedCategory });
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
  
  const handleGenerateDescriptions = async () => {
    if (!productData.name) {
      toast({
        title: 'Falta el nombre',
        description: 'Por favor, introduce un nombre de producto antes de generar descripciones.',
        variant: 'destructive',
      });
      return;
    }
    
    const user = auth.currentUser;
    if (!user) {
        toast({ title: 'Error de autenticación', description: 'Por favor, inicia sesión de nuevo para usar la IA.', variant: 'destructive' });
        return;
    }

    setIsGenerating(true);
    toast({
      title: 'Generando Descripciones con IA...',
      description: 'Esto puede tardar unos segundos. Contactando con el modelo Gemini...',
    });

    try {
      const token = await user.getIdToken();
      const response = await fetch('/api/generate-description', {
          method: 'POST',
          headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${token}`
          },
          body: JSON.stringify({
            productName: productData.name,
            productType: productData.productType,
            keywords: productData.keywords,
          })
      });

      if (!response.ok) {
        let errorDetails = `Error del servidor (${response.status}): ${response.statusText}`;
        try {
            const errorResult = await response.json();
            // Use the more specific 'message' from the API error structure, then fallback to 'error'
            errorDetails = errorResult.message || errorResult.error || JSON.stringify(errorResult);
        } catch (e) {
            const responseText = await response.text();
            console.error("The API response was not valid JSON. Full response body:", responseText);
            errorDetails = `No se pudo leer la respuesta del error del servidor (código: ${response.status}). Revisa la consola del navegador para más detalles.`;
        }
        throw new Error(errorDetails);
      }
      
      const result = await response.json();

      updateProductData({
        shortDescription: result.shortDescription || '',
        longDescription: result.longDescription || '',
      });

      toast({
        title: '¡Descripciones Generadas!',
        description: 'Las descripciones corta y larga han sido actualizadas.',
      });
    } catch (error: any) {
      console.error('Error generando descripciones:', error);
      toast({
        title: 'Error de IA',
        description: `La IA ha devuelto un error. Detalle: ${error.message}`,
        variant: 'destructive',
      });
    } finally {
      setIsGenerating(false);
    }
  };

  const isAiButtonDisabled = isGenerating || !productData.name || isProcessing || isAiConfigured !== true;

  const getAiButtonContent = () => {
    if (isAiConfigured === null) {
      return <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Verificando IA...</>;
    }
    if (isGenerating) {
      return <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Generando...</>;
    }
    return <><Sparkles className="mr-2 h-4 w-4" /> Generar con IA</>;
  };


  return (
    <TooltipProvider>
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
            <Select name="category" value={productData.category?.id.toString() ?? ''} onValueChange={handleCategoryChange}>
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
                  <SelectItem key={cat.id} value={cat.id.toString()}>{cat.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            {isLoadingCategories && <p className="text-xs text-muted-foreground mt-1">Cargando categorías desde WooCommerce...</p>}
          </div>
        </CardContent>
      </Card>
      
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
              <div>
                <CardTitle>Descripciones y Palabras Clave</CardTitle>
                <CardDescription>Esta información es clave para el SEO y para informar a tus clientes.</CardDescription>
              </div>
                <Tooltip>
                    <TooltipTrigger asChild>
                        <div className="inline-block"> {/* Wrapper div for tooltip on disabled button */}
                            <Button
                                onClick={handleGenerateDescriptions}
                                disabled={isAiButtonDisabled}
                                size="sm"
                            >
                                {getAiButtonContent()}
                            </Button>
                        </div>
                    </TooltipTrigger>
                    {isAiConfigured === false && (
                        <TooltipContent>
                            <p>La clave API de Google AI no está configurada.</p>
                            <p>Ve a <Link href="/settings" className="underline font-semibold">Configuración</Link> para añadirla.</p>
                        </TooltipContent>
                    )}
                </Tooltip>
          </div>
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
                value={productData.shortDescription || ''}
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
                value={productData.longDescription || ''}
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
    </TooltipProvider>
  );
}
