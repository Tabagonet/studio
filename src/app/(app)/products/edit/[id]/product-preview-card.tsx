
// src/components/features/products/product-preview-card.tsx

"use client";

import React from 'react';
import Image from 'next/image';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import type { WooCommerceCategory, ProductData } from '@/lib/types';

interface ProductPreviewCardProps {
    product: ProductData | null;
    categories: WooCommerceCategory[];
}

export function ProductPreviewCard({ product, categories }: ProductPreviewCardProps) {
    if (!product) return null;

    const primaryPhoto = product.photos?.find(p => p.isPrimary && !p.toDelete) || product.photos?.find(p => !p.toDelete);
    const previewImageUrl = primaryPhoto?.previewUrl || 'https://placehold.co/128x128.png';
    const categoryName = categories.find(c => c.id === product.category_id)?.name || product.categoryPath || 'Sin categoría';

    const renderPrice = () => {
        if (product.productType === 'variable') {
             const prices = (product.variations || [])
                .map(v => parseFloat(v.regularPrice || ''))
                .filter(p => !isNaN(p) && p > 0);
            
             if (prices.length === 0) {
                const parentPrice = parseFloat(product.regularPrice);
                if (!isNaN(parentPrice) && parentPrice > 0) {
                    return `${parentPrice.toFixed(2)}€`;
                }
                return "N/A";
            }
            
            const minPrice = Math.min(...prices);
            const maxPrice = Math.max(...prices);

            if (minPrice === maxPrice) {
                return `${minPrice.toFixed(2)}€`;
            } else {
                return `${minPrice.toFixed(2)}€ - ${maxPrice.toFixed(2)}€`;
            }
        }
        
        // Fallback for simple products
        return (
            <>
                <span className={cn("font-bold text-xl", product.salePrice && "line-through text-muted-foreground text-base")}>
                {product.regularPrice ? `${product.regularPrice}€` : "N/A"}
                </span>
                {product.salePrice && <span className="ml-2 font-bold text-xl text-primary">{`${product.salePrice}€`}</span>}
            </>
        );
    }

    return (
        <Card className="sticky top-20">
            <CardHeader>
                <div className="aspect-square w-32 h-32 relative mx-auto rounded-md overflow-hidden border">
                   <Image src={previewImageUrl} alt={product.name || 'Vista previa del producto'} fill sizes="128px" className="object-cover" />
                </div>
            </CardHeader>
            <CardContent className="text-center space-y-2">
                <CardTitle className="text-base leading-tight">{product.name || "Nombre del Producto"}</CardTitle>
                <div className="text-sm h-12 flex items-center justify-center">
                    {renderPrice()}
                </div>
                <div className="text-xs space-x-1">
                    <Badge variant="outline">{product.status}</Badge>
                    <Badge variant="secondary">{categoryName}</Badge>
                </div>
                 {product.tags && product.tags.length > 0 && (
                    <div className="flex flex-wrap gap-1 justify-center pt-2">
                        {product.tags.map((keyword, index) => (
                            <Badge key={index} variant="outline" className="text-xs font-normal">{keyword}</Badge>
                        ))}
                    </div>
                )}
                 <div className="text-xs text-muted-foreground pt-3 border-t text-left">
                    <div className="prose prose-xs max-w-none [&_p]:my-1" dangerouslySetInnerHTML={{ __html: product.shortDescription || "..." }} />
                </div>
            </CardContent>
        </Card>
    );
}
