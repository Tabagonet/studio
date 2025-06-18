"use client";

import React, { useState, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Loader2, Sparkles } from 'lucide-react';
import { suggestProductAttributes } from '@/ai/flows/suggest-product-attributes';
import type { AttributeSuggestion, ProductAttribute } from '@/lib/types';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';

interface AiAttributeSuggesterProps {
  keywords: string;
  onAttributesSuggested: (attributes: ProductAttribute[]) => void;
}

export function AiAttributeSuggester({ keywords, onAttributesSuggested }: AiAttributeSuggesterProps) {
  const [isLoading, setIsLoading] = useState(false);
  const [suggestions, setSuggestions] = useState<AttributeSuggestion[]>([]);
  const { toast } = useToast();

  const handleSuggestAttributes = useCallback(async () => {
    if (!keywords.trim()) {
      toast({
        title: "Palabras Clave Requeridas",
        description: "Por favor, ingresa algunas palabras clave para obtener sugerencias.",
        variant: "destructive",
      });
      return;
    }

    setIsLoading(true);
    setSuggestions([]);
    try {
      const result = await suggestProductAttributes({ keywords });
      if (result && result.attributes) {
        setSuggestions(result.attributes);
      } else {
        toast({
          title: "No se encontraron sugerencias",
          description: "Intenta con palabras clave diferentes o más específicas.",
          variant: "default",
        });
      }
    } catch (error) {
      console.error("Error suggesting attributes:", error);
      toast({
        title: "Error al Sugerir Atributos",
        description: "Ocurrió un error al intentar obtener sugerencias. Por favor, intenta de nuevo.",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  }, [keywords, toast]);

  const addSuggestionAsAttribute = (suggestion: string) => {
    // Example: "Color: Blue" -> name: "Color", value: "Blue"
    // Example: "Material" -> name: "Material", value: "" (user fills)
    let name = suggestion;
    let value = "";
    if (suggestion.includes(':')) {
      [name, value] = suggestion.split(':', 2).map(s => s.trim());
    }
    onAttributesSuggested([{ name, value }]);
    // Remove suggestion from list after adding
    setSuggestions(prev => prev.filter(s => s !== suggestion)); 
  };

  return (
    <div className="space-y-4 p-4 border rounded-md bg-accent/50">
      <Label htmlFor="ai-attribute-suggester" className="text-sm font-medium">
        Sugerencias de Atributos con IA
      </Label>
      <p className="text-xs text-muted-foreground">
        Basado en tus palabras clave, podemos sugerir atributos relevantes para tu producto.
      </p>
      <Button
        onClick={handleSuggestAttributes}
        disabled={isLoading || !keywords.trim()}
        type="button"
        variant="outline"
        size="sm"
      >
        {isLoading ? (
          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
        ) : (
          <Sparkles className="mr-2 h-4 w-4" />
        )}
        Obtener Sugerencias
      </Button>

      {suggestions.length > 0 && (
        <div className="space-y-2 pt-2">
          <h4 className="text-xs font-semibold text-muted-foreground">Sugerencias:</h4>
          <div className="flex flex-wrap gap-2">
            {suggestions.map((suggestion, index) => (
              <Badge
                key={index}
                variant="secondary"
                className="cursor-pointer hover:bg-primary hover:text-primary-foreground transition-colors"
                onClick={() => addSuggestionAsAttribute(suggestion)}
                title={`Añadir "${suggestion}" como atributo`}
              >
                {suggestion}
              </Badge>
            ))}
          </div>
           <p className="text-xs text-muted-foreground">Haz clic en una sugerencia para añadirla como atributo.</p>
        </div>
      )}
    </div>
  );
}
