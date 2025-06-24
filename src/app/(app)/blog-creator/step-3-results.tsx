
"use client";

import React from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Loader2, CheckCircle, ExternalLink, Rocket, AlertTriangle, Circle, AlertCircle } from "lucide-react";
import Link from 'next/link';
import type { SubmissionStep, SubmissionStatus } from '@/lib/types';
import { cn } from '@/lib/utils';

interface Step3ResultsProps {
    status: SubmissionStatus;
    steps: SubmissionStep[];
    finalLinks: { url: string; title: string }[];
    onStartOver: () => void;
}

const StatusIcon = ({ status }: { status: SubmissionStep['status'] }) => {
    switch (status) {
        case 'pending': return <Circle className="h-5 w-5 text-muted-foreground" />;
        case 'processing': return <Loader2 className="h-5 w-5 animate-spin text-primary" />;
        case 'success': return <CheckCircle className="h-5 w-5 text-green-500" />;
        case 'error': return <AlertCircle className="h-5 w-5 text-destructive" />;
        default: return null;
    }
}

export function Step3Results({ status, steps, finalLinks, onStartOver }: Step3ResultsProps) {
    const getOverallTitle = () => {
        switch (status) {
            case 'processing': return 'Creando Entradas...';
            case 'success': return '¡Proceso Completado!';
            case 'error': return 'Proceso Interrumpido';
            default: return 'Preparando...';
        }
    };

    const getOverallDescription = () => {
        switch (status) {
            case 'processing': return 'Estamos guardando y enlazando tus entradas en WordPress. Por favor, espera.';
            case 'success': return 'Se han guardado tus entradas como borrador en WordPress. Las traducciones han sido enlazadas automáticamente a través de Polylang.';
            case 'error': return 'Ocurrió un error durante el proceso. Revisa los detalles abajo.';
            default: return '';
        }
    };
    
     const OverallIcon = () => {
        switch (status) {
            case 'processing': return <Loader2 className="h-10 w-10 animate-spin text-primary" />;
            case 'success': return <CheckCircle className="h-10 w-10 text-green-500" />;
            case 'error': return <AlertTriangle className="h-10 w-10 text-destructive" />;
            default: return <Loader2 className="h-10 w-10 animate-spin text-primary" />;
        }
    }


    return (
        <Card>
            <CardHeader className="text-center items-center">
                <OverallIcon />
                <CardTitle className="mt-4">{getOverallTitle()}</CardTitle>
                <CardDescription>
                   {getOverallDescription()}
                </CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col items-center justify-center gap-6">
                <div className="w-full max-w-md space-y-3 rounded-lg border p-4">
                    {steps.map(step => (
                        <div key={step.id} className="flex items-start gap-3">
                            <StatusIcon status={step.status} />
                            <div className="flex-1">
                                <p className={cn("font-medium", step.status === 'error' && 'text-destructive')}>{step.name}</p>
                                {step.status === 'error' && step.error && (
                                     <p className="text-xs text-destructive">{step.error}</p>
                                )}
                            </div>
                        </div>
                    ))}
                </div>
                
                 {(status === 'success' || status === 'error') && (
                     <>
                        {finalLinks.length > 0 && (
                            <div className="space-y-2 text-center">
                                <h3 className="font-semibold">Entradas Creadas:</h3>
                                {finalLinks.map(post => (
                                    <Button variant="link" asChild key={post.url}>
                                        <Link href={post.url} target="_blank" rel="noopener noreferrer">
                                        <ExternalLink className="mr-2 h-4 w-4" /> Ver "{post.title}"
                                        </Link>
                                    </Button>
                                ))}
                            </div>
                        )}
                        <Button onClick={onStartOver}>
                            <Rocket className="mr-2 h-4 w-4" /> Crear otra entrada
                        </Button>
                     </>
                 )}
            </CardContent>
        </Card>
    );
}
