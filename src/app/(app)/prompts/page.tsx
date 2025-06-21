
"use client";

import { useState }from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Brain, Info, Save } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";

const DEFAULT_PROMPT_TEMPLATE = `You are an expert botanist, e-commerce copywriter, and SEO specialist.
Your task is to generate compelling and optimized product descriptions and keywords for a plant product for a WooCommerce store.
The response must be a valid JSON object.

**Product Information:**
- **Name:** {{productName}}
- **Type:** {{productType}}
- **Language for output:** {{language}}
- **Existing Keywords (use as inspiration):** {{keywords}}

**Instructions:**
1.  **shortDescription:** Write a concise and engaging summary in {{language}}. It MUST start with the product name in bold using HTML 'strong' tags (e.g., "<strong>Agave avellanidens</strong> is a..."). Highlight 2-3 key benefits.

2.  **longDescription:** Write a detailed description in {{language}}. It MUST follow this structure, using HTML 'strong' tags for all labels and 'em' tags for all values. Use newline characters for line breaks.
    <strong>Botanical Name:</strong> <em>[Scientific name of the plant]</em>
    <strong>Common Names:</strong> <em>[List of common names, comma separated]</em>
    <strong>Mature Size:</strong> <em>[Typical height and spread]</em>
    <strong>Light Requirements:</strong> <em>[e.g., Full sun]</em>
    <strong>Soil Requirements:</strong> <em>[e.g., Well-drained]</em>
    <strong>Water Needs:</strong> <em>[e.g., Low]</em>
    <strong>Foliage:</strong> <em>[Description of leaves]</em>
    <strong>Flowers:</strong> <em>[Description of flowers]</em>
    <strong>Growth Rate:</strong> <em>[e.g., Moderate]</em>

    <strong>Uses:</strong>
    - <strong>Architectural Plant:</strong> <em>[Brief explanation of this use]</em>
    - <strong>Xeriscaping:</strong> <em>[Brief explanation of this use]</em>
    - <strong>Ecological Landscaping:</strong> <em>[Brief explanation of this use]</em>

    <strong>Benefits:</strong>
    - <strong>Extreme Drought Tolerance:</strong> <em>[Brief explanation of this benefit]</em>
    - <strong>Low Maintenance:</strong> <em>[Brief explanation of this benefit]</em>
    - <strong>Visual Interest:</strong> <em>[Brief explanation of this benefit]</em>
    - <strong>Habitat Support:</strong> <em>[Brief explanation of this benefit]</em>

    <em>[Final summary paragraph.]</em>

3.  **keywords:** Generate a comma-separated list of 5-10 SEO keywords/tags in English, using PascalCase or camelCase.
    *Example:* DroughtTolerant,SucculentGarden,Xeriscaping,LowWaterUse,ArchitecturalPlant,BajaCaliforniaNative

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
                <p className="mt-2">Utiliza placeholders como <code className="font-code bg-muted px-1 py-0.5 rounded-sm">{{productName}}</code>, <code className="font-code bg-muted px-1 py-0.5 rounded-sm">{{productType}}</code>, <code className="font-code bg-muted px-1 py-0.5 rounded-sm">{{keywords}}</code>, y <code className="font-code bg-muted px-1 py-0.5 rounded-sm">{{language}}</code>. El sistema los reemplazará con los datos del producto correspondiente en cada solicitud.</p>
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
