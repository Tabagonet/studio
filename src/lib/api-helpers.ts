
// src/lib/api-helpers.ts
import { adminDb } from '@/lib/firebase-admin';
import { createWooCommerceApi } from '@/lib/woocommerce';
import { createWordPressApi } from '@/lib/wordpress';
import type WooCommerceRestApi from '@woocommerce/woocommerce-rest-api';
import type { AxiosInstance } from 'axios';
import { z } from 'zod';
import { GoogleGenerativeAI } from '@google/generative-ai';
import axios from 'axios';
import FormData from 'form-data';


// --- Schemas for AI Content Generation ---
export const GenerateProductDescriptionInputSchema = z.object({
  productName: z.string().min(1, 'Product name is required.'),
  productType: z.string(),
  keywords: z.string().optional(),
  language: z.enum(['Spanish', 'English']).default('Spanish'),
  groupedProductIds: z.array(z.number()).optional(),
});

export const GenerateProductDescriptionOutputSchema = z.object({
  shortDescription: z.string().describe('A brief, catchy, and SEO-friendly summary of the product (1-2 sentences). Must use HTML for formatting.'),
  longDescription: z.string().describe('A detailed, persuasive, and comprehensive description of the product, following a specific structure for plants. Must use HTML for formatting.'),
  keywords: z.string().describe('A comma-separated list of 5 to 10 relevant SEO keywords/tags for the product, in English, using PascalCase or camelCase format.'),
  imageTitle: z.string().describe('A concise, SEO-friendly title for the product images. Example: "Drought-Tolerant Agave Avellanidens Plant".'),
  imageAltText: z.string().describe('A descriptive alt text for SEO, describing the image for visually impaired users. Example: "A large Agave Avellanidens succulent with blue-green leaves in a sunny, rocky garden."'),
  imageCaption: z.string().describe('An engaging caption for the image, suitable for the media library. This can be based on the short description.'),
  imageDescription: z.string().describe('A detailed description for the image media library entry. This can be a more detailed version of the alt text or based on the long description.'),
});

type GenerateProductDescriptionInput = z.infer<typeof GenerateProductDescriptionInputSchema>;
type GenerateProductDescriptionOutput = z.infer<typeof GenerateProductDescriptionOutputSchema>;


interface ApiClients {
  wooApi: WooCommerceRestApi | null;
  wpApi: AxiosInstance | null;
  activeConnectionKey: string;
}

/**
 * Fetches the active user-specific credentials from Firestore and creates API clients.
 * This is a centralized helper to be used by server-side API routes.
 * Throws an error if credentials are not found or incomplete.
 * @param {string} uid - The user's Firebase UID.
 * @returns {Promise<ApiClients>} An object containing initialized wooApi and wpApi clients.
 */
export async function getApiClientsForUser(uid: string): Promise<ApiClients> {
  if (!adminDb) {
    throw new Error('Firestore admin is not initialized.');
  }

  const userSettingsDoc = await adminDb.collection('user_settings').doc(uid).get();
  if (!userSettingsDoc.exists) {
    throw new Error('No settings found for user. Please configure API connections.');
  }

  const settings = userSettingsDoc.data();
  const allConnections = settings?.connections;
  const activeConnectionKey = settings?.activeConnectionKey;

  if (!activeConnectionKey || !allConnections || !allConnections[activeConnectionKey]) {
      throw new Error('No active API connection is configured. Please select or create one in Settings > Connections.');
  }

  const activeConnection = allConnections[activeConnectionKey];

  const wooApi = createWooCommerceApi({
    url: activeConnection.wooCommerceStoreUrl,
    consumerKey: activeConnection.wooCommerceApiKey,
    consumerSecret: activeConnection.wooCommerceApiSecret,
  });

  const wpApi = createWordPressApi({
    url: activeConnection.wordpressApiUrl,
    username: activeConnection.wordpressUsername,
    applicationPassword: activeConnection.wordpressApplicationPassword,
  });

  return { wooApi, wpApi, activeConnectionKey };
}


// --- AI Content Generation Helper ---

