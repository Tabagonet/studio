
// src/lib/api-helpers.ts
import { adminDb } from '@/lib/firebase-admin';
import { createWooCommerceApi } from '@/lib/woocommerce';
import { createWordPressApi } from '@/lib/wordpress';
import type WooCommerceRestApiType from '@woocommerce/woocommerce-rest-api';
import type { AxiosInstance } from 'axios';
import { z } from 'zod';
import { ai } from '@/ai/genkit';
import axios from 'axios';
import FormData from 'form-data';


// --- Schemas for AI Content Generation ---
// Note: The main logic has been moved to /src/ai/flows/generate-product-flow.ts
// Schemas are kept here if needed by other helpers, but the primary source of truth is the flow file.
export const GenerateProductDescriptionInputSchema = z.object({
  productName: z.string().min(1, 'Product name is required.'),
  productType: z.string(),
  keywords: z.string().optional(),
  language: z.enum(['Spanish', 'English', 'French', 'German', 'Portuguese']).default('Spanish'),
  groupedProductIds: z.array(z.number()).optional(),
});

export const GenerateProductDescriptionOutputSchema = z.object({
  shortDescription: z.string(),
  longDescription: z.string(),
  keywords: z.string(),
  imageTitle: z.string(),
  imageAltText: z.string(),
  imageCaption: z.string(),
  imageDescription: z.string(),
});


