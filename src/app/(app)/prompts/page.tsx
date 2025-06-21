
"use client";

import { useState }from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Brain, Info, Save } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";

const DEFAULT_PROMPT_TEMPLATE = `You are an expert e-commerce copywriter and SEO specialist.
Your task is to generate compelling and optimized product descriptions and keywords for a WooCommerce store.
The response must be a valid JSON object.

**Product Information:**
- **Name:** {{productName}}
- **Type:** {{productType}}
- **Existing Keywords (use as inspiration):** {{keywords}}

**Instructions:**
1.  **shortDescription:** Write a concise and engaging summary in Spanish. This should immediately grab the customer's attention and is crucial for search result snippets.
2.  **longDescription:** Write a detailed and persuasive description in Spanish.
    - Start with an enticing opening.
    - Elaborate on the features and, more importantly, the benefits for the customer.
    - Use the provided keywords naturally throughout the text to improve SEO.
    - Structure the description with clear paragraphs. Avoid long walls of text.
    - Maintain a professional but approachable tone.
3.  **keywords:** Generate a comma-separated list of 5 to 10 highly relevant SEO keywords in Spanish. These should be specific and useful for finding the product.

Generate the JSON object based on the provided information.
`;


export default function PromptsPage() {
    const [prompt, setPrompt] = useState(DEFAULT_PROMPT_TEMPLATE);
    const { toast } = useToast();

    const handleSave = () => {
        toast({
            title: "Función en desarrollo",
            description: "La capacidad de guardar y utilizar prompts personalizados se implementará próximamente.",
        });
    }

  return (
    <div className="container mx-auto py-8 space-y-8">
        <Card>
            <CardHeader>
                <div className="flex items-center space-x-3">
                    <Brain className="h-8 w-8 text-primary" />
                    <div>
                        <CardTitle>Gestión de Prompts de IA</CardTitle>
                        <CardDescription>Personaliza las instrucciones que recibe la IA para generar contenido.</CardDescription>
                    </div>
                </div>
            </CardHeader>
        </Card>

        <Alert>
            <Info className="h-4 w-4" />
            <AlertTitle>¿Cómo funciona esto?</AlertTitle>
            <AlertDescription>
                <p>Aquí puedes editar la plantilla de "prompt" que se envía al modelo de IA (Gemini) para generar el contenido de tus productos. Puedes ajustar el tono, el estilo y las instrucciones para que se adapten mejor a tu marca.</p>
                <p className="mt-2">Utiliza placeholders como <code className="font-code bg-muted px-1 py-0.5 rounded-sm">{{productName}}</code>, <code className="font-code bg-muted px-1 py-0.5 rounded-sm">{{productType}}</code> y <code className="font-code bg-muted px-1 py-0.5 rounded-sm">{{keywords}}</code>. El sistema los reemplazará con los datos del producto correspondiente en cada solicitud.</p>
                <p className="mt-2 font-semibold">Nota: La estructura de salida JSON no es editable desde aquí para garantizar la compatibilidad.</p>
            </AlertDescription>
        </Alert>

        <Card>
            <CardHeader>
                <CardTitle>Editor de Plantilla</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
                <div>
                    <Label htmlFor="prompt-template" className="text-base">Prompt para generar descripciones y palabras clave</Label>
                    <Textarea 
                        id="prompt-template"
                        value={prompt}
                        onChange={(e) => setPrompt(e.target.value)}
                        className="mt-2 font-code min-h-[400px] text-sm"
                        placeholder="Introduce tu prompt de IA aquí..."
                    />
                </div>
                <div className="flex justify-end">
                    <Button onClick={handleSave} disabled>
                        <Save className="mr-2 h-4 w-4" />
                        Guardar Plantilla
                    </Button>
                </div>
            </CardContent>
        </Card>
    </div>
  );
}
