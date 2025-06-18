"use client";

import React from 'react';
import type { ProductData } from '@/lib/types';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from '@/components/ui/button';
import { CheckCircle, Loader2 } from 'lucide-react';
import Image from 'next/image';

interface Step3ConfirmProps {
  productData: ProductData;
  isProcessing: boolean;
}

export function Step3Confirm({ productData, isProcessing }: Step3ConfirmProps) {
  const primaryPhoto = productData.photos.find(p => p.isPrimary) || productData.photos[0];

  return (
    <div className="space-y-6">
      <Card className="shadow-lg">
        <CardHeader className="bg-green-50 dark:bg-green-900/30 rounded-t-lg">
          <div className="flex items-center space-x-3">
            <CheckCircle className="h-8 w-8 text-green-600 dark:text-green-400" />
            <div>
              <CardTitle className="text-xl font-semibold text-green-700 dark:text-green-300">Confirmación Final</CardTitle>
              <CardDescription className="text-green-600 dark:text-green-400">
                Revisa los detalles del producto. Una vez confirmado, el producto se creará en segundo plano.
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-6 space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="md:col-span-1">
              {primaryPhoto && (
                <div className="aspect-square relative rounded-md border overflow-hidden shadow-md">
                  <Image src={primaryPhoto.previewUrl} alt={productData.name} layout="fill" objectFit="cover" />
                </div>
              )}
            </div>
            <div className="md:col-span-2 space-y-3">
              <div>
                <h3 className="text-lg font-semibold text-foreground">{productData.name}</h3>
                <p className="text-sm text-muted-foreground">SKU: {productData.sku || "No especificado"}</p>
              </div>
              <div>
                <p className="text-sm">
                  <span className="font-medium">Precio:</span> €{productData.regularPrice}
                  {productData.salePrice && <span className="ml-2 line-through text-muted-foreground">€{productData.salePrice}</span>}
                </p>
                <p className="text-sm"><span className="font-medium">Categoría:</span> {productData.category || "No especificada"}</p>
              </div>
               <div>
                <p className="text-sm font-medium">Atributos:</p>
                {productData.attributes.length > 0 ? (
                    <ul className="list-disc list-inside text-sm text-muted-foreground pl-2">
                    {productData.attributes.map((attr, i) => attr.name && attr.value ? <li key={i}>{attr.name}: {attr.value}</li> : null)}
                    </ul>
                ) : (
                    <p className="text-sm text-muted-foreground">Sin atributos adicionales.</p>
                )}
              </div>
              <p className="text-sm"><span className="font-medium">Imágenes a procesar:</span> {productData.photos.length}</p>
            </div>
          </div>
          
          <div className="pt-4 border-t">
             <h4 className="text-md font-semibold mb-2">Resumen de Procesamiento:</h4>
             <ul className="list-disc list-inside text-sm text-muted-foreground space-y-1 pl-4">
                <li>Las imágenes se convertirán a WebP y optimizarán.</li>
                <li>Se generarán nombres SEO para imágenes y producto.</li>
                <li>Se crearán descripciones y metadatos SEO basados en plantillas (si están configuradas).</li>
                <li>El producto se publicará o guardará como borrador en WooCommerce.</li>
             </ul>
          </div>
        </CardContent>
      </Card>

      {isProcessing && (
        <div className="flex items-center justify-center p-4 bg-muted rounded-md">
          <Loader2 className="mr-2 h-5 w-5 animate-spin text-primary" />
          <p className="text-foreground">Procesando producto, por favor espera...</p>
        </div>
      )}
      <p className="text-xs text-center text-muted-foreground">
        Al hacer clic en "Confirmar y Crear Producto", aceptas que la información es correcta y el proceso comenzará.
        Recibirás una notificación cuando el producto haya sido creado.
      </p>
    </div>
  );
}
