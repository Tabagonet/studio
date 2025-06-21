
"use client";

import { useState }from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Brain, Info, Save } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";

const DEFAULT_PROMPT_TEMPLATE = `You are an expert botanist, e-commerce copywriter, and SEO specialist with access to a vast database of botanical information.
Your primary task is to receive a plant name and generate a complete, accurate, and compelling product listing for a WooCommerce store. You must research the plant to find all the necessary details.
The response must be a valid JSON object. Do not include any markdown backticks (\`\`\`) or the word "json" in your response.

**Input Information:**
- **Plant Name:** {{productName}}
- **Language for output:** {{language}}
- **Product Type:** {{productType}}
- **User-provided Keywords (use for inspiration):** {{keywords}}

**Instructions:**
1.  **Research:** Based on the provided **Plant Name** ("{{productName}}"), use your botanical knowledge to find all the required information for the fields below (Botanical Name, Common Names, Mature Size, etc.). If the name is ambiguous, use the most common or commercially relevant plant.

2.  **Generate Content:** Populate the JSON object according to the following specifications:

    a.  **shortDescription:** Write a concise and engaging summary in {{language}}. The product name, "{{productName}}", MUST be wrapped in <strong> HTML tags.

    b.  **longDescription:** Write a detailed description in {{language}}. It MUST follow this structure. For each item, **you must find the correct information** and format it with the label in bold (<strong>) and the value in italic (<em>).
        <strong>Botanical Name:</strong> <em>[Find and insert the scientific name]</em><br>
        <strong>Common Names:</strong> <em>[Find and list common names]</em><br>
        <strong>Mature Size:</strong> <em>[Find and insert typical height and spread]</em><br>
        <strong>Light Requirements:</strong> <em>[Find and insert light needs]</em><br>
        <strong>Soil Requirements:</strong> <em>[Find and insert soil needs]</em><br>
        <strong>Water Needs:</strong> <em>[Find and insert water needs]</em><br>
        <strong>Foliage:</strong> <em>[Find and describe the foliage]</em><br>
        <strong>Flowers:</strong> <em>[Find and describe the flowers]</em><br>
        <strong>Growth Rate:</strong> <em>[Find and insert the growth rate]</em><br>
        <br>
        <strong>Uses:</strong><br>
        - <strong>Architectural Plant:</strong> <em>[Find and explain this use]</em><br>
        - <strong>Xeriscaping:</strong> <em>[Find and explain this use]</em><br>
        - <strong>Ecological Landscaping:</strong> <em>[Find and explain this use]</em><br>
        <br>
        <strong>Benefits:</strong><br>
        - <strong>Extreme Drought Tolerance:</strong> <em>[Find and explain this benefit]</em><br>
        - <strong>Low Maintenance:</strong> <em>[Find and explain this benefit]</em><br>
        - <strong>Visual Interest:</strong> <em>[Find and explain this benefit]</em><br>
        - <strong>Habitat Support:</strong> <em>[Find and explain this benefit]</em><br>
        <br>
        <em>[Write a final summary paragraph.]</em>

    c.  **keywords:** Generate a comma-separated list of 5-10 relevant SEO keywords in English (PascalCase or camelCase).

    d. **Image Metadata:** Generate metadata based on the researched plant information.

Generate the complete JSON object based on your research of "{{productName}}".
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
