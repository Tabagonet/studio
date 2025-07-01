
"use client";

import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Brain, Info, Save, Loader2, KeyRound } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { auth, onAuthStateChanged } from "@/lib/firebase";

// This default template is a fallback if no prompt is found for a connection.
const DEFAULT_PROMPT_TEMPLATE = `You are an expert e-commerce copywriter and SEO specialist.
Your primary task is to receive product information and generate a complete, accurate, and compelling product listing for a WooCommerce store.
The response must be a valid JSON object. Do not include any markdown backticks (\`\`\`) or the word "json" in your response.

**Input Information:**
- **Product Name:** {{productName}}
- **Language for output:** {{language}}
- **Product Type:** {{productType}}
- **User-provided Keywords (for inspiration):** {{keywords}}
- **Contained Products (for "Grouped" type only):**
{{groupedProductsList}}

**Instructions:**
Generate a JSON object with the following keys. Adapt the content to the product name provided.

a.  **"shortDescription":** A concise and engaging summary in {{language}}.
b.  **"longDescription":** A detailed description in {{language}}. Use HTML tags like <strong>, <em>, and <br> for formatting.
c.  **"keywords":** A comma-separated list of 5-10 relevant SEO keywords in English.
d.  **"imageTitle":** A concise, SEO-friendly title for product images.
e.  **"imageAltText":** A descriptive alt text for SEO.
f.  **"imageCaption":** An engaging caption for the image.
g.  **"imageDescription":** A detailed description for the image media library entry.

Generate the complete JSON object based on your research of "{{productName}}".`;


