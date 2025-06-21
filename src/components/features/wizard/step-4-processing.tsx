
"use client";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { ProductData } from "@/lib/types";
import { CheckCircle, Circle, Loader2, Server, UploadCloud, XCircle } from "lucide-react";
import Image from 'next/image';

interface Step4ProcessingProps {
  productData: ProductData;
  isProcessing: boolean;
}

export function Step4Processing({ productData, isProcessing }: Step4ProcessingProps) {
    const totalPhotos = productData.photos.length;
    const uploadedPhotos = productData.photos.filter(p => p.status === 'completed').length;
    const isUploading = productData.photos.some(p => p.status === 'uploading');
    const allUploadsDone = totalPhotos > 0 && uploadedPhotos === totalPhotos;

    const getStatusIcon = (status: 'pending' | 'in-progress' | 'success' | 'error' | boolean) => {
        if (status === 'success' || status === true) return <CheckCircle className="h-5 w-5 text-green-500" />;
        if (status === 'error') return <XCircle className="h-5 w-5 text-destructive" />;
        if (status === 'in-progress') return <Loader2 className="h-5 w-5 animate-spin text-primary" />;
        return <Circle className="h-5 w-5 text-muted-foreground" />;
    };

    return (
        <div className="space-y-8">
            <Card>
                <CardHeader>
                <CardTitle>Paso 4: Procesando Producto</CardTitle>
                <CardDescription>
                    {isProcessing ? "Estamos subiendo las imágenes y preparando todo para crear tu producto." : "Proceso finalizado."}
                </CardDescription>
                </CardHeader>
            </Card>

            <Card>
                <CardHeader>
                    <CardTitle>Registro del Proceso</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                    <div className="flex items-center space-x-3 p-3 rounded-md bg-muted/50">
                        {getStatusIcon(isUploading ? 'in-progress' : allUploadsDone)}
                        <div>
                            <p className="font-medium">Paso 1: Subida de Imágenes</p>
                            <p className="text-sm text-muted-foreground">
                                {isUploading ? `Subiendo ${totalPhotos} imágenes...` : allUploadsDone ? `Se subieron ${totalPhotos} imágenes con éxito.` : 'Esperando para iniciar la subida.'}
                            </p>
                        </div>
                    </div>
                    <div className="flex items-center space-x-3 p-3 rounded-md bg-muted/50">
                        {getStatusIcon(allUploadsDone ? (isProcessing ? 'in-progress' : 'success') : 'pending')}
                        <div>
                            <p className="font-medium">Paso 2: Creación en WooCommerce</p>
                            <p className="text-sm text-muted-foreground">
                                {allUploadsDone ? (isProcessing ? 'Enviando datos a WooCommerce...' : 'Producto creado con éxito.') : 'Esperando a que finalice la subida de imágenes.'}
                            </p>
                        </div>
                    </div>
                </CardContent>
            </Card>

            <Card>
                <CardHeader>
                    <CardTitle>Progreso de las Imágenes ({uploadedPhotos}/{totalPhotos})</CardTitle>
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

             {!isProcessing && allUploadsDone && (
                <Card>
                    <CardHeader>
                        <CardTitle>Siguientes Pasos</CardTitle>
                    </CardHeader>
                    <CardContent className="flex flex-wrap gap-4">
                        <Button onClick={() => window.location.reload()}>Crear otro producto</Button>
                        <Button variant="outline" disabled>Ver producto en WooCommerce (próximamente)</Button>
                    </CardContent>
                </Card>
            )}
        </div>
    );
}