const DEFAULT_PROMPT_TEMPLATE = `You are an expert botanist, e-commerce copywriter, and SEO specialist.
Your primary task is to receive product information and generate a complete, accurate, and compelling product listing for a WooCommerce store.
The response must be a valid JSON object. Do not include any markdown backticks (\`\`\`) or the word "json" in your response.

**Input Information:**
- **Plant Name / Group Name:** {{productName}}
- **Language for output:** {{language}}
- **Product Type:** {{productType}}
- **User-provided Keywords (for inspiration):** {{keywords}}
- **Contained Products (for "Grouped" type only):**
{{groupedProductsList}}

**Instructions:**
1.  **Research & Synthesis:**
    - For "simple" or "variable" products, research the provided **Plant Name**.
    - For "Grouped" products, your primary task is to **synthesize the information from the "Contained Products" list provided above.** Do not perform external research on the group name itself. Your goal is to create a compelling description for the *collection* of items listed. Use the details from **all** products in the list to inform your response.

2.  **Generate Content:** Populate a JSON object with the following keys and specifications:

    a.  **"shortDescription":** Write a concise and engaging summary in {{language}}. The product name, "{{productName}}", MUST be wrapped in <strong> HTML tags. If it's a grouped product, summarize the collection.

    b.  **"longDescription":** Write a detailed description entirely in **{{language}}**. It MUST follow this structure. All labels (e.g., "Botanical Name", "Common Names", etc.) MUST be translated to {{language}}. For each item, **you must find the correct information** and format it with the translated label in bold (<strong>) and the value in italic (<em>). For a "Grouped" product, adapt the details to describe the collection as a whole.
        <strong>[Translated "Botanical Name"]:</strong> <em>[Find and insert the scientific name, or general family for groups]</em><br>
        <strong>[Translated "Common Names"]:</strong> <em>[Find and list common names, or a collective name for groups]</em><br>
        <strong>[Translated "Mature Size"]:</strong> <em>[Find and insert typical height and spread]</em><br>
        <strong>[Translated "Light Requirements"]:</strong> <em>[Find and insert light needs]</em><br>
        <strong>[Translated "Soil Requirements"]:</strong> <em>[Find and insert soil needs]</em><br>
        <strong>[Translated "Water Needs"]:</strong> <em>[Find and insert water needs]</em><br>
        <strong>[Translated "Foliage"]:</strong> <em>[Find and describe the foliage]</em><br>
        <strong>[Translated "Flowers"]:</strong> <em>[Find and describe the flowers]</em><br>
        <strong>[Translated "Growth Rate"]:</strong> <em>[Find and insert the growth rate]</em><br>
        <br>
        <strong>[Translated "Uses"]:</strong><br>
        - <strong>[Translated "Architectural Plant"]:</strong> <em>[Explain this use based on research, in {{language}}]</em><br>
        - <strong>[Translated "Xeriscaping"]:</strong> <em>[Explain this use based on research, in {{language}}]</em><br>
        - <strong>[Translated "Ecological Landscaping"]:</strong> <em>[Explain this use based on research, in {{language}}]</em><br>
        <br>
        <strong>[Translated "Benefits"]:</strong><br>
        - <strong>[Translated "Extreme Drought Tolerance"]:</strong> <em>[Explain this benefit based on research, in {{language}}]</em><br>
        - <strong>[Translated "Low Maintenance"]:</strong> <em>[Explain this benefit based on research, in {{language}}]</em><br>
        - <strong>[Translated "Visual Interest"]:</strong> <em>[Explain this benefit based on research, in {{language}}]</em><br>
        - <strong>[Translated "Habitat Support"]:</strong> <em>[Explain this benefit based on research, in {{language}}]</em><br>
        <br>
        <em>[Write a final summary paragraph here, in {{language}}. If "Grouped", highlight the value of the collection.]</em>

    c.  **"keywords":** Generate a comma-separated list of 5-10 relevant SEO keywords in English (PascalCase or camelCase).

    d.  **"imageTitle":** Generate a concise, SEO-friendly title for product images. Example: "Drought-Tolerant Agave Avellanidens Plant".

    e.  **"imageAltText":** Generate a descriptive alt text for SEO, describing the image for visually impaired users. Example: "A large Agave Avellanidens succulent with blue-green leaves in a sunny, rocky garden."

    f.  **"imageCaption":** Generate an engaging caption for the image, suitable for the media library. This can be based on the short description.

    g.  **"imageDescription":** Generate a detailed description for the image media library entry. This can be a more detailed version of the alt text or based on the long description.

Generate the complete JSON object based on your research of "{{productName}}".`;

/**
 * Gets the correct prompt template for the user's active connection.
 * @param {string} uid - The user's Firebase UID.
 * @returns {Promise<string>} The connection-specific prompt or a default.
 */
async function getUserPromptTemplate(uid: string): Promise<string> {
    if (!adminDb) {
        console.warn("AI Helper: Firestore not available, using default prompt template.");
        return DEFAULT_PROMPT_TEMPLATE;
    }
    try {
        const userSettingsDoc = await adminDb.collection('user_settings').doc(uid).get();
        if (userSettingsDoc.exists) {
            const settings = userSettingsDoc.data();
            const activeKey = settings?.activeConnectionKey;
            const connections = settings?.connections;
            
            if (activeKey && connections && connections[activeKey] && connections[activeKey].promptTemplate) {
                 return connections[activeKey].promptTemplate;
            }
        }
        // Fallback to default if no specific prompt is found
        return DEFAULT_PROMPT_TEMPLATE;
    } catch (error) {
        console.error("Error fetching user prompt template, using default:", error);
        return DEFAULT_PROMPT_TEMPLATE;
    }
}

