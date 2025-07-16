"use client";

import { useState, useEffect, useCallback } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Brain, Info, Save, Loader2, RotateCcw } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { auth, onAuthStateChanged } from "@/lib/firebase";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";


const PROMPT_CONFIG = {
    productDescription: {
        label: "WooCommerce: Generación de Producto",
        default: `You are an expert e-commerce copywriter and SEO specialist.
Your primary task is to receive product information and generate a complete, accurate, and compelling product listing for a WooCommerce store.
The response must be a valid JSON object. Do not include any markdown backticks (\`\`\`) or the word "json" in your response.

**Input Information:**
- **Product Name:** {{productName}}
- **Language for output:** {{language}}
- **Product Type:** {{productType}}
- **User-provided Keywords (for inspiration):** {{keywords}}
- **Contained Products (for "Grouped" type only):**
{{{groupedProductsList}}}

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
        label: "Marketing: Plan de Publicidad",
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
    },
    blogGeneration: {
        label: "Blog: Generar desde Tema",
        default: `You are a professional blog writer and SEO specialist. Your task is to generate a blog post based on a given topic. The response must be a single, valid JSON object with four keys: 'title' (an engaging, SEO-friendly headline), 'content' (a well-structured blog post of at least 400 words, using HTML tags like <h2>, <p>, <ul>, <li>, and <strong> for formatting. All paragraphs (<p> tags) MUST be styled with text-align: justify; for example: <p style="text-align: justify;">Your paragraph here.</p>), 'suggestedKeywords' (a comma-separated string of 5-7 relevant, SEO-focused keywords), and 'metaDescription' (a compelling summary of around 150 characters for search engines). Do not include markdown or the word 'json' in your output.\n\nGenerate a blog post.\nTopic: "{{topic}}"\nInspiration Keywords: "{{keywords}}"\nLanguage: {{language}}`
    },
    blogEnhancement: {
        label: "Blog: Mejorar Contenido",
        default: `You are an expert SEO copywriter. Your task is to analyze a blog post's title and content and rewrite them to be more engaging, clear, and SEO-optimized. Return a single, valid JSON object with two keys: 'title' and 'content'. The content should preserve the original HTML tags. Do not include markdown or the word 'json' in your output.\n\nRewrite and improve the title and content in {{language}} for this blog post.\nOriginal Title: "{{existingTitle}}"\nOriginal Content:\n---\n{{{existingContent}}}\n---`
    },
    titleSuggestion: {
        label: "Blog: Sugerir Títulos",
        default: `You are an expert SEO and content strategist. Based on the provided keyword, generate 5 creative, engaging, and SEO-friendly blog post titles. Return a single, valid JSON object with one key: 'titles', which is an array of 5 string titles. Do not include markdown or the word 'json' in your output.\n\nGenerate 5 blog post titles in {{language}} for the keyword: "{{ideaKeyword}}"`
    },
    keywordSuggestion: {
        label: "Blog: Sugerir Palabras Clave",
        default: `You are an expert SEO specialist. Based on the following blog post title and content, generate a list of relevant, SEO-focused keywords. Return a single, valid JSON object with one key: 'suggestedKeywords' (a comma-separated string of 5-7 relevant keywords). Do not include markdown or the word 'json' in your output.\n\nGenerate SEO keywords for this blog post in {{language}}.\nTitle: "{{existingTitle}}"\nContent:\n---\n{{{existingContent}}}\n---`
    },
    batchSeoMeta: {
        label: "Acción Lote: Título y Descripción SEO",
        default: `You are an expert SEO copywriter. Your task is to analyze the title and content of a web page and generate optimized SEO metadata.
Respond with a single, valid JSON object with two keys: "title" and "metaDescription".

**Constraints:**
- The "title" must be under 60 characters.
- The "metaDescription" must be under 160 characters.
- Both must be in the same language as the provided content.

**Content for Analysis:**
- Language: {{language}}
- Title: "{{title}}"
- Content Snippet: "{{contentSnippet}}"

Generate the SEO metadata now.`,
    },
    linkSuggestion: {
        label: "Blog: Sugerir Enlaces Internos",
        default: `You are an expert SEO specialist, skilled in creating effective internal linking strategies. Your task is to analyze an article's content and a list of potential link targets from the same website. Identify the most relevant and natural opportunities to add internal links. The response must be a single, valid JSON object with one key "suggestions", containing an array of up to 5 high-quality internal link suggestions.\n\n**Instructions:**\n1.  Read the "currentContent" carefully.\n2.  Review the "potentialTargets" list, which contains the titles and URLs of other pages on the site.\n3.  Find specific phrases or keywords in the "currentContent" that would naturally link to one of the "potentialTargets".\n4.  Do NOT suggest linking a phrase that is already inside an <a> HTML tag.\n5.  Prioritize relevance and user experience. The link should provide value to the reader.\n6.  Return a list of up to 5 of the best link suggestions. For each suggestion, provide the exact phrase to link from the original text, and the corresponding target URL and title.\n\n**Content to Analyze:**\n---\n{{{currentContent}}}\n---\n\n**Available pages to link to:**\n---\n{{#each potentialTargets}}\n- Title: {{{this.title}}}\n- URL: {{{this.link}}}\n{{/each}}\n---`
    },
    seoTechnicalAnalysis: {
        label: "SEO: Análisis Técnico",
        default: `Analiza el siguiente contenido de una página web para optimización SEO (On-Page) y responde únicamente con un objeto JSON válido.\n\n**Datos de la Página:**\n- Título SEO: "{{title}}"\n- Meta Descripción: "{{metaDescription}}"\n- Palabra Clave Principal: "{{focusKeyword}}"\n- URL Canónica: "{{canonicalUrl}}"\n- Total de Imágenes: {{images.length}}\n- Imágenes sin 'alt': {{imagesWithoutAlt}}\n- Encabezado H1: "{{h1}}"\n- Primeros 300 caracteres del contenido: "{{textContent}}"\n\n**Instrucciones:**\nEvalúa cada uno de los siguientes puntos y devuelve un valor booleano (true/false) para cada uno en el objeto "checks". Además, proporciona sugerencias en el objeto "suggested".\n\n**"checks":**\n1. "titleContainsKeyword": ¿Contiene el "Título SEO" la "Palabra Clave Principal"?\n2. "titleIsGoodLength": ¿Tiene el "Título SEO" entre 30 y 65 caracteres?\n3. "metaDescriptionContainsKeyword": ¿Contiene la "Meta Descripción" la "Palabra Clave Principal"?\n4. "metaDescriptionIsGoodLength": ¿Tiene la "Meta Descripción" entre 50 y 160 caracteres?\n5. "keywordInFirstParagraph": ¿Contienen los "Primeros 300 caracteres del contenido" la "Palabra Clave Principal"?\n6. "contentHasImages": ¿Es el "Total de Imágenes" mayor que 0?\n7. "allImagesHaveAltText": ¿Es el número de "Imágenes sin 'alt'" igual a 0?\n8. "h1Exists": ¿Existe el "Encabezado H1" y no está vacío?\n9. "canonicalUrlExists": ¿Existe la "URL Canónica" y no está vacía?\n\n**"suggested":**\n- "title": Sugiere un "Título SEO" mejorado.\n- "metaDescription": Sugiere una "Meta Descripción" mejorada.\n- "focusKeyword": Sugiere la "Palabra Clave Principal" más apropiada para el contenido.`
    },
    seoInterpretation: {
        label: "SEO: Interpretación de Informe",
        default: `You are a world-class SEO consultant analyzing a web page's on-page SEO data. The user has received the following raw data from an analysis tool. Your task is to interpret this data and provide a clear, actionable summary in Spanish. 

Generate a JSON object with four keys: "interpretation", "actionPlan", "positives", "improvements".

-   **"interpretation"**: A narrative paragraph in Spanish explaining the most important SEO data points in a simple, easy-to-understand way.
-   **"actionPlan"**: An array of strings, where each string is a specific, actionable step to improve the page's SEO. Provide 3-5 steps.
-   **"positives"**: An array of strings, where each string is a key SEO strength of the page. Provide 2-4 strengths.
-   **"improvements"**: An array of strings, where each string is a key area for SEO improvement. Provide 2-4 areas.

The values for "actionPlan", "positives", and "improvements" MUST be arrays of strings, even if there is only one item.

**Analysis Data:**
- Page Title: "{{title}}"
- Meta Description: "{{metaDescription}}"
- H1 Heading: "{{h1}}"
- SEO Score: {{score}}/100
- Technical SEO Checks (true = passed, false = failed):
{{{checksSummary}}}`
    },
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
    
    const handleResetToDefault = () => {
        const defaultPrompt = PROMPT_CONFIG[selectedPromptKey].default;
        setPrompt(defaultPrompt);
        toast({
            title: "Plantilla Restaurada",
            description: "Se ha cargado la plantilla original en el editor. Haz clic en Guardar para aplicarla.",
        });
    };

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
                    <SelectTrigger id="prompt-selector" className="w-full md:w-1/2">
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
                <div className="flex flex-col sm:flex-row justify-end gap-2">
                    <Button onClick={handleResetToDefault} variant="outline" disabled={isSaving || isLoading}>
                        <RotateCcw className="mr-2 h-4 w-4" />
                        Restaurar Plantilla
                    </Button>
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
