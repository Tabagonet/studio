
"use client";

import { useState, useEffect, useCallback } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Brain, Info, Save, Loader2, KeyRound } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { auth, onAuthStateChanged } from "@/lib/firebase";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";


const PROMPT_CONFIG = {
    productDescription: {
        label: "Generación de Producto",
        default: `You are an expert e-commerce copywriter and SEO specialist.
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

Generate the complete JSON object based on your research of "{{productName}}".`
    },
    adPlan: {
        label: "Plan de Publicidad",
        default: `Eres un estratega senior de marketing digital. Tu tarea es analizar una URL y un objetivo de negocio para crear un plan de publicidad profesional.
Tu respuesta DEBE ser un único objeto JSON válido.

**Contexto:**
- URL: {{url}}
- Objetivos de la Campaña: {{#each objectives}}- {{this}} {{/each}}

**Instrucciones del Plan:**
1.  **executive_summary:** Resume la estrategia general en 2-3 párrafos.
2.  **target_audience:** Describe al público objetivo detalladamente (demografía, intereses, puntos de dolor).
3.  **strategies:** Propón estrategias para cada plataforma.
    -   "platform": ej. Google Ads, Meta Ads.
    -   "strategy_rationale": Justifica por qué esta plataforma es adecuada.
    -   "funnel_stage": (Awareness, Consideration, Conversion).
    -   "campaign_type": ej. Performance Max, Búsqueda, Shopping.
    -   "ad_formats": ej. Video, Carrusel.
    -   "monthly_budget": número.
4.  **total_monthly_budget:** Suma de todos los presupuestos.
5.  **calendar:** Crea un plan para 3 meses.
    - "month": Mes 1, 2, 3.
    - "focus": ej. Configuración y Lanzamiento.
    - "actions": Lista de acciones concretas.
6.  **kpis:** Lista de KPIs clave (ej. ROAS, CPA, CTR).
7.  **fee_proposal:** Propuesta de honorarios.
    - "setup_fee": número.
    - "management_fee": número.
    - "fee_description": Qué incluyen los honorarios.
`
    }
};

type PromptKey = keyof typeof PROMPT_CONFIG;

export default function PromptsPage() {
    const [prompt, setPrompt] = useState("");
    const [isSaving, setIsSaving] = useState(false);
    const [isLoading, setIsLoading] = useState(true);
    const [selectedPromptKey, setSelectedPromptKey] = useState<PromptKey>('productDescription');
    const { toast } = useToast();

    const fetchPrompt = useCallback(async (user: any, key: PromptKey) => {
        if (!user) {
            setPrompt(PROMPT_CONFIG[key].default);
            setIsLoading(false);
            return;
        }
        setIsLoading(true);
        try {
            const token = await user.getIdToken();
            const response = await fetch(`/api/user-settings/prompt?key=${key}`, {
                headers: { 'Authorization': `Bearer ${token}` }
            });

            if (response.ok) {
                const data = await response.json();
                setPrompt(data.prompt || PROMPT_CONFIG[key].default);
            } else {
                setPrompt(PROMPT_CONFIG[key].default);
            }
        } catch (error) {
            console.error("Error fetching custom prompt:", error);
            setPrompt(PROMPT_CONFIG[key].default);
        } finally {
            setIsLoading(false);
        }
    }, []);
    
    useEffect(() => {
        const handleAuthChange = (user: any) => {
            if (user) {
                fetchPrompt(user, selectedPromptKey);
            } else {
                setPrompt(PROMPT_CONFIG[selectedPromptKey].default);
                setIsLoading(false);
            }
        };
        const unsubscribe = onAuthStateChanged(auth, handleAuthChange);
        return () => unsubscribe();
    }, [selectedPromptKey, fetchPrompt]);


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
                body: JSON.stringify({ prompt, promptKey: selectedPromptKey })
            });

            const result = await response.json();
            if (!response.ok) {
                throw new Error(result.error || result.message || 'Error al guardar la plantilla');
            }

            toast({
                title: "Plantilla Guardada",
                description: `Tu plantilla para "${PROMPT_CONFIG[selectedPromptKey].label}" ha sido actualizada.`,
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
                        <CardDescription>Personaliza las instrucciones que recibe la IA para cada funcionalidad de la aplicación.</CardDescription>
                    </div>
                </div>
            </CardHeader>
        </Card>

        <Alert>
            <Info className="h-4 w-4" />
            <AlertTitle>¿Cómo funciona esto?</AlertTitle>
            <AlertDescription>
                <p>Usa el selector para elegir qué plantilla de IA deseas editar. Cada plantilla se guarda de forma independiente y se utiliza en su respectiva sección de la aplicación.</p>
                <p className="mt-2">{`Utiliza placeholders como`} <code className="font-code bg-muted px-1 py-0.5 rounded-sm">{`{{productName}}`}</code> {`en la plantilla de productos, o`} <code className="font-code bg-muted px-1 py-0.5 rounded-sm">{`{{url}}`}</code> {`en la del planificador. El sistema los reemplazará con los datos correspondientes.`}</p>
            </AlertDescription>
        </Alert>

        <Card>
            <CardHeader>
                 <Label htmlFor="prompt-selector">Selecciona la Plantilla a Editar</Label>
                 <Select value={selectedPromptKey} onValueChange={(value) => setSelectedPromptKey(value as PromptKey)} disabled={isLoading || isSaving}>
                    <SelectTrigger id="prompt-selector" className="w-full md:w-1/3">
                        <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                        {Object.entries(PROMPT_CONFIG).map(([key, { label }]) => (
                            <SelectItem key={key} value={key}>{label}</SelectItem>
                        ))}
                    </SelectContent>
                 </Select>
            </CardHeader>
            <CardContent className="space-y-4">
                 <div>
                     {isLoading ? (
                        <div className="mt-2 flex h-[400px] w-full items-center justify-center rounded-md border border-dashed">
                             <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                             <p className="ml-2 text-muted-foreground">Cargando plantilla...</p>
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
                        {isSaving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
                        {isSaving ? "Guardando..." : "Guardar Plantilla"}
                    </Button>
                </div>
            </CardContent>
        </Card>
    </div>
  );
}
