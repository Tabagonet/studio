
"use client";

import React from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { BlogPostData } from "@/lib/types";
import Image from "next/image";
import { Badge } from "@/components/ui/badge";
import { format } from 'date-fns';
import { es } from 'date-fns/locale';

export function Step2Preview({ postData }: { postData: BlogPostData }) {

    return (
        <div className="space-y-8">
            <Card>
                <CardHeader>
                    <CardTitle>Paso 2: Previsualización</CardTitle>
                    <CardDescription>Revisa que toda la información de la entrada sea correcta. Desde aquí puedes volver atrás para corregir o confirmar para crear las entradas en WordPress.</CardDescription>
                </CardHeader>
            </Card>

            <Card>
                <CardHeader>
                    {postData.featuredImage?.previewUrl && (
                        <div className="relative h-48 w-full mb-4 rounded-md overflow-hidden">
                            <Image 
                                src={postData.featuredImage.previewUrl} 
                                alt={postData.title || "Imagen destacada"}
                                fill
                                className="object-cover"
                                sizes="(max-width: 768px) 100vw, 50vw"
                            />
                        </div>
                    )}
                    <CardTitle className="text-3xl font-bold">{postData.title || "Entrada sin título"}</CardTitle>
                    <div className="text-sm text-muted-foreground flex flex-wrap gap-x-4 gap-y-1 pt-2">
                        <span>Autor: <strong>{postData.author?.name || "No asignado"}</strong></span>
                        <span>Fecha: <strong>{postData.publishDate ? format(postData.publishDate, "PPP", { locale: es }) : "Ahora"}</strong></span>
                    </div>
                </CardHeader>
                <CardContent className="prose prose-lg dark:prose-invert max-w-none" dangerouslySetInnerHTML={{ __html: postData.content || "<p>Contenido no disponible.</p>" }} />
                <CardFooter className="flex-col items-start gap-4">
                    <div>
                        <h4 className="font-semibold mb-2">Categoría</h4>
                        {postData.category ? <Badge>{postData.category.name}</Badge> : <span className="text-sm text-muted-foreground">Ninguna</span>}
                    </div>
                     <div>
                        <h4 className="font-semibold mb-2">Etiquetas</h4>
                        <div className="flex flex-wrap gap-2">
                            {postData.tags.split(',').map(k => k.trim()).filter(Boolean).map((keyword, index) => (
                                <Badge key={index} variant="secondary">{keyword}</Badge>
                            ))}
                        </div>
                    </div>
                     {postData.targetLanguages.length > 0 && (
                        <div>
                            <h4 className="font-semibold mb-2">Traducciones</h4>
                            <p className="text-sm text-muted-foreground">
                                Se creará una entrada adicional para cada uno de los siguientes idiomas: {postData.targetLanguages.join(', ')}.
                            </p>
                        </div>
                     )}
                </CardFooter>
            </Card>
        </div>
    );
}
