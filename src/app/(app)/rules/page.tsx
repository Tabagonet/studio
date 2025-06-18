
"use client";

import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Cog, PlusCircle, Edit3, Trash2, Loader2, Tags, ListChecks } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { RuleForm } from '@/components/features/rules/rule-form';
import type { AutomationRule, AutomationRuleFormValues, WooCommerceCategory } from '@/lib/types';
import { db } from '@/lib/firebase';
import { collection, addDoc, getDocs, doc, deleteDoc, updateDoc, serverTimestamp, query, orderBy, onSnapshot, Timestamp } from 'firebase/firestore';
import { useToast } from '@/hooks/use-toast';
import { AUTOMATION_RULES_COLLECTION } from '@/lib/constants';
import { format } from 'date-fns';

const NO_CATEGORY_VALUE = "sin_categoria";

export default function RulesPage() {
  const [rules, setRules] = useState<AutomationRule[]>([]);
  const [wooCategories, setWooCategories] = useState<WooCommerceCategory[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingCategories, setIsLoadingCategories] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [currentRule, setCurrentRule] = useState<AutomationRule | null>(null);
  const [ruleToDelete, setRuleToDelete] = useState<AutomationRule | null>(null);

  const { toast } = useToast();

  useEffect(() => {
    const fetchWooCategories = async () => {
        setIsLoadingCategories(true);
        try {
            const response = await fetch('/api/woocommerce/categories');
            if (!response.ok) {
                const responseText = await response.text();
                let errorMessage = `Error fetching categories for rules page: ${response.status} ${response.statusText}`;
                try {
                    const errorData = JSON.parse(responseText);
                    errorMessage = errorData.error || errorData.message || JSON.stringify(errorData);
                } catch (parseError) {
                     errorMessage = `Server returned non-JSON error for rule page categories. Status: ${response.status}. Body: ${responseText.substring(0,100)}...`;
                     console.error("Non-JSON error response from /api/woocommerce/categories (rules page):", responseText);
                }
                throw new Error(errorMessage);
            }
            const data: WooCommerceCategory[] = await response.json();
            setWooCategories(data);
        } catch (error) {
            console.error("Error fetching WooCommerce categories for rules page display:", error);
            toast({
                title: "Error al Cargar Categorías para Visualización",
                description: (error as Error).message || "No se pudieron cargar las categorías para mostrar en la tabla de reglas.",
                variant: "destructive",
            });
        } finally {
            setIsLoadingCategories(false);
        }
    };
    fetchWooCategories();
  }, [toast]);

  useEffect(() => {
    setIsLoading(true);
    const q = query(collection(db, AUTOMATION_RULES_COLLECTION), orderBy("createdAt", "desc"));

    const unsubscribe = onSnapshot(q, (querySnapshot) => {
      const fetchedRules: AutomationRule[] = [];
      querySnapshot.forEach((doc) => {
        fetchedRules.push({ id: doc.id, ...doc.data() } as AutomationRule);
      });
      setRules(fetchedRules);
      setIsLoading(false);
    }, (error) => {
      console.error("Error fetching rules: ", error);
      toast({
        title: "Error al Cargar Reglas",
        description: "No se pudieron obtener las reglas desde la base de datos.",
        variant: "destructive",
      });
      setIsLoading(false);
    });

    return () => unsubscribe();
  }, [toast]);

  const handleAddNewRule = () => {
    setCurrentRule(null);
    setIsDialogOpen(true);
  };

  const handleEditRule = (rule: AutomationRule) => {
    setCurrentRule(rule);
    setIsDialogOpen(true);
  };

  const handleCloseDialog = () => {
    setIsDialogOpen(false);
    setCurrentRule(null);
  };

  const handleSaveRule = async (data: AutomationRuleFormValues) => {
    setIsSubmitting(true);
    try {
      const ruleData = {
        ...data,
        categoryToAssign: data.categoryToAssign === NO_CATEGORY_VALUE ? "" : data.categoryToAssign,
        tagsToAssign: data.tagsToAssign || "",
        updatedAt: serverTimestamp(),
      };

      if (currentRule) {
        // Update existing rule
        const ruleRef = doc(db, AUTOMATION_RULES_COLLECTION, currentRule.id);
        await updateDoc(ruleRef, ruleData);
        toast({ title: "Regla Actualizada", description: `La regla "${data.name}" ha sido actualizada.` });
      } else {
        // Create new rule
        await addDoc(collection(db, AUTOMATION_RULES_COLLECTION), {
          ...ruleData,
          createdAt: serverTimestamp(),
        });
        toast({ title: "Regla Creada", description: `La regla "${data.name}" ha sido creada.` });
      }
      handleCloseDialog();
    } catch (error) {
      console.error("Error saving rule: ", error);
      toast({
        title: "Error al Guardar Regla",
        description: "Ocurrió un error al guardar la regla. Inténtalo de nuevo.",
        variant: "destructive",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const openDeleteConfirmDialog = (rule: AutomationRule) => {
    setRuleToDelete(rule);
  };

  const handleDeleteRule = async () => {
    if (!ruleToDelete) return;
    setIsSubmitting(true);
    try {
      await deleteDoc(doc(db, AUTOMATION_RULES_COLLECTION, ruleToDelete.id));
      toast({ title: "Regla Eliminada", description: `La regla "${ruleToDelete.name}" ha sido eliminada.` });
      setRuleToDelete(null);
    } catch (error) {
      console.error("Error deleting rule: ", error);
      toast({
        title: "Error al Eliminar Regla",
        description: "Ocurrió un error al eliminar la regla. Inténtalo de nuevo.",
        variant: "destructive",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const getCategoryLabel = (categorySlug?: string) => {
    if (!categorySlug || categorySlug === NO_CATEGORY_VALUE) return "Ninguna";
    if (isLoadingCategories) return categorySlug; // Show slug while loading
    const category = wooCategories.find(c => c.slug === categorySlug);
    return category?.name || categorySlug; // Fallback to slug if not found
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
            <h1 className="text-3xl font-bold tracking-tight text-foreground font-headline">Reglas de Automatización</h1>
            <p className="text-muted-foreground">Configura reglas para la asignación automática de categorías y etiquetas.</p>
        </div>
        <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
          <DialogTrigger asChild>
            <Button onClick={handleAddNewRule}>
                <PlusCircle className="mr-2 h-4 w-4" /> Nueva Regla
            </Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>{currentRule ? 'Editar Regla' : 'Crear Nueva Regla'}</DialogTitle>
              <DialogDescription>
                {currentRule ? 'Modifica los detalles de tu regla.' : 'Completa el formulario para crear una nueva regla.'}
              </DialogDescription>
            </DialogHeader>
            <RuleForm
              initialData={currentRule}
              onSubmit={handleSaveRule}
              onCancel={handleCloseDialog}
              isSubmitting={isSubmitting}
            />
          </DialogContent>
        </Dialog>
      </div>

      <Card className="shadow-lg rounded-lg">
        <CardHeader className="border-b">
          <CardTitle>Mis Reglas</CardTitle>
          <CardDescription>Aquí se listarán tus reglas de automatización.</CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="min-h-[200px] flex items-center justify-center">
              <Loader2 className="h-12 w-12 text-primary animate-spin" />
            </div>
          ) : rules.length > 0 ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[30%]">Nombre</TableHead>
                  <TableHead>Palabra Clave</TableHead>
                  <TableHead>Categoría</TableHead>
                  <TableHead>Etiquetas</TableHead>
                  <TableHead>Modificado</TableHead>
                  <TableHead className="text-right">Acciones</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rules.map((rule) => (
                  <TableRow key={rule.id}>
                    <TableCell className="font-medium">{rule.name}</TableCell>
                    <TableCell><Badge variant="outline">{rule.keyword}</Badge></TableCell>
                    <TableCell>
                      {rule.categoryToAssign ? <Badge variant="secondary">{getCategoryLabel(rule.categoryToAssign)}</Badge> : <span className="text-muted-foreground text-xs">N/A</span>}
                    </TableCell>
                    <TableCell>
                      {rule.tagsToAssign ?
                        rule.tagsToAssign.split(',').map(tag => tag.trim()).filter(tag => tag).map(tag => (
                          <Badge key={tag} variant="default" className="mr-1 mb-1 bg-accent text-accent-foreground hover:bg-accent/80">{tag}</Badge>
                        )) :
                        <span className="text-muted-foreground text-xs">N/A</span>
                      }
                    </TableCell>
                    <TableCell>{formatDate(rule.updatedAt)}</TableCell>
                    <TableCell className="text-right">
                      <Button variant="ghost" size="icon" className="mr-2 h-8 w-8" title="Editar" onClick={() => handleEditRule(rule)}>
                        <Edit3 className="h-4 w-4" />
                      </Button>
                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <Button variant="ghost" size="icon" className="h-8 w-8" title="Eliminar" onClick={() => openDeleteConfirmDialog(rule)}>
                            <Trash2 className="h-4 w-4 text-destructive" />
                          </Button>
                        </AlertDialogTrigger>
                        {ruleToDelete && ruleToDelete.id === rule.id && (
                          <AlertDialogContent>
                            <AlertDialogHeader>
                              <AlertDialogTitle>¿Estás seguro?</AlertDialogTitle>
                              <AlertDialogDescription>
                                Esta acción no se puede deshacer. Esto eliminará permanentemente la regla "{ruleToDelete.name}".
                              </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                              <AlertDialogCancel onClick={() => setRuleToDelete(null)} disabled={isSubmitting}>Cancelar</AlertDialogCancel>
                              <AlertDialogAction onClick={handleDeleteRule} disabled={isSubmitting} className="bg-destructive hover:bg-destructive/90">
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
              <Cog className="h-16 w-16 text-muted-foreground mb-4" />
              <p className="text-muted-foreground mb-2">Aún no has creado ninguna regla.</p>
              <p className="text-sm text-muted-foreground">Usa el botón "Nueva Regla" para empezar.</p>
            </div>
          )}
        </CardContent>
         {rules.length > 0 && !isLoading && (
            <CardFooter className="border-t pt-4 flex justify-end">
                 <p className="text-xs text-muted-foreground">Mostrando {rules.length} reglas.</p>
            </CardFooter>
        )}
      </Card>
    </div>
  );
}
