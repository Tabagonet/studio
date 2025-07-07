
"use client";

import React from 'react';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter, DialogClose
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Prospect } from '@/lib/types';
import { Badge } from '@/components/ui/badge';
import Link from 'next/link';

interface ProspectDetailDialogProps {
  prospect: Prospect | null;
  onOpenChange: (open: boolean) => void;
}

const InfoRow = ({ label, value }: { label: string; value?: string }) => {
    if (!value) return null;
    return (
        <div className="grid grid-cols-3 gap-2 py-2 border-b">
            <dt className="font-semibold text-sm col-span-1">{label}</dt>
            <dd className="text-sm text-muted-foreground col-span-2">{value}</dd>
        </div>
    )
};

export function ProspectDetailDialog({ prospect, onOpenChange }: ProspectDetailDialogProps) {
  if (!prospect) {
    return null;
  }

  const { name, email, companyUrl, status, createdAt, source, inquiryData } = prospect;

  return (
    <Dialog open={!!prospect} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>Detalles del Prospecto: {name}</DialogTitle>
          <DialogDescription>
             Información capturada por el chatbot para <a href={`mailto:${email}`}>{email}</a>.
          </DialogDescription>
        </DialogHeader>

        <ScrollArea className="max-h-[60vh] my-4 pr-4">
            <dl className="space-y-1">
                <InfoRow label="URL Empresa" value={companyUrl} />
                <InfoRow label="Estado" value={status} />
                <InfoRow label="Fuente" value={source} />
                <InfoRow label="Fecha Captura" value={new Date(createdAt).toLocaleString('es-ES')} />
                
                <div className="pt-4">
                    <h4 className="font-semibold text-md mb-2">Cuestionario</h4>
                    <InfoRow label="Objetivo Principal" value={inquiryData?.objective} />
                    <InfoRow label="Descripción del Negocio" value={inquiryData?.businessDescription} />
                    <InfoRow label="Propuesta de Valor" value={inquiryData?.valueProposition} />
                    <InfoRow label="Público Objetivo" value={inquiryData?.targetAudience} />
                    <InfoRow label="Competidores" value={inquiryData?.competitors} />
                    <InfoRow label="Personalidad de Marca" value={inquiryData?.brandPersonality} />
                    <InfoRow label="Presupuesto Mensual" value={inquiryData?.monthlyBudget} />
                </div>
            </dl>
        </ScrollArea>
        
        <DialogFooter>
          <DialogClose asChild>
            <Button type="button" variant="secondary">Cerrar</Button>
          </DialogClose>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
