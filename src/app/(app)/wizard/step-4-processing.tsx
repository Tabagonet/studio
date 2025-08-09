// src/app/(app)/wizard/step-4-processing.tsx

"use client";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { SubmissionStatus, SubmissionStep } from "@/lib/types";
import { CheckCircle, Circle, Loader2, AlertCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import { Progress } from "@/components/ui/progress";


interface Step4ProcessingProps {
  status: SubmissionStatus;
  steps: SubmissionStep[];
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


export function Step4Processing({ status, steps }: Step4ProcessingProps) {
    
    const getOverallDescription = () => {
        switch(status) {
            case 'processing': return 'Estamos procesando tu producto. Esto puede tardar unos segundos...';
            case 'success': return '¡Proceso completado con éxito!';
            case 'error': return 'Ocurrió un error. Revisa los detalles e inténtalo de nuevo.';
            default: return 'Iniciando proceso de creación...';
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
                <CardContent className="space-y-4">
                     {steps.map(step => (
                        <div key={step.id} className="flex items-start gap-3">
                            <StatusIcon status={step.status} />
                            <div className="flex-1 space-y-1">
                                <p className={cn("font-medium", step.status === 'error' && 'text-destructive')}>{step.name}</p>
                                {step.message && <p className="text-xs text-muted-foreground">{step.message}</p>}
                                {step.status === 'processing' && step.progress !== undefined && (
                                    <Progress value={step.progress} className="h-2" />
                                )}
                                {step.status === 'error' && step.error && (
                                     <p className="text-xs text-destructive">{step.error}</p>
                                )}
                            </div>
                        </div>
                    ))}
                </CardContent>
            </Card>
        </div>
    );
}