interface ApiClients {
  wooApi: WooCommerceRestApiType | null;
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

// Deprecated: The main generateProductContent function now lives inside the Genkit flow
// at /src/ai/flows/generate-product-flow.ts. This keeps server-side AI logic cleanly separated.
// This function is kept to avoid breaking any potential remaining imports but should not be used.
export async function generateProductContent() {
    throw new Error("generateProductContent is deprecated. Please use the generateProductFlow from /src/ai/flows/generate-product-flow.ts");
}


/**
 * Translates content using a direct AI call. This is centralized here to avoid build issues
 * with separate flow files in Next.js.
 * @param contentToTranslate An object with string key-value pairs.
 * @param targetLanguage The language to translate to.
 * @returns A promise that resolves to an object with the same keys but translated values.
 */
export async function translateContent(
  contentToTranslate: { [key: string]: string },
  targetLanguage: string
): Promise<{ [key: string]: string }> {
  try {
    const systemInstruction = `You are an expert translator. Translate the values of the user-provided JSON object into the specified target language. It is crucial that you maintain the original JSON structure and keys. You must also preserve all HTML tags (e.g., <h2>, <p>, <strong>) and special separators like '|||' in their correct positions within the string values. Your output must be only the translated JSON object, without any extra text, comments, or markdown formatting.`;

    const prompt = `Translate the following content to ${targetLanguage}:\n\n${JSON.stringify(contentToTranslate)}`;

    const { output } = await ai.generate({
        model: 'googleai/gemini-1.5-flash-latest',
        system: systemInstruction,
        prompt: prompt,
        output: {
            schema: z.record(z.string())
        }
    });

    if (!output || typeof output !== 'object') {
        throw new Error('AI returned a non-object or empty response for translation.');
    }
    
    return output;

  } catch (error) {
    console.error('Error in translateContent helper:', error);
    // Re-throw to be caught by the calling API route
    throw new Error('Failed to translate content via AI.');
  }
}

/**
 * Recursively traverses Elementor's data structure to collect all user-visible text content.
 * @param data The 'elements' array or any nested object/array from Elementor's data.
 * @param texts The array to push found texts into.
 */
function collectElementorTextsRecursive(data: any, texts: string[]): void {
    if (!data) return;

    if (Array.isArray(data)) {
        data.forEach(item => collectElementorTextsRecursive(item, texts));
        return;
    }

    if (typeof data === 'object') {
        const keysToTranslate = [
            'title', 'editor', 'text', 'button_text', 'header_title', 'header_subtitle',
            'description', 'cta_text', 'label', 'placeholder', 'heading', 'sub_heading',
            'alert_title', 'alert_description',
            // Added based on user's JSON from theme "The7"
            'title_text', 'description_text', 'list_title'
        ];

        for (const key in data) {
            if (Object.prototype.hasOwnProperty.call(data, key)) {
                const value = data[key];

                if (keysToTranslate.includes(key) && typeof value === 'string' && value.trim() !== '') {
                    texts.push(value);
                } else if (typeof value === 'object' && value !== null) {
                    collectElementorTextsRecursive(value, texts);
                }
            }
        }
    }
}

export function collectElementorTexts(elements: any[]): string[] {
    const texts: string[] = [];
    collectElementorTextsRecursive(elements, texts);
    return texts;
}

/**
 * Recursively traverses a deep copy of Elementor's data structure and replaces text content
 * with items from an array of translated strings.
 * @param data A deep copy of the original 'elements' array or nested object/array.
 * @param translatedTexts A mutable array of translated strings.
 * @returns The Elementor data structure with translated text.
 */
function replaceElementorTextsRecursive(data: any, translatedTexts: string[]): any {
    if (!data) return data;

    if (Array.isArray(data)) {
        return data.map(item => replaceElementorTextsRecursive(item, translatedTexts));
    }

    if (typeof data === 'object') {
        const newData = { ...data };
        const keysToTranslate = [
            'title', 'editor', 'text', 'button_text', 'header_title', 'header_subtitle',
            'description', 'cta_text', 'label', 'placeholder', 'heading', 'sub_heading',
            'alert_title', 'alert_description',
            // Added based on user's JSON from theme "The7"
            'title_text', 'description_text', 'list_title'
        ];

        for (const key in newData) {
            if (Object.prototype.hasOwnProperty.call(newData, key)) {
                const value = newData[key];

                if (keysToTranslate.includes(key) && typeof value === 'string' && value.trim() !== '') {
                    if (translatedTexts.length > 0) {
                        newData[key] = translatedTexts.shift();
                    }
                } else if (typeof value === 'object' && value !== null) {
                    newData[key] = replaceElementorTextsRecursive(value, translatedTexts);
                }
            }
        }
        return newData;
    }

    return data;
}

export function replaceElementorTexts(originalElements: any[], translatedTexts: string[]): any[] {
    const textsCopy = [...translatedTexts]; // Use a mutable copy so we can shift() from it
    return replaceElementorTextsRecursive(originalElements, textsCopy);
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
export async function findOrCreateCategoryByPath(pathString: string, wooApi: WooCommerceRestApiType): Promise<number | null> {
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
 * Finds a WP post category by its path (e.g., "Parent > Child") or creates it if it doesn't exist.
 * @param pathString The category path string.
 * @param wpApi An initialized Axios instance for the WordPress API.
 * @returns The ID of the final category in the path.
 */
export async function findOrCreateWpCategoryByPath(pathString: string, wpApi: AxiosInstance): Promise<number | null> {
    if (!pathString || !pathString.trim()) {
        return null;
    }

    const pathParts = pathString.split('>').map(part => part.trim());
    let parentId = 0;
    let finalCategoryId: number | null = null;
    
    // Fetch all categories once to avoid multiple API calls in the loop
    const allCategoriesResponse = await wpApi.get("/categories", { params: { per_page: 100 } });
    const allCategories = allCategoriesResponse.data;

    for (const part of pathParts) {
        let foundCategory = allCategories.find(
            (cat: any) => cat.name.toLowerCase() === part.toLowerCase() && cat.parent === parentId
        );

        if (foundCategory) {
            parentId = foundCategory.id;
        } else {
            // Create the new category
            const { data: newCategory } = await wpApi.post("/categories", {
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
      const searchResponse = await wpApi.get('/tags', { params: { search: name, per_page: 1 } });
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
