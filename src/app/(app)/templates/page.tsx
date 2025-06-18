
"use client";

import React, { useState, useEffect, useCallback } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { FileText, PlusCircle, Edit3, Trash2, Loader2, AlertTriangle } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogClose
} from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { TemplateForm } from '@/components/features/templates/template-form';
import type { ProductTemplate, ProductTemplateFormValues, TemplateType, TemplateScope, WooCommerceCategory } from '@/lib/types';
import { db } from '@/lib/firebase';
import { collection, addDoc, getDocs, doc, deleteDoc, updateDoc, serverTimestamp, query, orderBy, onSnapshot, Timestamp } from 'firebase/firestore';
import { useToast } from '@/hooks/use-toast';
import { PRODUCT_TEMPLATES_COLLECTION, TEMPLATE_TYPES, TEMPLATE_SCOPES } from '@/lib/constants';
import { format } from 'date-fns';


export default function TemplatesPage() {
  const [templates, setTemplates] = useState<ProductTemplate[]>([]);
  const [wooCategories, setWooCategories] = useState<WooCommerceCategory[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [currentTemplate, setCurrentTemplate] = useState<ProductTemplate | null>(null);
  const [templateToDelete, setTemplateToDelete] = useState<ProductTemplate | null>(null);
  
  const { toast } = useToast();

  useEffect(() => {
    const fetchWooCategories = async () => {
        try {
            const response = await fetch('/api/woocommerce/categories');
            if (!response.ok) {
                throw new Error('Failed to fetch WooCommerce categories for template page display');
            }
            const data: WooCommerceCategory[] = await response.json();
            setWooCategories(data);
        } catch (error) {
            console.error("Error fetching WooCommerce categories for template display:", error);
            // Non-critical, table display will just show slug if name not found
        }
    };
    fetchWooCategories();
  }, []);

  useEffect(() => {
    setIsLoading(true);
    const q = query(collection(db, PRODUCT_TEMPLATES_COLLECTION), orderBy("createdAt", "desc"));
    
    const unsubscribe = onSnapshot(q, (querySnapshot) => {
      const fetchedTemplates: ProductTemplate[] = [];
      querySnapshot.forEach((doc) => {
        fetchedTemplates.push({ id: doc.id, ...doc.data() } as ProductTemplate);
      });
      setTemplates(fetchedTemplates);
      setIsLoading(false);
    }, (error) => {
      console.error("Error fetching templates: ", error);
      toast({
        title: "Error al Cargar Plantillas",
        description: "No se pudieron obtener las plantillas desde la base de datos.",
        variant: "destructive",
      });
      setIsLoading(false);
    });

    return () => unsubscribe();
  }, [toast]);

  const handleAddNewTemplate = () => {
    setCurrentTemplate(null);
    setIsDialogOpen(true);
  };

  const handleEditTemplate = (template: ProductTemplate) => {
    setCurrentTemplate(template);
    setIsDialogOpen(true);
  };

  const handleCloseDialog = () => {
    setIsDialogOpen(false);
    setCurrentTemplate(null);
  };

  const handleSaveTemplate = async (data: ProductTemplateFormValues) => {
    setIsSubmitting(true);
    try {
      const templateDataToSave = {
        ...data,
        categoryValue: data.scope === 'categoria_especifica' ? data.categoryValue : "", // Ensure categoryValue is empty if not category specific
        updatedAt: serverTimestamp(),
      };

      if (currentTemplate) {
        // Update existing template
        const templateRef = doc(db, PRODUCT_TEMPLATES_COLLECTION, currentTemplate.id);
        await updateDoc(templateRef, templateDataToSave);
        toast({ title: "Plantilla Actualizada", description: `La plantilla "${data.name}" ha sido actualizada.` });
      } else {
        // Create new template
        await addDoc(collection(db, PRODUCT_TEMPLATES_COLLECTION), {
          ...templateDataToSave,
          createdAt: serverTimestamp(),
        });
        toast({ title: "Plantilla Creada", description: `La plantilla "${data.name}" ha sido creada.` });
      }
      handleCloseDialog();
    } catch (error) {
      console.error("Error saving template: ", error);
      toast({
        title: "Error al Guardar Plantilla",
        description: "Ocurrió un error al guardar la plantilla. Inténtalo de nuevo.",
        variant: "destructive",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const openDeleteConfirmDialog = (template: ProductTemplate) => {
    setTemplateToDelete(template);
  };

  const handleDeleteTemplate = async () => {
    if (!templateToDelete) return;
    setIsSubmitting(true);
    try {
      await deleteDoc(doc(db, PRODUCT_TEMPLATES_COLLECTION, templateToDelete.id));
      toast({ title: "Plantilla Eliminada", description: `La plantilla "${templateToDelete.name}" ha sido eliminada.` });
      setTemplateToDelete(null); // Close dialog
    } catch (error) {
      console.error("Error deleting template: ", error);
      toast({
        title: "Error al Eliminar Plantilla",
        description: "Ocurrió un error al eliminar la plantilla. Inténtalo de nuevo.",
        variant: "destructive",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const getTemplateTypeLabel = (typeValue: TemplateType) => {
    return TEMPLATE_TYPES.find(t => t.value === typeValue)?.label || typeValue;
  };
  
  const getTemplateScopeLabel = (scopeValue: TemplateScope, categorySlug?: string) => {
    const scope = TEMPLATE_SCOPES.find(s => s.value === scopeValue)?.label || scopeValue;
    if (scopeValue === 'categoria_especifica' && categorySlug) {
      const category = wooCategories.find(c => c.slug === categorySlug)?.name || categorySlug;
      return `${scope} (${category})`;
    }
    return scope;
  };

  const formatDate = (timestamp: Timestamp | undefined | null): string => {
    if (!timestamp) return 'N/A';
    try {
      return format(timestamp.toDate(), 'dd/MM/yyyy HH:mm');
    } catch (error) {
      return 'Fecha inválida';
    }
  };


  return (
    <div className="container mx-auto py-8">
      <div className="flex flex-col md:flex-row justify-between md:items-center gap-4 mb-8">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-foreground font-headline">Gestión de Plantillas</h1>
          <p className="text-muted-foreground">Crea y administra plantillas para nombres SEO, descripciones y metadatos.</p>
        </div>
        <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
          <DialogTrigger asChild>
            <Button onClick={handleAddNewTemplate}>
              <PlusCircle className="mr-2 h-4 w-4" /> Nueva Plantilla
            </Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>{currentTemplate ? 'Editar Plantilla' : 'Crear Nueva Plantilla'}</DialogTitle>
              <DialogDescription>
                {currentTemplate ? 'Modifica los detalles de tu plantilla.' : 'Completa el formulario para crear una nueva plantilla.'}
              </DialogDescription>
            </DialogHeader>
            <TemplateForm 
              initialData={currentTemplate} 
              onSubmit={handleSaveTemplate} 
              onCancel={handleCloseDialog}
              isSubmitting={isSubmitting}
            />
          </DialogContent>
        </Dialog>
      </div>

      <Card className="shadow-lg rounded-lg">
        <CardHeader className="border-b">
          <CardTitle>Mis Plantillas</CardTitle>
          <CardDescription>Aquí se listarán tus plantillas personalizadas.</CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="min-h-[200px] flex items-center justify-center">
              <Loader2 className="h-12 w-12 text-primary animate-spin" />
            </div>
          ) : templates.length > 0 ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[30%]">Nombre</TableHead>
                  <TableHead>Tipo</TableHead>
                  <TableHead>Ámbito</TableHead>
                  <TableHead>Última Modificación</TableHead>
                  <TableHead className="text-right">Acciones</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {templates.map((template) => (
                  <TableRow key={template.id}>
                    <TableCell className="font-medium">{template.name}</TableCell>
                    <TableCell>
                        <Badge variant={
                            template.type === 'nombre_seo' ? 'default' :
                            template.type === 'descripcion_corta' ? 'secondary' :
                            template.type === 'descripcion_larga' ? 'outline' :
                            'destructive' 
                        }>{getTemplateTypeLabel(template.type)}</Badge>
                    </TableCell>
                    <TableCell>{getTemplateScopeLabel(template.scope, template.categoryValue)}</TableCell>
                    <TableCell>{formatDate(template.updatedAt)}</TableCell>
                    <TableCell className="text-right">
                      <Button variant="ghost" size="icon" className="mr-2 h-8 w-8" title="Editar" onClick={() => handleEditTemplate(template)}>
                        <Edit3 className="h-4 w-4" />
                      </Button>
                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <Button variant="ghost" size="icon" className="h-8 w-8" title="Eliminar" onClick={() => openDeleteConfirmDialog(template)}>
                            <Trash2 className="h-4 w-4 text-destructive" />
                          </Button>
                        </AlertDialogTrigger>
                        {templateToDelete && templateToDelete.id === template.id && (
                          <AlertDialogContent>
                            <AlertDialogHeader>
                              <AlertDialogTitle>¿Estás seguro?</AlertDialogTitle>
                              <AlertDialogDescription>
                                Esta acción no se puede deshacer. Esto eliminará permanentemente la plantilla "{templateToDelete.name}".
                              </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                              <AlertDialogCancel onClick={() => setTemplateToDelete(null)} disabled={isSubmitting}>Cancelar</AlertDialogCancel>
                              <AlertDialogAction onClick={handleDeleteTemplate} disabled={isSubmitting} className="bg-destructive hover:bg-destructive/90">
                                {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                                Eliminar
                              </AlertDialogAction>
                            </AlertDialogFooter>
                          </AlertDialogContent>
                        )}
                      </AlertDialog>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : (
            <div className="min-h-[200px] flex flex-col items-center justify-center text-center p-6">
              <FileText className="h-16 w-16 text-muted-foreground mb-4" />
              <p className="text-muted-foreground mb-2">Aún no has creado ninguna plantilla.</p>
              <p className="text-sm text-muted-foreground">Usa el botón "Nueva Plantilla" para empezar.</p>
            </div>
          )}
        </CardContent>
         {templates.length > 0 && !isLoading && (
            <CardFooter className="border-t pt-4 flex justify-end">
                 <p className="text-xs text-muted-foreground">Mostrando {templates.length} plantillas.</p>
            </CardFooter>
        )}
      </Card>
    </div>
  );
}
