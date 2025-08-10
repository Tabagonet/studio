
// src/components/features/products/variation-editor.tsx
"use client";

import React from 'react';
import { v4 as uuidv4 } from 'uuid';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import type { ProductVariation, ProductPhoto, ProductData } from '@/lib/types';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { GitCommitHorizontal, Sparkles, ImageIcon, Trash2, Loader2 } from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import Image from 'next/image';

interface VariationEditorProps {
  product: ProductData | null;
  onProductChange: (data: Partial<ProductData>) => void;
  images: ProductPhoto[];
}

// Helper function to compute the Cartesian product of arrays
function cartesian(...args: string[][]): string[][] {
    const r: string[][] = [];
    const max = args.length - 1;
    function helper(arr: string[], i: number) {
        for (let j = 0, l = args[i].length; j < l; j++) {
            const a = [...arr, args[i][j]];
            if (i === max) {
                r.push(a);
            } else {
                helper(a, i + 1);
            }
        }
    }
    helper([], 0);
    return r;
}

export function VariationEditor({ product, onProductChange, images }: VariationEditorProps) {
  const { toast } = useToast();
  
  if (!product) {
    return (
      <div className="flex justify-center items-center h-24 border rounded-md">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const handleGenerateVariations = () => {
    const variationAttributes = product.attributes.filter(
        (attr) => attr.forVariations && attr.name && attr.name.trim() && attr.value && attr.value.trim()
    );

    if (!variationAttributes || variationAttributes.length === 0) {
        toast({ title: "No hay atributos para variaciones", description: "Marca al menos un atributo como 'Para variaciones'.", variant: "destructive" });
        return;
    }

    const attributeNames = variationAttributes.map(attr => attr.name);
    const attributeValueSets = variationAttributes.map(attr =>
        (attr.value || '').split('|').map(v => v.trim()).filter(Boolean)
    );
    
    if (attributeValueSets.some((set) => set.length === 0)) {
         toast({ title: "Valores de atributo vacíos", description: "Asegúrate de que cada atributo para variación tiene valores.", variant: "destructive" });
        return;
    }

    const combinations = cartesian(...attributeValueSets);
    const primaryImage = images.find(p => p.isPrimary) || images[0];

    const newVariations: ProductVariation[] = combinations.map(combo => {
        const attributes = combo.map((value, index) => ({ name: attributeNames[index], option: value }));
        const skuSuffix = attributes.map(a => a.option.substring(0,3).toUpperCase()).join('-');
        return { 
            id: uuidv4(), // Client-side ID
            variation_id: undefined, // No WooCommerce ID yet
            attributes: attributes, 
            sku: `${product.sku || 'VAR'}-${skuSuffix}`, 
            regularPrice: product.regularPrice || '', 
            salePrice: product.salePrice || '',
            stockQuantity: '', 
            manage_stock: false,
            image: primaryImage ? { id: primaryImage.id } : { id: null }, 
        };
    });
    
    onProductChange({ variations: newVariations });
    toast({ title: `¡${newVariations.length} variaciones generadas!`, description: "Revisa los detalles de cada una." });
  };


  const handleVariationChange = (variationIdentifier: string | number, field: string, value: any) => {
    if (!product.variations) return;
    const updatedVariations = product.variations.map(v => {
      if (v.id === variationIdentifier || v.variation_id === variationIdentifier) {
        return { ...v, [field]: value };
      }
      return v;
    });
    onProductChange({ variations: updatedVariations });
  };
  
  const handleDimensionChange = (variationIdentifier: string | number, dim: 'length' | 'width' | 'height', value: string) => {
    if (!product.variations) return;
    const updatedVariations = product.variations.map(v => {
      if (v.id === variationIdentifier || v.variation_id === variationIdentifier) {
        return { ...v, dimensions: { ...(v.dimensions || {}), [dim]: value } };
      }
      return v;
    });
    onProductChange({ variations: updatedVariations });
  };
  
  const handleRemoveVariation = (variationId: string | number) => {
    if (!product.variations) return;
    const updatedVariations = product.variations.filter(v => (v.id !== variationId && v.variation_id !== variationId));
    onProductChange({ variations: updatedVariations });
  };

  const hasVariationAttributes = product.attributes.some(attr => attr.forVariations && attr.name && attr.value);

  if (!product.variations || product.variations.length === 0) {
    return (
       <div className="space-y-4">
            <Alert>
                <GitCommitHorizontal className="h-4 w-4" />
                <AlertTitle>Genera Variaciones Automáticamente</AlertTitle>
                <AlertDescription>
                    Define atributos, márcalos como "Para variaciones" y haz clic en el botón para crear todas las combinaciones posibles al instante.
                </AlertDescription>
            </Alert>
            <Button onClick={handleGenerateVariations} className="w-full" disabled={!hasVariationAttributes}>
                <Sparkles className="mr-2 h-4 w-4" />
                Generar Variaciones
            </Button>
             {!hasVariationAttributes && <p className="text-xs text-destructive text-center">Debes definir y marcar al menos un atributo para variaciones antes de poder generar combinaciones.</p>}
            <p className="text-sm text-muted-foreground text-center">O edita un producto existente para ver sus variaciones aquí.</p>
       </div>
    )
  }

  const primaryPhoto = images.find(p => p.isPrimary) || images[0];

  return (
    <div className="space-y-4">
      <Button onClick={handleGenerateVariations} className="w-full" variant="secondary" disabled={!hasVariationAttributes}>
            <Sparkles className="mr-2 h-4 w-4" />
            Volver a Generar Variaciones (Sobrescribir)
        </Button>
        {!hasVariationAttributes && <p className="text-xs text-destructive text-center">Debes definir y marcar al menos un atributo para variaciones antes de poder generar combinaciones.</p>}
      <Accordion type="single" collapsible className="w-full">
        {product.variations.map(variation => {
            const identifier = variation.variation_id || variation.id;
            const variationImage = images.find(p => String(p.id) === String(variation.image?.id));
            const displayImage = variationImage || primaryPhoto;
            
            return (
                <AccordionItem value={String(identifier)} key={identifier}>
                    <AccordionTrigger>
                    <div className="flex items-center gap-3 w-full">
                        {displayImage ? (
                            <Image src={displayImage.previewUrl} alt="Variación" width={40} height={40} className="rounded-md object-cover h-10 w-10"/>
                        ) : (
                           <div className="h-10 w-10 rounded-md bg-muted flex items-center justify-center flex-shrink-0">
                                <ImageIcon className="h-5 w-5 text-muted-foreground"/>
                           </div>
                        )}
                        <div className="flex flex-wrap gap-x-4 gap-y-1 text-left flex-1 min-w-0">
                          {variation.attributes.map(attr => (
                            <span key={attr.name} className="text-sm">
                              <span className="font-medium">{attr.name}:</span>
                              <span className="text-muted-foreground ml-1">{attr.option}</span>
                            </span>
                          ))}
                        </div>
                    </div>
                    </AccordionTrigger>
                    <AccordionContent className="space-y-4 pt-4">
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-2 gap-4">
                            <div>
                                <Label htmlFor={`price-${identifier}`}>Precio Regular</Label>
                                <Input id={`price-${identifier}`} type="number" value={variation.regularPrice || ''} onChange={(e) => handleVariationChange(identifier, 'regularPrice', e.target.value)} />
                            </div>
                            <div>
                                <Label htmlFor={`sale_price-${identifier}`}>Precio Oferta</Label>
                                <Input id={`sale_price-${identifier}`} type="number" value={variation.salePrice || ''} onChange={(e) => handleVariationChange(identifier, 'salePrice', e.target.value)} />
                            </div>
                            <div>
                                <Label htmlFor={`sku-${identifier}`}>SKU</Label>
                                <Input id={`sku-${identifier}`} value={variation.sku || ''} onChange={(e) => handleVariationChange(identifier, 'sku', e.target.value)} />
                            </div>
                            <div className="space-y-2">
                                <Label>Imagen de la Variación</Label>
                                <Select
                                    value={variation.image?.id?.toString() ?? "0"}
                                    onValueChange={(value) => {
                                        const imageId = value === "0" ? null : value.match(/^\d+$/) ? Number(value) : value;
                                        handleVariationChange(identifier, 'image', { id: imageId, toDelete: value === "0" });
                                    }}
                                >
                                    <SelectTrigger>
                                        <span className="flex items-center gap-2 truncate">
                                            {variation.image?.id && images.find(p => String(p.id) === String(variation.image!.id)) ? (
                                                <>
                                                    <Image src={images.find(p => String(p.id) === String(variation.image!.id))!.previewUrl} alt="preview" width={20} height={20} className="rounded-sm" />
                                                    <span className="truncate">{images.find(p => String(p.id) === String(variation.image!.id))!.name}</span>
                                                </>
                                            ) : (
                                                'Imagen principal por defecto'
                                            )}
                                        </span>
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="0">Usar imagen principal del producto</SelectItem>
                                        {images.map(photo => (
                                            <SelectItem key={photo.id} value={String(photo.id)}>
                                                <div className="flex items-center gap-2">
                                                    <Image src={photo.previewUrl} alt={photo.name} width={24} height={24} className="rounded-sm" />
                                                    <span className="truncate">{photo.name}</span>
                                                </div>
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>
                            <div className="space-y-2 md:col-span-2">
                                <Label>Inventario</Label>
                                    <div className="flex items-center gap-4">
                                    <div className="flex items-center space-x-2">
                                        <Checkbox id={`manage_stock-${identifier}`} checked={variation.manage_stock} onCheckedChange={(checked) => handleVariationChange(identifier, 'manage_stock', !!checked)} />
                                        <Label htmlFor={`manage_stock-${identifier}`} className="font-normal text-sm">Gestionar</Label>
                                    </div>
                                    <Input id={`stock-${identifier}`} type="number" value={variation.stockQuantity || ''} onChange={(e) => handleVariationChange(identifier, 'stockQuantity', e.target.value)} disabled={!variation.manage_stock} placeholder="Cantidad" />
                                    </div>
                            </div>
                             <div className="md:col-span-2 flex justify-end">
                                <Button variant="ghost" size="sm" className="text-destructive" onClick={() => handleRemoveVariation(identifier)}>
                                    <Trash2 className="h-4 w-4 mr-2"/>
                                    Eliminar Variación
                                </Button>
                            </div>
                        </div>
                    </AccordionContent>
                </AccordionItem>
            );
        })}
      </Accordion>
    </div>
  );
}
