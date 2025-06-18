
"use client";

import React from 'react';
import type { ProductData, ProductAttribute, ProductType } from '@/lib/types';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import Image from 'next/image';
import { ScrollArea } from '@/components/ui/scroll-area';
import { PRODUCT_TYPES } from '@/lib/constants'; // Importar para obtener la etiqueta

interface Step2PreviewProps {
  productData: ProductData;
  updateProductData: (data: Partial<ProductData>) => void; // Allow editing in preview
}

// Helper for inline editing
const EditableField: React.FC<{label: string, value: string | undefined, name: string, onChange: (name: string, value: string) => void, type?: 'input' | 'textarea', readOnly?: boolean}> =
  ({label, value, name, onChange, type = 'input', readOnly = false}) => (
  <div>
    <Label htmlFor={`preview-${name}`} className="text-sm font-medium">{label}</Label>
    {type === 'input' ? (
      <Input id={`preview-${name}`} value={value || ''} onChange={(e) => onChange(name, e.target.value)} className="mt-1" readOnly={readOnly} />
    ) : (
      <Textarea id={`preview-${name}`} value={value || ''} onChange={(e) => onChange(name, e.target.value)} className="mt-1" rows={3} readOnly={readOnly}/>
    )}
  </div>
);


export function Step2Preview({ productData, updateProductData }: Step2PreviewProps) {

  const handleFieldChange = (fieldName: string, fieldValue: string) => {
    updateProductData({ [fieldName]: fieldValue });
  };

  const handleAttributeChange = (index: number, field: keyof ProductAttribute, value: string) => {
    const newAttributes = [...productData.attributes];
    newAttributes[index] = { ...newAttributes[index], [field]: value };
    updateProductData({ attributes: newAttributes });
  };


  const primaryPhoto = productData.photos.find(p => p.isPrimary) || productData.photos[0];
  const galleryPhotos = productData.photos.filter(p => !(p.isPrimary) && p !== primaryPhoto);

  const generatedShortDescription = productData.shortDescription || `Descripción corta generada para ${productData.name} basada en ${productData.keywords}.`;
  const generatedLongDescription = productData.longDescription || `Descripción extensa y detallada para ${productData.name}, categoría ${productData.category}, con palabras clave: ${productData.keywords}. Ideal para SEO.`;

  const productTypeLabel = PRODUCT_TYPES.find(pt => pt.value === productData.productType)?.label || productData.productType;

  return (
    <div className="space-y-8">
      <Card>
        <CardHeader>
          <CardTitle>Vista Previa del Producto</CardTitle>
          <CardDescription>Revisa y edita la información del producto antes de crearlo. Los campos con (*) serán generados automáticamente si se dejan vacíos.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-4">
              <EditableField label="Nombre del Producto" name="name" value={productData.name} onChange={handleFieldChange} />
              <EditableField label="SKU" name="sku" value={productData.sku} onChange={handleFieldChange} />
               <div>
                <Label className="text-sm font-medium">Tipo de Producto</Label>
                <Input value={productTypeLabel} readOnly className="mt-1 bg-muted/50" />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <EditableField label="Precio Regular (€)" name="regularPrice" value={productData.regularPrice} onChange={handleFieldChange} />
                <EditableField label="Precio de Oferta (€)" name="salePrice" value={productData.salePrice} onChange={handleFieldChange} />
              </div>
              <EditableField label="Categoría" name="category" value={productData.category} onChange={handleFieldChange} />
              <EditableField label="Palabras Clave" name="keywords" value={productData.keywords} onChange={handleFieldChange} />
            </div>

            <div className="space-y-4">
              {primaryPhoto && (
                <div>
                  <Label>Imagen Principal</Label>
                  <div className="mt-1 w-full aspect-square relative rounded-md border overflow-hidden">
                    <Image
                        src={primaryPhoto.previewUrl}
                        alt={primaryPhoto.name}
                        layout="fill"
                        objectFit="cover"
                        unoptimized={true}
                        data-ai-hint="product photo"
                    />
                  </div>
                  {/* SEO Alt para imagen principal se generará en backend */}
                </div>
              )}
            </div>
          </div>

          <div>
             <h3 className="text-lg font-semibold mb-2">Atributos</h3>
             {productData.attributes.length > 0 ? (
                <div className="space-y-2">
                {productData.attributes.map((attr, index) => (
                    <div key={index} className="flex items-center gap-2 p-2 border rounded-md">
                    <Input value={attr.name} onChange={(e) => handleAttributeChange(index, 'name', e.target.value)} placeholder="Nombre Atributo" className="flex-1"/>
                    <Input value={attr.value} onChange={(e) => handleAttributeChange(index, 'value', e.target.value)} placeholder="Valor Atributo" className="flex-1"/>
                    </div>
                ))}
                </div>
             ) : (
                <p className="text-sm text-muted-foreground">No se han añadido atributos.</p>
             )}
          </div>

          <div className="space-y-2">
            <EditableField label="Descripción Corta (SEO)*" name="shortDescription" value={generatedShortDescription} onChange={handleFieldChange} type="textarea" />
            <EditableField label="Descripción Larga (SEO)*" name="longDescription" value={generatedLongDescription} onChange={handleFieldChange} type="textarea" />
          </div>

          {galleryPhotos.length > 0 && (
            <div>
              <h3 className="text-lg font-semibold mb-2">Galería de Imágenes</h3>
              <ScrollArea className="h-48 w-full">
                <div className="flex space-x-4 p-1">
                  {galleryPhotos.map(photo => (
                    <div key={photo.id} className="flex-shrink-0 w-32 h-32 relative rounded-md border overflow-hidden">
                       <Image
                        src={photo.previewUrl}
                        alt={photo.name}
                        layout="fill"
                        objectFit="cover"
                        unoptimized={true}
                        data-ai-hint="product photo"
                       />
                    </div>
                  ))}
                </div>
              </ScrollArea>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Placeholder for Store Preview */}
      <Card>
        <CardHeader>
            <CardTitle>Vista Previa en Tienda (Simulada)</CardTitle>
            <CardDescription>Así es como se podría ver tu producto en la tienda.</CardDescription>
        </CardHeader>
        <CardContent className="border rounded-lg p-6 bg-muted/20 min-h-[300px] flex items-center justify-center">
            <div className="text-center">
                 <Image src="https://placehold.co/150x150.png" alt="Placeholder tienda" width={150} height={150} className="mx-auto mb-4 rounded opacity-50" data-ai-hint="store preview" />
                <p className="text-muted-foreground">La vista previa simulada de la tienda aparecerá aquí.</p>
                <p className="text-xs text-muted-foreground mt-1">(Esto es una representación y puede variar según el tema de tu tienda)</p>
            </div>
        </CardContent>
      </Card>
    </div>
  );
}
