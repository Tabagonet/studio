// src/components/features/wizard/variable-product-manager.tsx

"use client";

import React from 'react';
import { v4 as uuidv4 } from 'uuid';
import { Button } from '@/components/ui/button';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { useToast } from '@/hooks/use-toast';
import { ProductData, ProductVariation } from '@/lib/types';
import { GitCommitHorizontal, Sparkles } from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Checkbox } from '@/components/ui/checkbox';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select';

interface VariableProductManagerProps {
  productData: ProductData;
  updateProductData: (data: Partial<ProductData>) => void;
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


export function VariableProductManager({ productData, updateProductData }: VariableProductManagerProps) {
    const { toast } = useToast();

    const handleGenerateVariations = () => {
        const variationAttributes = productData.attributes.filter(
            attr => attr.forVariations && attr.name.trim() && attr.value.trim()
        );

        if (variationAttributes.length === 0) {
            toast({
                title: "No hay atributos para variaciones",
                description: "Por favor, marca al menos un atributo con valores como 'Para variaciones'.",
                variant: "destructive",
            });
            return;
        }

        const attributeNames = variationAttributes.map(attr => attr.name);
        const attributeValueSets = variationAttributes.map(attr =>
            attr.value.split('|').map(v => v.trim()).filter(v => v)
        );
        
        if (attributeValueSets.some(set => set.length === 0)) {
             toast({
                title: "Valores de atributo vacíos",
                description: "Asegúrate de que cada atributo para variación tiene valores separados por '|'.",
                variant: "destructive",
            });
            return;
        }

        const combinations = cartesian(...attributeValueSets);

        const newVariations: ProductVariation[] = combinations.map(combo => {
            const attributes = combo.map((value, index) => ({
                name: attributeNames[index],
                option: value,
            }));
            const skuSuffix = attributes.map(a => a.option.substring(0,3).toUpperCase()).join('-');
            return {
                id: uuidv4(),
                attributes,
                sku: `${productData.sku || 'SKU'}-${skuSuffix}`,
                regularPrice: productData.regularPrice || '',
                salePrice: productData.salePrice || '',
                manage_stock: productData.manage_stock,
                stockQuantity: productData.stockQuantity || '',
                weight: productData.weight || '',
                dimensions: productData.dimensions || { length: '', width: '', height: '' },
                shipping_class: productData.shipping_class || '',
                image: { id: null },
            };
        });
        
        updateProductData({ variations: newVariations });

        toast({
            title: `¡${newVariations.length} variaciones generadas!`,
            description: "Ahora puedes editar los precios y SKUs para cada una.",
        });
    };

    const handleVariationChange = (variationId: string, field: keyof Omit<ProductVariation, 'dimensions'>, value: string | boolean | object | null) => {
        const updatedVariations = productData.variations?.map(v => {
            if (v.id === variationId) {
                return { ...v, [field]: value };
            }
            return v;
        });
        updateProductData({ variations: updatedVariations });
    };

    const handleDimensionChange = (variationId: string, dim: 'length' | 'width' | 'height', value: string) => {
         const updatedVariations = productData.variations?.map(v => {
            if (v.id === variationId) {
                return { ...v, dimensions: { ...(v.dimensions || {}), [dim]: value } as any };
            }
            return v;
        });
        updateProductData({ variations: updatedVariations });
    };

    return (
        <div className="space-y-6">
            <h3 className="text-lg font-medium">Gestión de Variaciones</h3>
            <p className="text-sm text-muted-foreground -mt-5">Genera y edita las variaciones de tu producto a partir de los atributos marcados.</p>
            
            <Alert>
                <GitCommitHorizontal className="h-4 w-4" />
                <AlertTitle>¿Cómo funciona?</AlertTitle>
                <AlertDescription>
                    <ol className="list-decimal list-inside space-y-1">
                        <li>Define atributos (ej. Color, Talla) en la sección de arriba.</li>
                        <li>Marca la casilla "Para variaciones" en los que quieras usar.</li>
                        <li>Haz clic en "Generar Variaciones" para crear todas las combinaciones.</li>
                        <li>Edita el SKU, precio y stock de cada variación generada.</li>
                    </ol>
                </AlertDescription>
            </Alert>

            <Button onClick={handleGenerateVariations} className="w-full">
                <Sparkles className="mr-2 h-4 w-4" />
                Generar Variaciones de los atributos
            </Button>

            {productData.variations && productData.variations.length > 0 && (
                <div className="space-y-4">
                    <h3 className="text-base font-semibold">Variaciones Creadas ({productData.variations.length})</h3>
                    <Accordion type="single" collapsible className="w-full">
                        {productData.variations.map(variation => (
                            <AccordionItem value={variation.id} key={variation.id}>
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
                                            <Label htmlFor={`price-${variation.id}`}>Precio Regular</Label>
                                            <Input id={`price-${variation.id}`} type="number" value={variation.regularPrice} onChange={(e) => handleVariationChange(variation.id, 'regularPrice', e.target.value)} />
                                        </div>
                                            <div>
                                            <Label htmlFor={`sale_price-${variation.id}`}>Precio Oferta</Label>
                                            <Input id={`sale_price-${variation.id}`} type="number" value={variation.salePrice} onChange={(e) => handleVariationChange(variation.id, 'salePrice', e.target.value)} />
                                        </div>
                                        <div>
                                            <Label htmlFor={`sku-${variation.id}`}>SKU</Label>
                                            <Input id={`sku-${variation.id}`} value={variation.sku} onChange={(e) => handleVariationChange(variation.id, 'sku', e.target.value)} />
                                        </div>
                                        <div className="space-y-2">
                                            <Label>Imagen</Label>
                                            <Select
                                                value={variation.image?.id?.toString() ?? '0'}
                                                onValueChange={(value) => {
                                                    const imageId = value === '0' ? null : Number(value);
                                                    handleVariationChange(variation.id, 'image', { id: imageId });
                                                }}
                                            >
                                                <SelectTrigger><SelectValue placeholder="Usar imagen principal..." /></SelectTrigger>
                                                <SelectContent>
                                                    <SelectItem value="0">Usar imagen principal</SelectItem>
                                                    {productData.photos.map(photo => (
                                                        <SelectItem key={photo.id} value={String(photo.id)}>{photo.name}</SelectItem>
                                                    ))}
                                                </SelectContent>
                                            </Select>
                                        </div>
                                        <div className="space-y-2 md:col-span-2">
                                            <Label>Inventario</Label>
                                                <div className="flex items-center gap-4">
                                                <div className="flex items-center space-x-2">
                                                    <Checkbox id={`manage_stock-${variation.id}`} checked={variation.manage_stock} onCheckedChange={(checked) => handleVariationChange(variation.id, 'manage_stock', !!checked)} />
                                                    <Label htmlFor={`manage_stock-${variation.id}`} className="font-normal text-sm">Gestionar</Label>
                                                </div>
                                                <Input id={`stock-${variation.id}`} type="number" value={variation.stockQuantity} onChange={(e) => handleVariationChange(variation.id, 'stockQuantity', e.target.value)} disabled={!variation.manage_stock} placeholder="Cantidad" />
                                                </div>
                                        </div>
                                    </div>
                                    <div className="pt-4 mt-4 border-t">
                                        <h4 className="text-sm font-medium mb-2">Envío (por variación)</h4>
                                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                                            <div>
                                                <Label htmlFor={`weight-${variation.id}`}>Peso (kg)</Label>
                                                <Input id={`weight-${variation.id}`} type="number" value={variation.weight} onChange={(e) => handleVariationChange(variation.id, 'weight', e.target.value)} />
                                            </div>
                                            <div>
                                                <Label htmlFor={`length-${variation.id}`}>Largo (cm)</Label>
                                                <Input id={`length-${variation.id}`} type="number" value={variation.dimensions?.length} onChange={(e) => handleDimensionChange(variation.id, 'length', e.target.value)} />
                                            </div>
                                            <div>
                                                <Label htmlFor={`width-${variation.id}`}>Ancho (cm)</Label>
                                                <Input id={`width-${variation.id}`} type="number" value={variation.dimensions?.width} onChange={(e) => handleDimensionChange(variation.id, 'width', e.target.value)} />
                                            </div>
                                            <div>
                                                <Label htmlFor={`height-${variation.id}`}>Alto (cm)</Label>
                                                <Input id={`height-${variation.id}`} type="number" value={variation.dimensions?.height} onChange={(e) => handleDimensionChange(variation.id, 'height', e.target.value)} />
                                            </div>
                                        </div>
                                        <div className="mt-4">
                                            <Label htmlFor={`shipping_class-${variation.id}`}>Clase de envío</Label>
                                            <Input id={`shipping_class-${variation.id}`} value={variation.shipping_class} onChange={(e) => handleVariationChange(variation.id, 'shipping_class', e.target.value)} placeholder="Slug de la clase"/>
                                        </div>
                                    </div>
                                </AccordionContent>
                            </AccordionItem>
                        ))}
                    </Accordion>
                </div>
            )}
        </div>
    );
}