const stripHtml = (html: string | null | undefined): string => {
    return html ? html.replace(/<[^>]*>?/gm, '') : '';
};


/**
 * Generates product content using the Google AI API.
 * @param {GenerateProductDescriptionInput} input - The product data.
 * @param {string} uid - The user's Firebase UID.
 * @param {WooCommerceRestApi} wooApi - An initialized WooCommerce API client, required for grouped products.
 * @returns {Promise<GenerateProductDescriptionOutput>} The generated content.
 */
export async function generateProductContent(
  input: GenerateProductDescriptionInput,
  uid: string,
  wooApi: WooCommerceRestApi | null
): Promise<GenerateProductDescriptionOutput> {
  const apiKey = process.env.GOOGLE_API_KEY;
  if (!apiKey) {
    throw new Error('La clave API de Google AI no está configurada en el servidor.');
  }

  let groupedProductsList = 'N/A';
  if (input.productType === 'grouped' && input.groupedProductIds && input.groupedProductIds.length > 0) {
    if (!wooApi) {
        groupedProductsList = 'WooCommerce API is not configured. Cannot fetch grouped product details.';
    } else {
        try {
          const response = await wooApi.get("products", { include: input.groupedProductIds, per_page: 100 });
          if (response.data && response.data.length > 0) {
            groupedProductsList = response.data.map((product: any) => {
              const name = product.name;
              const desc = stripHtml(product.short_description) || stripHtml(product.description)?.substring(0, 150) + '...' || 'No description available.';
              return `* Product: ${name}\n* Details: ${desc}`;
            }).join('\n\n');
          }
        } catch (e) {
          console.error("Failed to fetch details for grouped products:", e);
          groupedProductsList = 'Error fetching product details.';
        }
    }
  }

  const genAI = new GoogleGenerativeAI(apiKey);
  const model = genAI.getGenerativeModel({
    model: "gemini-1.5-flash-latest",
    systemInstruction: `You are an expert e-commerce copywriter and SEO specialist. Your primary task is to generate a single, valid JSON object based on the user's prompt. The JSON object must strictly follow the schema requested in the user prompt. Do not add any extra text, comments, or markdown formatting like \`\`\`json around the JSON response.`,
    generationConfig: {
      responseMimeType: "application/json",
    },
  });

  const promptTemplate = await getUserPromptTemplate(uid);
  const finalPrompt = promptTemplate
    .replace(/{{productName}}/g, input.productName)
    .replace(/{{language}}/g, input.language)
    .replace(/{{productType}}/g, input.productType)
    .replace(/{{keywords}}/g, input.keywords || '')
    .replace(/{{groupedProductsList}}/g, groupedProductsList || 'N/A');

  const result = await model.generateContent(finalPrompt);
  const response = result.response;
  const responseText = response.text();
  
  const parsedJson = JSON.parse(responseText);
  const validatedOutput = GenerateProductDescriptionOutputSchema.safeParse(parsedJson);

  if (!validatedOutput.success) {
    console.error('AI model returned invalid JSON structure.', validatedOutput.error.flatten());
    console.error('Raw model output:', responseText);
    throw new Error("La IA devolvió una respuesta con un formato inesperado.");
  }
  
  return validatedOutput.data;
}


/**
 * Translates content using Google AI.
 * @param contentToTranslate An object with title and content strings.
 * @param targetLanguage The language to translate to.
 * @returns A promise that resolves to the translated title and content.
 */
export async function translateContent(
  contentToTranslate: { title: string; content: string },
  targetLanguage: string
): Promise<{ title: string; content: string }> {
  const apiKey = process.env.GOOGLE_API_KEY;
  if (!apiKey) {
    throw new Error('La clave API de Google AI no está configurada en el servidor.');
  }

  const genAI = new GoogleGenerativeAI(apiKey);
  const model = genAI.getGenerativeModel({
    model: 'gemini-1.5-flash-latest',
    systemInstruction: `You are an expert translator. Translate the user-provided JSON content into the specified target language. It is crucial that you maintain the original JSON structure with 'title' and 'content' keys. You must also preserve all HTML tags (e.g., <h2>, <p>, <strong>) in their correct positions within the 'content' field. Your output must be only the translated JSON object, without any extra text or markdown formatting.`,
    generationConfig: {
      responseMimeType: 'application/json',
    },
  });

  const prompt = `Translate the following content to ${targetLanguage}:\n\n${JSON.stringify(contentToTranslate)}`;
  
  const result = await model.generateContent(prompt);
  const responseText = result.response.text();
  
  try {
    const parsedJson = JSON.parse(responseText);
    if (typeof parsedJson.title === 'string' && typeof parsedJson.content === 'string') {
      return parsedJson;
    }
    throw new Error('AI returned JSON with incorrect schema.');
  } catch (error) {
    console.error('Error parsing translated content from AI:', responseText, error);
    throw new Error('Failed to parse translation from AI.');
  }
}


