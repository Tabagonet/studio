
"use client";

import React, { useEffect } from 'react';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { DialogFooter, DialogClose } from "@/components/ui/dialog";
import { PRODUCT_CATEGORIES, TEMPLATE_TYPES, TEMPLATE_SCOPES } from '@/lib/constants';
import type { ProductTemplateFormValues, ProductTemplate, TemplateType, TemplateScope } from '@/lib/types';
import { Loader2 } from 'lucide-react';

const templateFormSchema = z.object({
  name: z.string().min(3, { message: "El nombre debe tener al menos 3 caracteres." }),
  type: z.enum(['nombre_seo', 'descripcion_corta', 'descripcion_larga', 'metadatos_seo'], {
    errorMap: () => ({ message: "Debes seleccionar un tipo de plantilla válido." })
  }),
  content: z.string().min(10, { message: "El contenido debe tener al menos 10 caracteres." }),
  scope: z.enum(['global', 'categoria_especifica'], {
    errorMap: () => ({ message: "Debes seleccionar un ámbito válido." })
  }),
  categoryValue: z.string().optional(),
}).refine(data => {
  if (data.scope === 'categoria_especifica' && !data.categoryValue) {
    return false;
  }
  return true;
}, {
  message: "Debes seleccionar una categoría si el ámbito es 'Categoría Específica'.",
  path: ['categoryValue'],
});


interface TemplateFormProps {
  initialData?: ProductTemplate | null;
  onSubmit: (data: ProductTemplateFormValues) => Promise<void>;
  onCancel: () => void;
  isSubmitting: boolean;
}

export function TemplateForm({ initialData, onSubmit, onCancel, isSubmitting }: TemplateFormProps) {
  const { register, handleSubmit, control, formState: { errors }, watch, setValue } = useForm<ProductTemplateFormValues>({
    resolver: zodResolver(templateFormSchema),
    defaultValues: initialData ? {
      name: initialData.name,
      type: initialData.type,
      content: initialData.content,
      scope: initialData.scope,
      categoryValue: initialData.categoryValue || "",
    } : {
      name: "",
      type: "nombre_seo" as TemplateType,
      content: "",
      scope: "global" as TemplateScope,
      categoryValue: "",
    },
  });

  const scope = watch('scope');

  useEffect(() => {
    if (initialData) {
      setValue('name', initialData.name);
      setValue('type', initialData.type);
      setValue('content', initialData.content);
      setValue('scope', initialData.scope);
      setValue('categoryValue', initialData.categoryValue || "");
    }
  }, [initialData, setValue]);

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
      <div>
        <Label htmlFor="name">Nombre de la Plantilla</Label>
        <Input id="name" {...register('name')} placeholder="Ej: Nombre SEO para Electrónica" />
        {errors.name && <p className="text-sm text-destructive mt-1">{errors.name.message}</p>}
      </div>

      <div>
        <Label htmlFor="type">Tipo de Plantilla</Label>
        <Controller
          name="type"
          control={control}
          render={({ field }) => (
            <Select onValueChange={field.onChange} value={field.value}>
              <SelectTrigger id="type">
                <SelectValue placeholder="Selecciona un tipo" />
              </SelectTrigger>
              <SelectContent>
                {TEMPLATE_TYPES.map(type => (
                  <SelectItem key={type.value} value={type.value}>{type.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        />
        {errors.type && <p className="text-sm text-destructive mt-1">{errors.type.message}</p>}
      </div>

      <div>
        <Label htmlFor="content">Contenido de la Plantilla</Label>
        <Textarea id="content" {...register('content')} rows={5} placeholder="Ej: {{nombre_producto}} - {{marca}} | Mejor Precio" />
        <p className="text-xs text-muted-foreground mt-1">Usa placeholders como `{{nombre_producto}}`, `{{categoria}}`, etc.</p>
        {errors.content && <p className="text-sm text-destructive mt-1">{errors.content.message}</p>}
      </div>

      <div>
        <Label htmlFor="scope">Ámbito de la Plantilla</Label>
        <Controller
          name="scope"
          control={control}
          render={({ field }) => (
            <Select onValueChange={field.onChange} value={field.value}>
              <SelectTrigger id="scope">
                <SelectValue placeholder="Selecciona un ámbito" />
              </SelectTrigger>
              <SelectContent>
                {TEMPLATE_SCOPES.map(s => (
                  <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        />
        {errors.scope && <p className="text-sm text-destructive mt-1">{errors.scope.message}</p>}
      </div>

      {scope === 'categoria_especifica' && (
        <div>
          <Label htmlFor="categoryValue">Categoría Específica</Label>
          <Controller
            name="categoryValue"
            control={control}
            render={({ field }) => (
              <Select onValueChange={field.onChange} value={field.value}>
                <SelectTrigger id="categoryValue">
                  <SelectValue placeholder="Selecciona una categoría" />
                </SelectTrigger>
                <SelectContent>
                  {PRODUCT_CATEGORIES.map(cat => (
                    <SelectItem key={cat.value} value={cat.value}>{cat.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          />
          {errors.categoryValue && <p className="text-sm text-destructive mt-1">{errors.categoryValue.message}</p>}
        </div>
      )}

      <DialogFooter className="pt-4">
        <DialogClose asChild>
          <Button type="button" variant="outline" onClick={onCancel} disabled={isSubmitting}>
            Cancelar
          </Button>
        </DialogClose>
        <Button type="submit" disabled={isSubmitting}>
          {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          {initialData ? 'Guardar Cambios' : 'Crear Plantilla'}
        </Button>
      </DialogFooter>
    </form>
  );
}
