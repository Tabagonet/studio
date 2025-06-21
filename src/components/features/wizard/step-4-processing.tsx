
"use client";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { ProductData, WizardProcessingState } from "@/lib/types";
import { CheckCircle, Circle, Loader2, XCircle } from "lucide-react";
import Image from 'next/image';

interface Step4ProcessingProps {
  productData: ProductData;
  processingState: WizardProcessingState;
  progress: {
    images: number;
    product: number;
  };
}

export function Step4Processing({ productData, processingState, progress }: Step4ProcessingProps) {
    
    const getStatusIcon = (status: WizardProcessingState, task: 'images' | 'product') => {
      if (task === 'images') {
        if (status === 'uploading') return <Loader2 className="h-5 w-5 animate-spin text-primary" />;
        if (status === 'error' && progress.images < 100) return <XCircle className="h-5 w-5 text-destructive" />;
        if (status === 'creating' || status === 'finished') return <CheckCircle className="h-5 w-5 text-green-500" />;
      }
      if (task === 'product') {
        if (status === 'creating') return <Loader2 className="h-5 w-5 animate-spin text-primary" />;
        if (status === 'finished') return <CheckCircle className="h-5 w-5 text-green-500" />;
        if (status === 'error') return <XCircle className="h-5 w-5 text-destructive" />;
      }
      return <Circle className="h-5 w-5 text-muted-foreground" />;
    };

    const getTaskDescription = (status: WizardProcessingState, task: 'images' | 'product') => {
      if (task === 'images') {
        if (status === 'uploading') return `Subiendo ${productData.photos.length} imágenes... (${progress.images}%)`;
        if (status === 'error' && progress.images < 100) return "Error durante la subida.";
        if (status === 'creating' || status === 'finished') return `Se subieron ${productData.photos.length} imágenes con éxito.`;
        return 'Esperando para iniciar la subida.';
      }
      if (task === 'product') {
        if (status === 'creating') return 'Enviando datos a WooCommerce...';
        if (status === 'finished') return 'Producto creado con éxito.';
        if (status === 'error') return 'Error al crear el producto.';
        return 'Esperando a que finalice la subida de imágenes.';
      }
    };
    
    const getOverallDescription = () => {
        switch(processingState) {
            case 'uploading': return 'Estamos subiendo las imágenes a tu servidor...';
            case 'creating': return 'Las imágenes están listas. Creando el producto en WooCommerce.';
            case 'finished': return '¡Proceso completado con éxito!';
            case 'error': return 'Ocurrió un error. Revisa los detalles e inténtalo de nuevo.';
            default: return 'Iniciando proceso de creación.';
        }
    }


    return (
        <div className="space-y-8">
            <Card>
                <CardHeader>
                <CardTitle>Paso 4: Procesando Producto</CardTitle>
                <CardDescription>
                   {getOverallDescription()}
                </CardDescription>
                </CardHeader>
            </Card>

            <Card>
                <CardHeader>
                    <CardTitle>Registro del Proceso</CardTitle>
                </CardHeader>
                <CardContent className="space-y-6">
                    <div className="flex items-center space-x-3">
                        {getStatusIcon(processingState, 'images')}
                        <div className="flex-1">
                            <p className="font-medium">Paso 1: Subida de Imágenes</p>
                             <p className="text-sm text-muted-foreground">{getTaskDescription(processingState, 'images')}</p>
                            {(processingState === 'uploading') && <Progress value={progress.images} className="mt-1 h-2" />}
                        </div>
                    </div>
                    <div className="flex items-center space-x-3">
                        {getStatusIcon(processingState, 'product')}
                        <div className="flex-1">
                            <p className="font-medium">Paso 2: Creación en WooCommerce</p>
                             <p className="text-sm text-muted-foreground">{getTaskDescription(processingState, 'product')}</p>
                             {(processingState === 'creating' || processingState === 'finished') && <Progress value={progress.product} className="mt-1 h-2" />}
                        </div>
                    </div>
                </CardContent>
            </Card>

            <Card>
                <CardHeader>
                    <CardTitle>Detalle de las Imágenes</CardTitle>
                </CardHeader>
                <CardContent>
                    {productData.photos.length > 0 ? (
                        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                        {productData.photos.map((photo) => (
                            <div key={photo.id} className="relative border rounded-lg overflow-hidden shadow-sm aspect-square flex flex-col">
                                <Image
                                    src={photo.previewUrl}
                                    alt={`Vista previa de ${photo.name}`}
                                    width={200}
                                    height={200}
                                    className="w-full h-full object-cover flex-1"
                                />
                                <div className="p-2 bg-background/80 space-y-1 backdrop-blur-sm">
                                    <p className="text-xs font-medium truncate" title={photo.name}>{photo.name}</p>
                                    {photo.status === 'uploading' && (
                                        <>
                                            <Progress value={photo.progress} className="h-2" />
                                            <p className="text-xs text-center font-semibold">{photo.progress}%</p>
                                        </>
                                    )}
                                    {photo.status === 'completed' && <div className="flex items-center justify-center text-green-500"><CheckCircle className="h-4 w-4 mr-1" /> Completado</div>}
                                    {photo.status === 'error' && <div className="flex items-center justify-center text-destructive"><XCircle className="h-4 w-4 mr-1" /> Error</div>}
                                    {photo.status === 'pending' && <div className="flex items-center justify-center text-muted-foreground"><Circle className="h-4 w-4 mr-1" /> Pendiente</div>}
                                </div>
                            </div>
                        ))}
                        </div>
                    ) : (
                        <p className="text-muted-foreground text-center">No hay imágenes para procesar.</p>
                    )}
                </CardContent>
            </Card>
        </div>
    );
}
