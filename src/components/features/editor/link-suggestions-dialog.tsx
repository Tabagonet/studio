"use client";

import React from 'react';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter, DialogClose
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import type { LinkSuggestion } from '@/ai/schemas';
import { Link2 } from 'lucide-react';

interface LinkSuggestionsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  suggestions: LinkSuggestion[];
  onApplySuggestion: (suggestion: LinkSuggestion) => void;
  onApplyAll: () => void;
}

export function LinkSuggestionsDialog({
  open, onOpenChange, suggestions, onApplySuggestion, onApplyAll
}: LinkSuggestionsDialogProps) {
  
  if (!suggestions || suggestions.length === 0) {
    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Sugerencias de Enlaces Internos</DialogTitle>
            <DialogDescription>
              La IA no ha encontrado ninguna sugerencia de enlace interno para este contenido.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <DialogClose asChild>
              <Button type="button" variant="secondary">Cerrar</Button>
            </DialogClose>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Sugerencias de Enlaces Internos</DialogTitle>
          <DialogDescription>
            La IA ha identificado estas oportunidades para mejorar tu enlazado interno.
          </DialogDescription>
        </DialogHeader>

        <ScrollArea className="max-h-[60vh] my-4">
          <div className="space-y-4 pr-4">
            {suggestions.map((suggestion, index) => (
              <div key={index} className="p-4 border rounded-lg flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div className="flex-1 space-y-2">
                  <p className="text-sm text-muted-foreground">
                    Enlazar la frase: "<em className="font-semibold text-foreground not-italic">{suggestion.phraseToLink}</em>"
                  </p>
                  <p className="text-sm text-primary flex items-center gap-1.5">
                    <Link2 className="h-4 w-4" />
                    <span className="truncate">a: {suggestion.targetTitle}</span>
                  </p>
                </div>
                <Button 
                  size="sm" 
                  variant="outline"
                  onClick={() => onApplySuggestion(suggestion)}
                >
                  Aplicar
                </Button>
              </div>
            ))}
          </div>
        </ScrollArea>
        
        <DialogFooter className="sm:justify-between">
           <Button variant="default" onClick={onApplyAll}>
            Aplicar Todas las Sugerencias
          </Button>
          <DialogClose asChild>
            <Button type="button" variant="secondary">
              Cerrar
            </Button>
          </DialogClose>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
