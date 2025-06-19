
"use client";

import React from 'react';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { DialogFooter, DialogClose } from "@/components/ui/dialog";
import type { AiPromptFormValues, AiPromptKey } from '@/lib/types';
import { Loader2 } from 'lucide-react';

// Define the schema for Zod validation
const promptFormSchema = z.object({
  promptKey: z.custom<AiPromptKey>(val => typeof val === 'string' && val.length > 0, {
    message: "La clave del prompt es requerida y no puede ser cambiada."
  }),
  description: z.string().min(10, { message: "La descripción debe tener al menos 10 caracteres." }),
  modelType: z.enum(['text-generation', 'text2text-generation'], {
    errorMap: () => ({ message: "Debes seleccionar un tipo de modelo válido." })
  }),
  modelName: z.string().min(3, { message: "El nombre del modelo debe tener al menos 3 caracteres." }),
  promptTemplate: z.string().min(20, { message: "La plantilla del prompt debe tener al menos 20 caracteres." }),
  defaultGenerationParamsText: z.string().refine((val) => {
    try {
      JSON.parse(val);
      return true;
    } catch (e) {
      return false;
    }
  }, { message: "Los parámetros de generación deben ser un JSON válido." }),
});

interface PromptFormProps {
  initialData: AiPromptFormValues & { id?: string }; // id is from AiPrompt, promptKey is part of AiPromptFormValues
  onSubmit: (data: AiPromptFormValues) => Promise<void>;
  onCancel: () => void;
  isSubmitting: boolean;
}

export function PromptForm({ initialData, onSubmit, onCancel, isSubmitting }: PromptFormProps) {
  const { register, handleSubmit, control, formState: { errors }, watch } = useForm<AiPromptFormValues>({
    resolver: zodResolver(promptFormSchema),
    defaultValues: initialData,
  });

  const modelType = watch('modelType');

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
      <div>
        <Label htmlFor="promptKey">Clave del Prompt (No editable)</Label>
        <Input id="promptKey" {...register('promptKey')} readOnly className="bg-muted/50 cursor-not-allowed" />
        {errors.promptKey && <p className="text-sm text-destructive mt-1">{errors.promptKey.message}</p>}
      </div>

      <div>
        <Label htmlFor="description">Descripción</Label>
        <Textarea id="description" {...register('description')} rows={2} placeholder="Una breve descripción de para qué sirve este prompt." />
        {errors.description && <p className="text-sm text-destructive mt-1">{errors.description.message}</p>}
      </div>
      
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <Label htmlFor="modelType">Tipo de Modelo/Pipeline</Label>
          <Controller
            name="modelType"
            control={control}
            render={({ field }) => (
              <Select onValueChange={field.onChange} value={field.value}>
                <SelectTrigger id="modelType">
                  <SelectValue placeholder="Selecciona un tipo de pipeline" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="text-generation">Text Generation (ej: GPT-2)</SelectItem>
                  <SelectItem value="text2text-generation">Text-to-Text Generation (ej: T5)</SelectItem>
                </SelectContent>
              </Select>
            )}
          />
          {errors.modelType && <p className="text-sm text-destructive mt-1">{errors.modelType.message}</p>}
        </div>
        <div>
          <Label htmlFor="modelName">Nombre del Modelo (Xenova)</Label>
          <Input id="modelName" {...register('modelName')} placeholder="Ej: Xenova/distilgpt2 o Xenova/t5-small" />
          {errors.modelName && <p className="text-sm text-destructive mt-1">{errors.modelName.message}</p>}
        </div>
      </div>

      <div>
        <Label htmlFor="promptTemplate">Plantilla del Prompt</Label>
        <Textarea 
            id="promptTemplate" 
            {...register('promptTemplate')} 
            rows={10} 
            placeholder="Escribe aquí tu prompt. Usa placeholders como {{productName}}." 
            className="font-code text-xs leading-relaxed"
        />
        <p className="text-xs text-muted-foreground mt-1">
          Los placeholders se reemplazarán con datos reales durante la generación.
        </p>
        {errors.promptTemplate && <p className="text-sm text-destructive mt-1">{errors.promptTemplate.message}</p>}
      </div>

      <div>
        <Label htmlFor="defaultGenerationParamsText">Parámetros de Generación por Defecto (JSON)</Label>
        <Textarea 
            id="defaultGenerationParamsText" 
            {...register('defaultGenerationParamsText')} 
            rows={3} 
            placeholder='Ej: { "max_new_tokens": 100, "temperature": 0.8 }' 
            className="font-code text-xs leading-relaxed"
        />
        <p className="text-xs text-muted-foreground mt-1">
          Debe ser un objeto JSON válido. Consulta la documentación del modelo para los parámetros disponibles.
        </p>
        {errors.defaultGenerationParamsText && <p className="text-sm text-destructive mt-1">{errors.defaultGenerationParamsText.message}</p>}
      </div>

      <DialogFooter className="pt-4">
        <DialogClose asChild>
          <Button type="button" variant="outline" onClick={onCancel} disabled={isSubmitting}>
            Cancelar
          </Button>
        </DialogClose>
        <Button type="submit" disabled={isSubmitting}>
          {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          Guardar Cambios
        </Button>
      </DialogFooter>
    </form>
  );
}