export default function PromptsPage() {
    const [prompt, setPrompt] = useState("");
    const [isSaving, setIsSaving] = useState(false);
    const [isLoading, setIsLoading] = useState(true);
    const { toast } = useToast();
    const [activeConnectionKey, setActiveConnectionKey] = useState<string | null>(null);

    const fetchPromptForActiveConnection = async (user: any) => {
        if (!user) {
            setPrompt(DEFAULT_PROMPT_TEMPLATE);
            setIsLoading(false);
            return;
        }
        setIsLoading(true);
        try {
            const token = await user.getIdToken();
            // This API now intelligently returns the prompt for the ACTIVE connection
            const response = await fetch('/api/user-settings/prompt', {
                headers: { 'Authorization': `Bearer ${token}` }
            });

            if (response.ok) {
                const data = await response.json();
                setPrompt(data.prompt || DEFAULT_PROMPT_TEMPLATE);
                setActiveConnectionKey(data.activeConnectionKey); // The API now also returns the key for context
            } else {
                setPrompt(DEFAULT_PROMPT_TEMPLATE);
                setActiveConnectionKey(null);
            }
        } catch (error) {
            console.error("Error fetching custom prompt:", error);
            toast({
                title: "Error al cargar plantilla",
                description: "No se pudo cargar la plantilla. Se usará la plantilla por defecto.",
                variant: "destructive"
            });
             setPrompt(DEFAULT_PROMPT_TEMPLATE);
             setActiveConnectionKey(null);
        } finally {
            setIsLoading(false);
        }
    };
    
    // Listen for auth changes and for our custom event when the connection is switched in the header
    useEffect(() => {
        const unsubscribe = onAuthStateChanged(auth, fetchPromptForActiveConnection);
        window.addEventListener('connections-updated', () => fetchPromptForActiveConnection(auth.currentUser));

        return () => {
            unsubscribe();
            window.removeEventListener('connections-updated', () => fetchPromptForActiveConnection(auth.currentUser));
        };
    }, []);


    const handleSave = async () => {
        setIsSaving(true);
        const user = auth.currentUser;
        if (!user) {
            toast({ title: "Error de autenticación", variant: "destructive" });
            setIsSaving(false);
            return;
        }

        try {
            const token = await user.getIdToken();
            const response = await fetch('/api/user-settings/prompt', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify({ prompt })
            });

            const result = await response.json();
            if (!response.ok) {
                throw new Error(result.error || result.message || 'Error al guardar la plantilla');
            }

            toast({
                title: "Plantilla Guardada",
                description: `Tu plantilla para la conexión "${result.activeConnectionKey}" ha sido actualizada.`,
            });
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            toast({
                title: "Error al Guardar",
                description: errorMessage,
                variant: "destructive",
            });
        } finally {
            setIsSaving(false);
        }
    }

  return (
    <div className="container mx-auto py-8 space-y-8">
        <Card>
            <CardHeader>
                <div className="flex items-center space-x-3">
                    <Brain className="h-8 w-8 text-primary" />
                    <div>
                        <CardTitle>Gestión de Prompts de IA</CardTitle>
                        <CardDescription>Personaliza las instrucciones que recibe la IA para cada una de tus conexiones.</CardDescription>
                    </div>
                </div>
            </CardHeader>
        </Card>

        <Alert>
            <Info className="h-4 w-4" />
            <AlertTitle>¿Cómo funciona esto?</AlertTitle>
            <AlertDescription>
                <p>Aquí puedes editar la plantilla de "prompt" que se envía a la IA para generar el contenido de tus productos.</p>
                <p className="mt-2 font-semibold">
                  Esta plantilla se guarda para la conexión que tienes activa actualmente. Si cambias de tienda en la cabecera, verás la plantilla correspondiente a esa otra conexión.
                </p>
                <p className="mt-2">{`Utiliza placeholders como`} <code className="font-code bg-muted px-1 py-0.5 rounded-sm">{`{{productName}}`}</code>, <code className="font-code bg-muted px-1 py-0.5 rounded-sm">{`{{productType}}`}</code>, <code className="font-code bg-muted px-1 py-0.5 rounded-sm">{`{{keywords}}`}</code>, <code className="font-code bg-muted px-1 py-0.5 rounded-sm">{`{{language}}`}</code>, y <code className="font-code bg-muted px-1 py-0.5 rounded-sm">{`{{groupedProductsList}}`}</code>. {`El sistema los reemplazará con los datos del producto.`}</p>
            </AlertDescription>
        </Alert>

        <Card>
            <CardHeader>
                <CardTitle>Editor de Plantilla</CardTitle>
                 {activeConnectionKey && (
                    <CardDescription className="!mt-2 flex items-center gap-2 text-sm">
                        <KeyRound className="h-4 w-4 text-muted-foreground" />
                        Editando plantilla para la conexión: <code className="font-semibold text-foreground">{activeConnectionKey}</code>
                    </CardDescription>
                )}
                 {!activeConnectionKey && !isLoading && (
                    <CardDescription className="!mt-2 flex items-center gap-2 text-sm text-amber-600">
                        <Info className="h-4 w-4" />
                        No hay ninguna conexión activa. Se muestra y guardará la plantilla por defecto.
                    </CardDescription>
                 )}
            </CardHeader>
            <CardContent className="space-y-4">
                <div>
                     {isLoading ? (
                        <div className="mt-2 flex h-[400px] w-full items-center justify-center rounded-md border border-dashed">
                             <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                             <p className="ml-2 text-muted-foreground">Cargando plantilla para la conexión activa...</p>
                        </div>
                    ) : (
                        <Textarea 
                            id="prompt-template"
                            value={prompt}
                            onChange={(e) => setPrompt(e.target.value)}
                            className="mt-2 font-code min-h-[400px] text-sm"
                            placeholder="Introduce tu prompt de IA aquí..."
                        />
                    )}
                </div>
                <div className="flex justify-end">
                    <Button onClick={handleSave} disabled={isSaving || isLoading}>
                        {isSaving ? (
                            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        ) : (
                            <Save className="mr-2 h-4 w-4" />
                        )}
                        {isSaving ? "Guardando..." : "Guardar Plantilla"}
                    </Button>
                </div>
            </CardContent>
        </Card>
    </div>
  );
}
