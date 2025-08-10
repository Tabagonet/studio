// src/components/features/products/product-preview-card.tsx

"use client";

import React from 'react';
import Image from 'next/image';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import type { WooCommerceCategory } from '@/lib/types';
import type { ProductEditState } from './page';

interface ProductPreviewCardProps {
    product: ProductEditState | null;
    categories: WooCommerceCategory[];
}

export function ProductPreviewCard({ product, categories }: ProductPreviewCardProps) {
    console.log("[PREVIEW][AUDIT] Rendering ProductPreviewCard with product:", product);
    if (!product) return null;

    const primaryPhoto = product.images?.find(p => p.isPrimary && !p.toDelete) || product.images?.find(p => !p.toDelete);
    const previewImageUrl = primaryPhoto?.previewUrl || 'https://placehold.co/128x128.png';
    const categoryName = categories.find(c => c.id === product.category_id)?.name || product.categoryPath || 'Sin categoría';
    
    console.log("[PREVIEW][AUDIT] Primary photo found:", primaryPhoto);

    return (
        <Card className="sticky top-20">
            <CardHeader>
                <div className="aspect-square w-32 h-32 relative mx-auto rounded-md overflow-hidden border">
                   <Image src={previewImageUrl} alt={product.name || 'Vista previa del producto'} fill sizes="128px" className="object-cover" />
                </div>
            </CardHeader>
            <CardContent className="text-center space-y-2">
                <CardTitle className="text-base leading-tight">{product.name || "Nombre del Producto"}</CardTitle>
                <p className="text-sm">
                    <span className={cn("font-bold text-xl", product.sale_price && "line-through text-muted-foreground text-base")}>
                    {product.regular_price ? `${product.regular_price}€` : "N/A"}
                    </span>
                    {product.sale_price && <span className="ml-2 font-bold text-xl text-primary">{`${product.sale_price}€`}</span>}
                </p>
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
                    <div className="prose prose-xs max-w-none [&_p]:my-1" dangerouslySetInnerHTML={{ __html: product.short_description || "..." }} />
                </div>
            </CardContent>
        </Card>
    );
}
