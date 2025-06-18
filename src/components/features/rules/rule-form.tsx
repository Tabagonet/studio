
"use client";

import React, { useEffect, useState } from 'react';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { DialogFooter, DialogClose } from "@/components/ui/dialog";
// PRODUCT_CATEGORIES ya no se usa aquí directamente para el selector principal
import type { AutomationRuleFormValues, AutomationRule, WooCommerceCategory } from '@/lib/types';
import { Loader2 } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

const ruleFormSchema = z.object({
  name: z.string().min(3, { message: "El nombre debe tener al menos 3 caracteres." }),
  keyword: z.string().min(2, { message: "La palabra clave debe tener al menos 2 caracteres." }),
  categoryToAssign: z.string().optional(), // Sigue siendo el slug
  tagsToAssign: z.string().optional().refine(val => {
    if (val === undefined || val.trim() === "") return true; 
    return val.split(',').every(tag => tag.trim().length > 0) && !val.startsWith(',') && !val.endsWith(',');
  }, { message: "Las etiquetas deben estar separadas por comas y no deben estar vacías (ej: tag1,tag2)." }),
});


interface RuleFormProps {
  initialData?: AutomationRule | null;
  onSubmit: (data: AutomationRuleFormValues) => Promise<void>;
  onCancel: () => void;
  isSubmitting: boolean;
}

export function RuleForm({ initialData, onSubmit, onCancel, isSubmitting }: RuleFormProps) {
  const [wooCategories, setWooCategories] = useState<WooCommerceCategory[]>([]);
  const [isLoadingCategories, setIsLoadingCategories] = useState(false);
  const { toast } = useToast();

  const { register, handleSubmit, control, formState: { errors }, setValue } = useForm<AutomationRuleFormValues>({
    resolver: zodResolver(ruleFormSchema),
    defaultValues: initialData ? {
      name: initialData.name,
      keyword: initialData.keyword,
      categoryToAssign: initialData.categoryToAssign || "",
      tagsToAssign: initialData.tagsToAssign || "",
    } : {
      name: "",
      keyword: "",
      categoryToAssign: "",
      tagsToAssign: "",
    },
  });

  useEffect(() => {
    if (initialData) {
      setValue('name', initialData.name);
      setValue('keyword', initialData.keyword);
      setValue('categoryToAssign', initialData.categoryToAssign || "");
      setValue('tagsToAssign', initialData.tagsToAssign || "");
    }
  }, [initialData, setValue]);

  useEffect(() => {
    const fetchCategories = async () => {
      setIsLoadingCategories(true);
      try {
        const response = await fetch('/api/woocommerce/categories');
        if (!response.ok) {
          const errorData = await response.json();
          throw new Error(errorData.error || 'Failed to fetch categories for rules');
        }
        const data: WooCommerceCategory[] = await response.json();
        setWooCategories(data);
      } catch (error) {
        console.error("Error fetching WooCommerce categories for rules:", error);
        toast({
          title: "Error al Cargar Categorías",
          description: (error as Error).message || "No se pudieron cargar las categorías de WooCommerce para las reglas.",
          variant: "destructive",
        });
      } finally {
        setIsLoadingCategories(false);
      }
    };
    fetchCategories();
  }, [toast]);

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
      <div>
        <Label htmlFor="name">Nombre de la Regla</Label>
        <Input id="name" {...register('name')} placeholder="Ej: Asignar categoría 'Ropa' a 'Camisetas'" />
        {errors.name && <p className="text-sm text-destructive mt-1">{errors.name.message}</p>}
      </div>

      <div>
        <Label htmlFor="keyword">Palabra Clave</Label>
        <Input id="keyword" {...register('keyword')} placeholder="Ej: camiseta" />
        <p className="text-xs text-muted-foreground mt-1">Esta palabra clave se buscará en el nombre o descripción del producto.</p>
        {errors.keyword && <p className="text-sm text-destructive mt-1">{errors.keyword.message}</p>}
      </div>
      
      <div>
        <Label htmlFor="categoryToAssign">Categoría a Asignar (Opcional)</Label>
        <Controller
          name="categoryToAssign"
          control={control}
          render={({ field }) => (
            <Select 
              onValueChange={field.onChange} 
              value={field.value || ""}
              disabled={isLoadingCategories}
            >
              <SelectTrigger id="categoryToAssign">
                {isLoadingCategories ? (
                  <div className="flex items-center">
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    <SelectValue placeholder="Cargando categorías..." />
                  </div>
                ) : (
                  <SelectValue placeholder="Selecciona una categoría para asignar" />
                )}
              </SelectTrigger>
              <SelectContent>
                 <SelectItem value="">Ninguna</SelectItem>
                 {!isLoadingCategories && wooCategories.length === 0 && <SelectItem value="no-cat-rules" disabled>No hay categorías disponibles</SelectItem>}
                {wooCategories.map(cat => (
                  <SelectItem key={cat.id} value={cat.slug}>{cat.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        />
        {isLoadingCategories && <p className="text-xs text-muted-foreground mt-1">Cargando categorías desde WooCommerce...</p>}
        {errors.categoryToAssign && <p className="text-sm text-destructive mt-1">{errors.categoryToAssign.message}</p>}
      </div>

      <div>
        <Label htmlFor="tagsToAssign">Etiquetas a Asignar (Opcional)</Label>
        <Input id="tagsToAssign" {...register('tagsToAssign')} placeholder="Ej: verano,algodon,oferta" />
        <p className="text-xs text-muted-foreground mt-1">Separa las etiquetas por comas. Ej: etiqueta1,etiqueta2</p>
        {errors.tagsToAssign && <p className="text-sm text-destructive mt-1">{errors.tagsToAssign.message}</p>}
      </div>


      <DialogFooter className="pt-4">
        <DialogClose asChild>
          <Button type="button" variant="outline" onClick={onCancel} disabled={isSubmitting}>
            Cancelar
          </Button>
        </DialogClose>
        <Button type="submit" disabled={isSubmitting}>
          {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          {initialData ? 'Guardar Cambios' : 'Crear Regla'}
        </Button>
      </DialogFooter>
    </form>
  );
}
