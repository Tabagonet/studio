
"use client";

import React from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Loader2, CheckCircle, ExternalLink, Rocket } from "lucide-react";
import Link from 'next/link';

interface Step3ResultsProps {
    isCreating: boolean;
    createdPosts: { url: string; title: string }[];
    onStartOver: () => void;
}

export function Step3Results({ isCreating, createdPosts, onStartOver }: Step3ResultsProps) {
    if (isCreating) {
        return (
            <Card>
                <CardHeader className="text-center items-center">
                    <Loader2 className="mx-auto h-12 w-12 animate-spin text-primary" />
                    <CardTitle className="mt-4">Creando Entradas...</CardTitle>
                    <CardDescription>Estamos guardando tus entradas en WordPress. Por favor, espera.</CardDescription>
                </CardHeader>
            </Card>
        );
    }

    if (createdPosts.length > 0) {
        return (
            <Card>
                <CardHeader className="text-center items-center">
                    <CheckCircle className="mx-auto h-12 w-12 text-green-500" />
                    <CardTitle className="mt-4">¡Entradas Creadas con Éxito!</CardTitle>
                    <CardDescription>
                        Se han guardado como borrador en WordPress. Para enlazarlas, usa el campo personalizado <code className="bg-muted px-1 py-0.5 rounded">translation_group_id</code> en tu plugin de idiomas.
                    </CardDescription>
                </CardHeader>
                <CardContent className="flex flex-col items-center justify-center gap-4">
                     <div className="space-y-2 text-center">
                        {createdPosts.map(post => (
                             <Button variant="link" asChild key={post.url}>
                                <Link href={post.url} target="_blank" rel="noopener noreferrer">
                                   <ExternalLink className="mr-2 h-4 w-4" /> Ver "{post.title}"
                                </Link>
                            </Button>
                        ))}
                    </div>
                     <Button onClick={onStartOver}>
                        <Rocket className="mr-2 h-4 w-4" /> Crear otra entrada
                    </Button>
                </CardContent>
            </Card>
        );
    }
    
    // Fallback for error case (isCreating is false but no posts were created)
    return (
         <Card>
            <CardHeader className="text-center items-center">
                <CheckCircle className="mx-auto h-12 w-12 text-destructive" />
                <CardTitle className="mt-4">Ocurrió un Error</CardTitle>
                <CardDescription>
                    No se pudieron crear las entradas. Por favor, revisa la consola para ver los detalles del error e inténtalo de nuevo.
                </CardDescription>
            </CardHeader>
            <CardContent className="flex justify-center">
                <Button onClick={onStartOver}>
                    <Rocket className="mr-2 h-4 w-4" /> Volver a Empezar
                </Button>
            </CardContent>
        </Card>
    );
}
