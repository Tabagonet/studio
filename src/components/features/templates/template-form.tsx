
"use client";

import React, { useEffect, useState } from 'react';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { DialogFooter, DialogClose } from "@/components/ui/dialog";
import { TEMPLATE_TYPES, TEMPLATE_SCOPES } from '@/lib/constants';
import type { ProductTemplateFormValues, ProductTemplate, TemplateType, TemplateScope, WooCommerceCategory } from '@/lib/types';
import { Loader2 } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

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
  if (data.scope === 'categoria_especifica' && (!data.categoryValue || data.categoryValue.trim() === "")) {
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

const NO_CATEGORY_SELECTED_VALUE_TEMPLATE = "__no_category_template__"; // Unique value for placeholder

export function TemplateForm({ initialData, onSubmit, onCancel, isSubmitting }: TemplateFormProps) {
  const [wooCategories, setWooCategories] = useState<WooCommerceCategory[]>([]);
  const [isLoadingCategories, setIsLoadingCategories] = useState(false);
  const { toast } = useToast();

  const { register, handleSubmit, control, formState: { errors }, watch, setValue } = useForm<ProductTemplateFormValues>({
    resolver: zodResolver(templateFormSchema),
    defaultValues: initialData ? {
      name: initialData.name,
      type: initialData.type,
      content: initialData.content,
      scope: initialData.scope,
      categoryValue: initialData.categoryValue || "", // Empty string means "no category chosen yet for this scope"
    } : {
      name: "",
      type: "nombre_seo" as TemplateType,
      content: "",
      scope: "global" as TemplateScope,
      categoryValue: "", // Default to empty, placeholder will show
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
    } else {
      if (scope !== 'categoria_especifica') {
        setValue('categoryValue', "");
      } else {
         // If scope is category_especifica for a new form, explicitly set to empty
         // so placeholder shows, rather than a previous value if form re-used
        setValue('categoryValue', "");
      }
    }
  }, [initialData, setValue, scope]);

  useEffect(() => {
    if (scope === 'categoria_especifica') {
      setIsLoadingCategories(true);
      fetch('/api/woocommerce/categories')
        .then(async (response) => {
          if (!response.ok) {
            const responseText = await response.text();
            let errorMessage = `Error ${response.status}: ${response.statusText}`;
            try {
                const errorData = JSON.parse(responseText);
                errorMessage = errorData.error || errorData.message || JSON.stringify(errorData);
            } catch (jsonError) {
                errorMessage = `Server returned non-JSON error for categories (template form). Status: ${response.status}. Body: ${responseText.substring(0,100)}...`;
                console.error("Non-JSON error response from /api/woocommerce/categories (template form):", responseText);
            }
            throw new Error(errorMessage);
          }
          return response.json();
        })
        .then((data: WooCommerceCategory[]) => {
          setWooCategories(data);
        })
        .catch(error => {
          console.error("Error fetching WooCommerce categories for templates:", error);
          toast({
            title: "Error al Cargar Categorías",
            description: (error as Error).message || "No se pudieron cargar las categorías de WooCommerce para las plantillas.",
            variant: "destructive",
          });
        })
        .finally(() => {
          setIsLoadingCategories(false);
        });
    } else {
      setValue('categoryValue', "");
    }
  }, [scope, toast, setValue]);

  const handleFormSubmit = async (data: ProductTemplateFormValues) => {
    const dataToSubmit = { ...data };
    if (data.scope !== 'categoria_especifica') {
      dataToSubmit.categoryValue = "";
    } else if (data.categoryValue === NO_CATEGORY_SELECTED_VALUE_TEMPLATE) {
      // This case should ideally be prevented by Zod schema if categoryValue is required for this scope
      dataToSubmit.categoryValue = ""; // Treat as no category if somehow selected
    }
    await onSubmit(dataToSubmit);
  };


  return (
    <form onSubmit={handleSubmit(handleFormSubmit)} className="space-y-6">
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
        <p className="text-xs text-muted-foreground mt-1">
          Usa placeholders como <code className="font-code bg-muted px-1 py-0.5 rounded-sm">{`{{nombre_producto}}`}</code>, <code className="font-code bg-muted px-1 py-0.5 rounded-sm">{`{{categoria}}`}</code>, etc.
        </p>
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
              <Select
                onValueChange={field.onChange}
                value={field.value || ""} // If field.value is undefined/null, Select will use its placeholder
                disabled={isLoadingCategories}
              >
                <SelectTrigger id="categoryValue">
                  {isLoadingCategories ? (
                    <div className="flex items-center">
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        <SelectValue placeholder="Cargando categorías..." />
                    </div>
                    ) : (
                    <SelectValue placeholder="Selecciona una categoría" />
                  )}
                </SelectTrigger>
                <SelectContent>
                   {/* The SelectValue placeholder handles "Selecciona una categoría" when value is "" */}
                   {/* No explicit <SelectItem value=""> needed here */}
                   {!isLoadingCategories && wooCategories.length === 0 && <SelectItem value="no-cat-template-placeholder" disabled>No hay categorías disponibles</SelectItem>}
                  {wooCategories.map(cat => (
                    <SelectItem key={cat.id} value={cat.slug}>{cat.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          />
          {isLoadingCategories && <p className="text-xs text-muted-foreground mt-1">Cargando categorías desde WooCommerce...</p>}
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
