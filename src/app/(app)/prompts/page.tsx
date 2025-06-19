
"use client";

import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Brain, Edit3, Loader2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { PromptForm } from '@/components/features/prompts/prompt-form';
import type { AiPrompt, AiPromptFormValues } from '@/lib/types';
import { db } from '@/lib/firebase';
import { collection, doc, updateDoc, serverTimestamp, query, orderBy, onSnapshot, setDoc, getDocs } from 'firebase/firestore';
import { useToast } from '@/hooks/use-toast';
import { AI_PROMPTS_COLLECTION, APP_NAME, DEFAULT_PROMPTS } from '@/lib/constants'; // Import defaults from constants

export default function PromptsPage() {
  const [prompts, setPrompts] = useState<AiPrompt[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [currentPrompt, setCurrentPrompt] = useState<AiPrompt | null>(null);

  const { toast } = useToast();

  useEffect(() => {
    setIsLoading(true);
    const q = query(collection(db, AI_PROMPTS_COLLECTION), orderBy("promptKey", "asc"));

    const unsubscribe = onSnapshot(q, async (querySnapshot) => {
      const fetchedPrompts: AiPrompt[] = [];
      querySnapshot.forEach((doc) => {
        fetchedPrompts.push({ id: doc.id, ...doc.data() } as AiPrompt);
      });
      setPrompts(fetchedPrompts);

      if (isLoading) {
          await ensureDefaultPromptsClientSide(fetchedPrompts);
      }

      setIsLoading(false);
    }, (error) => {
      console.error("Error fetching prompts: ", error);
      toast({
        title: "Error al Cargar Prompts",
        description: "No se pudieron obtener los prompts desde la base de datos.",
        variant: "destructive",
      });
      setIsLoading(false);
    });

    return () => unsubscribe();
  }, [toast, isLoading]);

  const ensureDefaultPromptsClientSide = async (currentFirestorePrompts: AiPrompt[]) => {
    console.log('[PromptsPage] Client-side: Ensuring default prompts exist based on current snapshot.');
    const defaultPromptMap = new Map((Object.values(DEFAULT_PROMPTS)).map(p => [p.promptKey, p]));
    const firestorePromptKeys = new Set(currentFirestorePrompts.map(p => p.promptKey));
    let createdCount = 0;

    for (const [key, promptData] of defaultPromptMap.entries()) {
      if (!firestorePromptKeys.has(key)) {
        try {
          const docRef = doc(db, AI_PROMPTS_COLLECTION, promptData.promptKey);
          await setDoc(docRef, {
            ...promptData,
            id: promptData.promptKey,
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          });
          console.log(`[PromptsPage] Client-side: Created missing default prompt in Firestore: ${promptData.promptKey}`);
          createdCount++;
        } catch (error) {
          console.error(`[PromptsPage] Client-side: Error creating default prompt ${promptData.promptKey}:`, error);
        }
      }
    }
    if (createdCount > 0) {
      toast({
        title: "Prompts por Defecto Creados",
        description: `Se crearon ${createdCount} prompts por defecto en Firestore. La lista se actualizará.`,
      });
    }
  };


  const handleEditPrompt = (prompt: AiPrompt) => {
    setCurrentPrompt(prompt);
    setIsDialogOpen(true);
  };

  const handleCloseDialog = () => {
    setIsDialogOpen(false);
    setCurrentPrompt(null);
  };

  const handleSavePrompt = async (data: AiPromptFormValues) => {
    if (!currentPrompt) return;
    setIsSubmitting(true);
    try {
      const { defaultGenerationParamsText, ...formData } = data;
      let defaultGenerationParams = {};
      try {
        defaultGenerationParams = JSON.parse(defaultGenerationParamsText || '{}');
      } catch (e) {
        toast({ title: "Error en Parámetros JSON", description: "Los parámetros de generación por defecto no son un JSON válido.", variant: "destructive" });
        setIsSubmitting(false);
        return;
      }

      const promptRef = doc(db, AI_PROMPTS_COLLECTION, currentPrompt.id);
      await updateDoc(promptRef, {
        ...formData,
        defaultGenerationParams,
        updatedAt: serverTimestamp(),
      });
      toast({ title: "Prompt Actualizado", description: `El prompt "${data.promptKey}" ha sido actualizado.` });
      handleCloseDialog();
    } catch (error) {
      console.error("Error saving prompt: ", error);
      toast({
        title: "Error al Guardar Prompt",
        description: "Ocurrió un error al guardar el prompt. Inténtalo de nuevo.",
        variant: "destructive",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="container mx-auto py-8">
      <div className="flex flex-col md:flex-row justify-between md:items-center gap-4 mb-8">
        <div>
            <h1 className="text-3xl font-bold tracking-tight text-foreground font-headline">Gestión de Prompts de IA</h1>
            <p className="text-muted-foreground">Edita los prompts utilizados por los modelos de IA locales para generar contenido.</p>
        </div>
      </div>

      <Card className="shadow-lg rounded-lg">
        <CardHeader className="border-b">
          <CardTitle>Prompts Configurados</CardTitle>
          <CardDescription>
            Estos son los prompts que {APP_NAME} utiliza. Edítalos con cuidado.
            Los placeholders como <code className="font-code bg-muted px-1 py-0.5 rounded-sm">{`{{productName}}`}</code> se reemplazarán con datos reales.
          </CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="min-h-[200px] flex items-center justify-center">
              <Loader2 className="h-12 w-12 text-primary animate-spin" />
            </div>
          ) : prompts.length > 0 ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[20%]">Clave del Prompt</TableHead>
                  <TableHead className="w-[35%]">Descripción</TableHead>
                  <TableHead>Tipo Modelo</TableHead>
                  <TableHead>Nombre Modelo</TableHead>
                  <TableHead className="text-right">Acciones</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {prompts.map((prompt) => (
                  <TableRow key={prompt.id}>
                    <TableCell className="font-medium font-code">{prompt.promptKey}</TableCell>
                    <TableCell className="text-xs">{prompt.description}</TableCell>
                    <TableCell><Badge variant="outline">{prompt.modelType}</Badge></TableCell>
                    <TableCell><Badge variant="secondary">{prompt.modelName}</Badge></TableCell>
                    <TableCell className="text-right">
                      <Button variant="ghost" size="icon" className="mr-2 h-8 w-8" title="Editar Prompt" onClick={() => handleEditPrompt(prompt)}>
                        <Edit3 className="h-4 w-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : (
            <div className="min-h-[200px] flex flex-col items-center justify-center text-center p-6">
              <Brain className="h-16 w-16 text-muted-foreground mb-4" />
              <p className="text-muted-foreground mb-2">No se encontraron prompts configurados.</p>
              <p className="text-sm text-muted-foreground">Intentando cargar o crear prompts por defecto. Refresca si es necesario.</p>
            </div>
          )}
        </CardContent>
         {prompts.length > 0 && !isLoading && (
            <CardFooter className="border-t pt-4 flex justify-end">
                 <p className="text-xs text-muted-foreground">Mostrando {prompts.length} prompts.</p>
            </CardFooter>
        )}
      </Card>

      {currentPrompt && (
        <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
          <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Editar Prompt: <span className="font-code">{currentPrompt.promptKey}</span></DialogTitle>
              <DialogDescription>
                Modifica la plantilla, modelo y parámetros para este prompt.
                Placeholders disponibles: <code className="font-code text-xs bg-muted p-0.5 rounded-sm">{`{{productName}}`}</code>, <code className="font-code text-xs bg-muted p-0.5 rounded-sm">{`{{visualTagsString}}`}</code>, <code className="font-code text-xs bg-muted p-0.5 rounded-sm">{`{{categoryString}}`}</code>, <code className="font-code text-xs bg-muted p-0.5 rounded-sm">{`{{existingKeywordsString}}`}</code>, <code className="font-code text-xs bg-muted p-0.5 rounded-sm">{`{{attributesString}}`}</code>, <code className="font-code text-xs bg-muted p-0.5 rounded-sm">{`{{shortDescriptionInput}}`}</code>.
              </DialogDescription>
            </DialogHeader>
            <PromptForm
              initialData={{
                ...currentPrompt,
                defaultGenerationParamsText: JSON.stringify(currentPrompt.defaultGenerationParams || {}, null, 2),
              }}
              onSubmit={handleSavePrompt}
              onCancel={handleCloseDialog}
              isSubmitting={isSubmitting}
            />
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}
