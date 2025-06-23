
"use client";

import React from 'react';
import { v4 as uuidv4 } from 'uuid';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { useToast } from '@/hooks/use-toast';
import { ProductData, ProductVariation } from '@/lib/types';
import { GitCommitHorizontal, Sparkles } from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';

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
                value: value,
            }));
            const skuSuffix = attributes.map(a => a.value.substring(0,3).toUpperCase()).join('-');
            return {
                id: uuidv4(),
                attributes,
                sku: `${productData.sku || 'SKU'}-${skuSuffix}`,
                regularPrice: productData.regularPrice || '',
                salePrice: productData.salePrice || '',
            };
        });
        
        updateProductData({ variations: newVariations });

        toast({
            title: `¡${newVariations.length} variaciones generadas!`,
            description: "Ahora puedes editar los precios y SKUs para cada una.",
        });
    };

    const handleVariationChange = (variationId: string, field: keyof ProductVariation, value: string) => {
        const updatedVariations = productData.variations?.map(v => {
            if (v.id === variationId) {
                return { ...v, [field]: value };
            }
            return v;
        });
        updateProductData({ variations: updatedVariations });
    };

    return (
        <Card>
            <CardHeader>
                <CardTitle>Gestión de Variaciones</CardTitle>
                <CardDescription>Genera y edita las variaciones de tu producto.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
                <Alert>
                    <GitCommitHorizontal className="h-4 w-4" />
                    <AlertTitle>¿Cómo funciona?</AlertTitle>
                    <AlertDescription>
                        <ol className="list-decimal list-inside space-y-1">
                            <li>Define atributos (ej. Color, Talla) en la sección de arriba.</li>
                            <li>Marca la casilla "Para variaciones" en los que quieras usar.</li>
                            <li>Haz clic en "Generar Variaciones" para crear todas las combinaciones.</li>
                            <li>Edita el SKU y precio de cada variación generada.</li>
                        </ol>
                    </AlertDescription>
                </Alert>

                <Button onClick={handleGenerateVariations} className="w-full">
                    <Sparkles className="mr-2 h-4 w-4" />
                    Generar Variaciones de los atributos
                </Button>

                {productData.variations && productData.variations.length > 0 && (
                    <div className="space-y-4">
                        <h3 className="text-lg font-semibold">Variaciones Creadas ({productData.variations.length})</h3>
                        <Accordion type="single" collapsible className="w-full">
                            {productData.variations.map(variation => (
                                <AccordionItem value={variation.id} key={variation.id}>
                                    <AccordionTrigger>
                                        <div className="flex flex-wrap gap-x-4 gap-y-1">
                                             {variation.attributes.map(attr => (
                                                 <span key={attr.name}>
                                                    <span className="font-medium">{attr.name}:</span>
                                                    <span className="text-muted-foreground ml-1">{attr.value}</span>
                                                 </span>
                                             ))}
                                        </div>
                                    </AccordionTrigger>
                                    <AccordionContent className="space-y-4 p-4">
                                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                            <div>
                                                <Label htmlFor={`sku-${variation.id}`}>SKU de la Variación</Label>
                                                <Input 
                                                    id={`sku-${variation.id}`}
                                                    value={variation.sku}
                                                    onChange={(e) => handleVariationChange(variation.id, 'sku', e.target.value)}
                                                    placeholder="SKU único"
                                                />
                                            </div>
                                             <div>
                                                <Label htmlFor={`price-${variation.id}`}>Precio Regular</Label>
                                                <Input 
                                                    id={`price-${variation.id}`}
                                                    type="number"
                                                    value={variation.regularPrice}
                                                    onChange={(e) => handleVariationChange(variation.id, 'regularPrice', e.target.value)}
                                                    placeholder="Ej: 24.99"
                                                />
                                            </div>
                                             <div>
                                                <Label htmlFor={`sale_price-${variation.id}`}>Precio de Oferta</Label>
                                                <Input 
                                                    id={`sale_price-${variation.id}`}
                                                    type="number"
                                                    value={variation.salePrice}
                                                    onChange={(e) => handleVariationChange(variation.id, 'salePrice', e.target.value)}
                                                    placeholder="Opcional"
                                                />
                                            </div>
                                        </div>
                                    </AccordionContent>
                                </AccordionItem>
                            ))}
                        </Accordion>
                    </div>
                )}
            </CardContent>
        </Card>
    );
}
