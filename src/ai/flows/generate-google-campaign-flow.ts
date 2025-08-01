
'use server';

import { GoogleGenerativeAI, HarmCategory, HarmBlockThreshold } from '@google/generative-ai';
import { type GenerateGoogleCampaignInput, GoogleAdsCampaign, GoogleAdsCampaignSchema } from '@/app/(app)/ad-planner/schema';
import Handlebars from 'handlebars';

const GOOGLE_CAMPAIGN_PROMPT = `
Eres un estratega experto en Google Ads de nivel mundial. Tu tarea es crear una estructura de campaña de búsqueda completa, profesional y optimizada para un negocio.
Tu respuesta DEBE ser un único objeto JSON válido, sin comentarios ni markdown.

**Contexto del Negocio:**
- URL del negocio: {{url}}
- Objetivos de la Campaña: {{#each objectives}}- {{this}}{{/each}}
- Perfil del Cliente Ideal (Buyer Persona): {{{buyer_persona}}}
- Propuesta de Valor del Negocio: {{{value_proposition}}}

**Proceso de Generación JSON (Sigue estos pasos y estructura):**

1.  **"campaignName":** (string) Crea un nombre general y descriptivo para la campaña (ej. "Venta Calzado Deportivo Verano", "Servicios de Fontanería Urgente - Madrid").

2.  **"adGroups":** (array de objetos) Genera entre 2 y 5 **grupos de anuncios** distintos. Cada grupo debe estar **altamente enfocado en un único tema o producto específico**. Esto es crucial para la relevancia. Para cada objeto de grupo de anuncios:
    -   **"adGroupName":** (string) Un nombre muy específico y temático para el grupo (ej. "Zapatillas Correr Hombre", "Reparar Fugas 24h").
    -   **"keywords":** (array of strings) Una lista de 5 a 15 palabras clave **muy relacionadas entre sí y con el nombre del grupo**. Incluye concordancias amplias modificadas, de frase y exactas.
    -   **"ads":** (array de objetos) Al menos un objeto de anuncio de texto expandido para este grupo de anuncios.
        -   **"headlines":** (array of strings) De 3 a 5 titulares. Cada uno debe ser **menor de 30 caracteres**. Deben ser relevantes y atractivos.
        -   **"descriptions":** (array of strings) De 2 a 3 descripciones. Cada una debe ser **menor de 90 caracteres**. Deben expandir la información de los titulares e incluir una llamada a la acción.

**Ejemplo de Salida para una tienda de calzado:**
{
  "campaignName": "Venta Calzado Deportivo - Verano 2024",
  "adGroups": [
    {
      "adGroupName": "Zapatillas Correr Hombre",
      "keywords": [
        "comprar zapatillas running hombre", 
        "zapatillas de correr para hombre", 
        "+zapatillas +correr +hombre", 
        "[calzado running hombre]", 
        "mejores zapatillas de correr"
      ],
      "ads": [
        {
          "headlines": ["Zapatillas Running Hombre", "Ofertas en Calzado Deportivo", "Envío Gratis Hoy", "Tu Mejor Marca Personal"],
          "descriptions": ["Encuentra el ajuste perfecto para tus carreras. Amplia selección de las mejores marcas.", "Comodidad y rendimiento en cada paso. Compra ahora y supera tus límites."]
        }
      ]
    },
    {
      "adGroupName": "Sandalias de Mujer",
      "keywords": [
        "sandalias de mujer verano",
        "comprar sandalias de piel",
        "sandalias cómodas mujer",
        "+sandalias +mujer +online"
      ],
      "ads": [
        {
          "headlines": ["Sandalias de Verano Mujer", "Estilo y Comodidad", "Colección Nueva", "Descuentos Exclusivos"],
          "descriptions": ["Descubre nuestra nueva colección de sandalias para mujer. Perfectas para cualquier ocasión.", "Hechas con materiales de calidad para máxima comodidad. ¡Haz tu pedido ahora!"]
        }
      ]
    }
  ]
}

Genera la estructura de la campaña ahora.
`;

const safetySettings = [
    { category: HarmCategory.HARM_CATEGORY_HATE_SPEECH, threshold: HarmBlockThreshold.BLOCK_ONLY_HIGH },
    { category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT, threshold: HarmBlockThreshold.BLOCK_ONLY_HIGH },
    { category: HarmCategory.HARM_CATEGORY_HARASSMENT, threshold: HarmBlockThreshold.BLOCK_ONLY_HIGH },
    { category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT, threshold: HarmBlockThreshold.BLOCK_ONLY_HIGH },
];

export async function generateGoogleCampaign(input: GenerateGoogleCampaignInput): Promise<GoogleAdsCampaign> {
  const genAI = new GoogleGenerativeAI(process.env.GOOGLE_API_KEY!);
  const model = genAI.getGenerativeModel({ 
      model: "gemini-1.5-flash-latest", 
      generationConfig: { responseMimeType: "application/json" },
      safetySettings
  });

  const template = Handlebars.compile(GOOGLE_CAMPAIGN_PROMPT, { noEscape: true });
  const finalPrompt = template(input);
  
  const result = await model.generateContent(finalPrompt);
  const response = await result.response;
  let rawJson;
  try {
      rawJson = JSON.parse(response.text());
  } catch(e) {
      console.error("Error parsing JSON from Google campaign generation:", e);
      throw new Error("La IA devolvió una respuesta JSON inválida para la estructura de campaña.");
  }
  
  return GoogleAdsCampaignSchema.parse(rawJson);
}
