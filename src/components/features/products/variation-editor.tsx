
"use client";

import React from 'react';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import type { ProductVariation } from '@/lib/types';
import type { ProductEditState } from '@/app/(app)/products/edit/[id]/page';

interface VariationEditorProps {
  product: ProductEditState;
  onProductChange: (product: Partial<ProductEditState>) => void;
}

export function VariationEditor({ product, onProductChange }: VariationEditorProps) {

  const handleVariationChange = (variationId: number, field: string, value: string | boolean) => {
    const updatedVariations = product.variations?.map(v => {
      if (v.variation_id === variationId) {
        return { ...v, [field]: value };
      }
      return v;
    });
    onProductChange({ variations: updatedVariations });
  };
  
  const handleDimensionChange = (variationId: number, dim: 'length' | 'width' | 'height', value: string) => {
    const updatedVariations = product.variations?.map(v => {
      if (v.variation_id === variationId) {
        return { ...v, dimensions: { ...(v.dimensions || {}), [dim]: value } };
      }
      return v;
    });
    onProductChange({ variations: updatedVariations });
  };

  if (!product.variations || product.variations.length === 0) {
    return <p className="text-sm text-muted-foreground">No hay variaciones para este producto. Genéralas a partir de los atributos.</p>;
  }

  return (
    <div className="space-y-4">
      <Accordion type="single" collapsible className="w-full">
        {product.variations.map(variation => (
          <AccordionItem value={String(variation.variation_id)} key={variation.variation_id}>
            <AccordionTrigger>
              <div className="flex flex-wrap gap-x-4 gap-y-1">
                {variation.attributes.map(attr => (
                  <span key={attr.name}>
                    <span className="font-medium">{attr.name}:</span>
                    <span className="text-muted-foreground ml-1">{attr.option}</span>
                  </span>
                ))}
              </div>
            </AccordionTrigger>
            <AccordionContent className="space-y-4 pt-4">
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-2 gap-4">
                    <div>
                        <Label htmlFor={`price-${variation.variation_id}`}>Precio Regular</Label>
                        <Input id={`price-${variation.variation_id}`} type="number" value={variation.regularPrice} onChange={(e) => handleVariationChange(variation.variation_id!, 'regularPrice', e.target.value)} />
                    </div>
                        <div>
                        <Label htmlFor={`sale_price-${variation.variation_id}`}>Precio Oferta</Label>
                        <Input id={`sale_price-${variation.variation_id}`} type="number" value={variation.salePrice} onChange={(e) => handleVariationChange(variation.variation_id!, 'salePrice', e.target.value)} />
                    </div>
                    <div>
                        <Label htmlFor={`sku-${variation.variation_id}`}>SKU</Label>
                        <Input id={`sku-${variation.variation_id}`} value={variation.sku} onChange={(e) => handleVariationChange(variation.variation_id!, 'sku', e.target.value)} />
                    </div>
                    <div className="space-y-2">
                        <Label>Inventario</Label>
                            <div className="flex items-center gap-4">
                            <div className="flex items-center space-x-2">
                                <Checkbox id={`manage_stock-${variation.variation_id}`} checked={variation.manage_stock} onCheckedChange={(checked) => handleVariationChange(variation.variation_id!, 'manage_stock', !!checked)} />
                                <Label htmlFor={`manage_stock-${variation.variation_id}`} className="font-normal text-sm">Gestionar</Label>
                            </div>
                            <Input id={`stock-${variation.variation_id}`} type="number" value={variation.stockQuantity} onChange={(e) => handleVariationChange(variation.variation_id!, 'stockQuantity', e.target.value)} disabled={!variation.manage_stock} placeholder="Cantidad" />
                            </div>
                    </div>
                </div>
            </AccordionContent>
          </AccordionItem>
        ))}
      </Accordion>
    </div>
  );
}