/**
 * Uploads an image from a given URL to the WordPress media library.
 * @param imageUrl The URL of the image to upload.
 * @param seoFilename A desired filename for SEO purposes.
 * @param imageMetadata Metadata for the image (title, alt, etc.).
 * @param wpApi Initialized Axios instance for WordPress API.
 * @returns The ID of the newly uploaded media item.
 */
export async function uploadImageToWordPress(
  imageUrl: string,
  seoFilename: string,
  imageMetadata: { title: string; alt_text: string; caption: string; description: string; },
  wpApi: AxiosInstance
): Promise<number> {
    try {
        const imageResponse = await axios.get(imageUrl, { responseType: 'arraybuffer' });
        const imageBuffer = Buffer.from(imageResponse.data);

        const formData = new FormData();
        formData.append('file', imageBuffer, seoFilename);
        formData.append('title', imageMetadata.title);
        formData.append('alt_text', imageMetadata.alt_text);
        formData.append('caption', imageMetadata.caption);
        formData.append('description', imageMetadata.description);

        const mediaResponse = await wpApi.post('/media', formData, {
            headers: {
                ...formData.getHeaders(),
                'Content-Disposition': `attachment; filename=${seoFilename}`,
            },
        });

        return mediaResponse.data.id;

    } catch (uploadError: any) {
        let errorMsg = `Error al procesar la imagen desde la URL '${imageUrl}'.`;
        if (uploadError.response?.data?.message) {
            errorMsg += ` Razón: ${uploadError.response.data.message}`;
            if (uploadError.response.status === 401 || uploadError.response.status === 403) {
                errorMsg += ' Esto es probablemente un problema de permisos. Asegúrate de que el usuario de la Contraseña de Aplicación tiene el rol de "Editor" o "Administrador" en WordPress.';
            }
        } else {
            errorMsg += ` Razón: ${uploadError.message}`;
        }
        console.error(errorMsg, uploadError.response?.data);
        throw new Error(errorMsg);
    }
}

/**
 * Finds a category by its path (e.g., "Parent > Child") or creates it if it doesn't exist.
 * @param pathString The category path string.
 * @param wooApi An initialized WooCommerce API client.
 * @returns The ID of the final category in the path.
 */
export async function findOrCreateCategoryByPath(pathString: string, wooApi: WooCommerceRestApi): Promise<number | null> {
    if (!pathString || !pathString.trim()) {
        return null;
    }

    const pathParts = pathString.split('>').map(part => part.trim());
    let parentId = 0;
    let finalCategoryId: number | null = null;
    
    // Fetch all categories once to avoid multiple API calls in the loop
    const allCategoriesResponse = await wooApi.get("products/categories", { per_page: 100 });
    const allCategories = allCategoriesResponse.data;

    for (const part of pathParts) {
        let foundCategory = allCategories.find(
            (cat: any) => cat.name.toLowerCase() === part.toLowerCase() && cat.parent === parentId
        );

        if (foundCategory) {
            parentId = foundCategory.id;
        } else {
            // Create the new category
            const { data: newCategory } = await wooApi.post("products/categories", {
                name: part,
                parent: parentId,
            });
            // Add the new category to our local list to be found by the next iteration
            allCategories.push(newCategory);
            parentId = newCategory.id;
        }
        finalCategoryId = parentId;
    }

    return finalCategoryId;
}

/**
 * Finds tags by name or creates them if they don't exist in WordPress.
 * @param tagNames An array of tag names.
 * @param wpApi An initialized Axios instance for the WordPress API.
 * @returns A promise that resolves to an array of tag IDs.
 */
export async function findOrCreateTags(tagNames: string[], wpApi: AxiosInstance): Promise<number[]> {
  if (!tagNames || tagNames.length === 0) {
    return [];
  }
  const tagIds: number[] = [];

  for (const name of tagNames) {
    try {
      // 1. Search for the tag
      const searchResponse = await wpApi.get('/tags', { search: name, per_page: 1 });
      const existingTag = searchResponse.data.find((tag: any) => tag.name.toLowerCase() === name.toLowerCase());

      if (existingTag) {
        tagIds.push(existingTag.id);
      } else {
        // 2. Create the tag if it doesn't exist
        const createResponse = await wpApi.post('/tags', { name });
        tagIds.push(createResponse.data.id);
      }
    } catch (error: any) {
        console.error(`Failed to find or create tag "${name}":`, error.response?.data || error.message);
        // Continue to the next tag even if one fails
    }
  }
  return tagIds;
}
