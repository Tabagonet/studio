
"use client";

import React from 'react';
import { useRouter } from 'next/navigation';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter, DialogClose
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Prospect } from '@/lib/types';

interface ProspectDetailDialogProps {
  prospect: Prospect | null;
  onOpenChange: (open: boolean) => void;
}

const InfoRow = ({ label, value }: { label: string; value?: string | null }) => {
    if (!value) return null;
    return (
        <div className="grid grid-cols-3 gap-2 py-2 border-b">
            <dt className="font-semibold text-sm col-span-1">{label}</dt>
            <dd className="text-sm text-muted-foreground col-span-2 whitespace-pre-line">{value}</dd>
        </div>
    )
};

export function ProspectDetailDialog({ prospect, onOpenChange }: ProspectDetailDialogProps) {
  const router = useRouter();
  
  if (!prospect) {
    return null;
  }
  
  const handleCreatePlan = () => {
    if (!prospect) return;
    const params = new URLSearchParams();
    
    if (prospect.companyUrl) params.set('url', prospect.companyUrl);
    if (prospect.inquiryData?.objective) params.set('priorityObjective', prospect.inquiryData.objective);
    if (prospect.inquiryData?.businessDescription) params.set('companyInfo', prospect.inquiryData.businessDescription);
    if (prospect.inquiryData?.valueProposition) params.set('valueProposition', prospect.inquiryData.valueProposition);
    if (prospect.inquiryData?.targetAudience) params.set('targetAudience', prospect.inquiryData.targetAudience);
    if (prospect.inquiryData?.competitors) params.set('competitors', prospect.inquiryData.competitors);
    if (prospect.inquiryData?.brandPersonality) params.set('brandPersonality', prospect.inquiryData.brandPersonality);
    if (prospect.inquiryData?.monthlyBudget) params.set('monthlyBudget', prospect.inquiryData.monthlyBudget);
    
    router.push(`/ad-planner?${params.toString()}`);
  };

  const { name, email, companyUrl, status, createdAt, source, inquiryData } = prospect;

  return (
    <Dialog open={!!prospect} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>Detalles del Prospecto: {name}</DialogTitle>
          <DialogDescription>
             Información capturada por el chatbot para <a href={`mailto:${email}`} className="text-primary hover:underline">{email}</a>.
          </DialogDescription>
        </DialogHeader>

        <ScrollArea className="max-h-[60vh] my-4 pr-4">
            <dl className="space-y-1">
                <InfoRow label="URL Empresa" value={companyUrl} />
                <InfoRow label="Estado" value={status} />
                <InfoRow label="Fuente" value={source} />
                <InfoRow label="Fecha Captura" value={new Date(createdAt).toLocaleString('es-ES')} />
                
                <div className="pt-4 mt-2 border-t">
                    <h4 className="font-semibold text-md mb-2">Respuestas del Cuestionario</h4>
                    <InfoRow label="Objetivo Principal" value={inquiryData?.objective} />
                    <InfoRow label="Descripción Negocio" value={inquiryData?.businessDescription} />
                    <InfoRow label="Propuesta de Valor" value={inquiryData?.valueProposition} />
                    <InfoRow label="Público Objetivo" value={inquiryData?.targetAudience} />
                    <InfoRow label="Competidores" value={inquiryData?.competitors} />
                    <InfoRow label="Personalidad Marca" value={inquiryData?.brandPersonality} />
                    <InfoRow label="Presupuesto Mensual" value={inquiryData?.monthlyBudget} />
                </div>
            </dl>
        </ScrollArea>
        
        <DialogFooter className="flex-col sm:flex-row sm:justify-between gap-2">
           <Button onClick={handleCreatePlan}>Crear Plan de Publicidad</Button>
          <DialogClose asChild>
            <Button type="button" variant="secondary">Cerrar</Button>
          </DialogClose>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
