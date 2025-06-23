"use client";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { WizardProcessingState } from "@/lib/types";
import { CheckCircle, Circle, Loader2, XCircle } from "lucide-react";

interface Step4ProcessingProps {
  processingState: WizardProcessingState;
  progress: {
    images: number;
    product: number;
  };
}

export function Step4Processing({ processingState, progress }: Step4ProcessingProps) {
    
    const getOverallDescription = () => {
        switch(processingState) {
            case 'processing': return 'Estamos procesando tu producto. Esto puede tardar unos segundos...';
            case 'finished': return '¡Proceso completado con éxito!';
            case 'error': return 'Ocurrió un error. Revisa los detalles e inténtalo de nuevo.';
            default: return 'Iniciando proceso de creación...';
        }
    }

    const getTaskIcon = (task: 'images' | 'product') => {
        if (processingState === 'finished') {
            return <CheckCircle className="h-5 w-5 text-green-500" />;
        }
        if (processingState === 'error') {
            // If image processing failed, product step is also considered failed/not started
            if (task === 'images' && progress.images < 100) return <XCircle className="h-5 w-5 text-destructive" />;
            if (task === 'product' && progress.images < 100) return <Circle className="h-5 w-5 text-muted-foreground" />;

             // If product creation failed after image success
            if (task === 'images') return <CheckCircle className="h-5 w-5 text-green-500" />;
            if (task === 'product') return <XCircle className="h-5 w-5 text-destructive" />;
        }
        if (processingState === 'processing') {
            if (task === 'images') {
                return progress.images < 100 ? <Loader2 className="h-5 w-5 animate-spin text-primary" /> : <CheckCircle className="h-5 w-5 text-green-500" />;
            }
            if (task === 'product') {
                return progress.images < 100 ? <Circle className="h-5 w-5 text-muted-foreground" /> : <Loader2 className="h-5 w-5 animate-spin text-primary" />;
            }
        }
        return <Circle className="h-5 w-5 text-muted-foreground" />;
    };

    const getTaskDescription = (task: 'images' | 'product') => {
        if (processingState === 'finished') {
            return task === 'images' ? 'Imágenes procesadas y subidas.' : 'Producto creado en WooCommerce.';
        }
        if (processingState === 'error') {
             if (task === 'images' && progress.images < 100) return 'Error durante el procesamiento de imágenes.';
             if (task === 'product' && progress.images < 100) return 'No iniciado.';
             if (task === 'images') return 'Imágenes procesadas y subidas.';
             if (task === 'product') return 'Error al crear el producto en WooCommerce.';
        }
        if (processingState === 'processing') {
            if (task === 'images') {
                return progress.images < 100 ? `Procesando y subiendo imágenes... (${progress.images}%)` : 'Imágenes listas.';
            }
            if (task === 'product') {
                return progress.images < 100 ? 'Esperando a las imágenes...' : `Creando producto en WooCommerce... (${progress.product}%)`;
            }
        }
        return 'Pendiente...';
    };

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
                        {getTaskIcon('images')}
                        <div className="flex-1">
                            <p className="font-medium">Paso 1: Procesar y Subir Imágenes</p>
                            <p className="text-sm text-muted-foreground">{getTaskDescription('images')}</p>
                            {(processingState === 'processing' && progress.images < 100) && <Progress value={progress.images} className="mt-1 h-2" />}
                        </div>
                    </div>
                    <div className="flex items-center space-x-3">
                        {getTaskIcon('product')}
                        <div className="flex-1">
                            <p className="font-medium">Paso 2: Crear Producto en WooCommerce</p>
                            <p className="text-sm text-muted-foreground">{getTaskDescription('product')}</p>
                            {(processingState === 'processing' && progress.images === 100 && progress.product < 100) && <Progress value={progress.product} className="mt-1 h-2" />}
                        </div>
                    </div>
                </CardContent>
            </Card>
        </div>
    );
}
