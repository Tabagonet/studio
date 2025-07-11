
// src/lib/api-helpers.ts
import type * as admin from 'firebase-admin';
import { adminDb } from '@/lib/firebase-admin';
import { createWooCommerceApi } from '@/lib/woocommerce';
import { createWordPressApi } from '@/lib/wordpress';
import { createShopifyApi } from '@/lib/shopify';
import type WooCommerceRestApiType from '@woocommerce/woocommerce-rest-api';
import type { AxiosInstance } from 'axios';
import axios from 'axios';
import FormData from 'form-data';
import type { ExtractedWidget } from './types';
import sharp from 'sharp';
import crypto from 'crypto';


interface ApiClients {
  wooApi: WooCommerceRestApiType | null;
  wpApi: AxiosInstance | null;
  shopifyApi: AxiosInstance | null;
  activeConnectionKey: string | null;
  settings: admin.firestore.DocumentData | undefined;
}

/**
 * Validates an HMAC signature from a Shopify webhook or auth redirect.
 * @param query The URL search parameters from the request.
 * @param clientSecret The Shopify App's client secret.
 * @returns {boolean} True if the HMAC is valid, false otherwise.
 */
export function validateHmac(query: URLSearchParams, clientSecret: string): boolean {
    const hmac = query.get('hmac');
    if (!hmac) return false;

    const queryParams: { [key: string]: string } = {};
    query.forEach((value, key) => {
        if (key !== 'hmac') {
            queryParams[key] = value;
        }
    });
    
    const sortedQuery = Object.keys(queryParams)
        .sort()
        .map(key => `${key}=${queryParams[key]}`)
        .join('&');
        
    const calculatedHmac = crypto
        .createHmac('sha256', clientSecret)
        .update(sortedQuery)
        .digest('hex');

    return crypto.timingSafeEqual(Buffer.from(hmac), Buffer.from(calculatedHmac));
}


/**
 * Fetches the active user-specific or company-specific credentials and creates API clients.
 * This function now determines context (user vs company) to fetch the correct settings.
 * It also performs a mandatory verification check against the WordPress site's plugin.
 * @param {string} uid - The user's Firebase UID.
 * @returns {Promise<ApiClients>} An object containing initialized API clients and settings.
 * @throws {Error} If the connection is not verified or credentials are incomplete.
 */
export async function getApiClientsForUser(uid: string): Promise<ApiClients> {
  if (!adminDb) {
    throw new Error('Firestore admin is not initialized.');
  }
  
  const userDoc = await adminDb.collection('users').doc(uid).get();
  if (!userDoc.exists) {
      throw new Error('User record not found in database.');
  }

  const userData = userDoc.data();
  const companyId = userData?.companyId;

  let settingsSource: admin.firestore.DocumentData | undefined;

  if (companyId) {
      const companyDoc = await adminDb.collection('companies').doc(companyId).get();
      if (!companyDoc.exists) throw new Error(`Company with ID ${companyId} not found.`);
      settingsSource = companyDoc.data();
  } else {
      const userSettingsDoc = await adminDb.collection('user_settings').doc(uid).get();
      settingsSource = userSettingsDoc.data();
  }
  
  if (!settingsSource) {
      throw new Error('No settings found. Please configure API connections.');
  }

  const allConnections = settingsSource.connections;
  const activeConnectionKey = settingsSource.activeConnectionKey;

  if (!activeConnectionKey || !allConnections || !allConnections[activeConnectionKey]) {
      throw new Error('No active API connection is configured. Please select or create one in Settings > Connections.');
  }

  const activeConnection = allConnections[activeConnectionKey];

  // Create temporary WordPress client just for verification if WordPress is configured
  if (activeConnection.wordpressApiUrl && activeConnection.wordpressUsername && activeConnection.wordpressApplicationPassword) {
    const tempWpApi = createWordPressApi({
      url: activeConnection.wordpressApiUrl,
      username: activeConnection.wordpressUsername,
      applicationPassword: activeConnection.wordpressApplicationPassword,
    });
    
    if (tempWpApi) {
        const siteUrl = tempWpApi.defaults.baseURL?.replace('/wp-json/wp/v2', '');
        const statusEndpoint = `${siteUrl}/wp-json/custom/v1/status`;
        try {
            const response = await tempWpApi.get(statusEndpoint, { timeout: 15000 });
            if (response.status !== 200 || response.data?.verified !== true) {
                throw new Error("Connection not verified. The API Key stored in your WordPress plugin is invalid or missing. Please go to your WordPress Admin > Settings > AutoPress AI to fix it.");
            }
        } catch (e: any) {
            if (e.response?.status === 404) {
                 throw new Error('Verification endpoint not found. Please update the AutoPress AI Helper plugin in WordPress.');
            }
            // Re-throw the original verification error or a generic one
            throw new Error(e.message || "Failed to verify connection status with the WordPress plugin.");
        }
    }
  }

  // If verification passes (or is not applicable), create and return all clients
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

  const shopifyApi = createShopifyApi({
    url: activeConnection.shopifyStoreUrl,
    accessToken: activeConnection.shopifyApiPassword,
  });

  return { wooApi, wpApi, shopifyApi, activeConnectionKey, settings: settingsSource };
}

function extractHeadingsRecursive(elements: any[], widgets: ExtractedWidget[]): void {
    if (!elements || !Array.isArray(elements)) return;

    for (const element of elements) {
        if (element.elType === 'widget' && element.widgetType === 'heading' && element.settings?.title) {
            widgets.push({
                id: element.id,
                tag: element.settings.header_size || 'h2',
                text: element.settings.title,
                type: 'heading', // Added for clarity on the frontend
            });
        }
        
        if (element.elements && element.elements.length > 0) {
            extractHeadingsRecursive(element.elements, widgets);
        }
    }
}

export function extractElementorHeadings(elementorDataString: string): ExtractedWidget[] {
    try {
        const widgets: ExtractedWidget[] = [];
        if (!elementorDataString) return widgets;
        const elementorData = JSON.parse(elementorDataString);
        extractHeadingsRecursive(elementorData, widgets);
        return widgets;
    } catch (e) {
        console.error("Failed to parse or extract Elementor headings", e);
        return [];
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

export function replaceElementorTexts(elementorData: any, translatedTexts: string[]): any {
  if (!elementorData || !Array.isArray(elementorData)) return elementorData;
  return replaceElementorTextsRecursive(elementorData, translatedTexts);
}


/**
 * Downloads, processes (resizes, converts to WebP), and uploads an image to the WordPress media library.
 * @param imageUrl The URL of the image to process.
 * @param seoFilename A desired filename for SEO purposes. The extension will be replaced with .webp.
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
        // 1. Download the image
        const imageResponse = await axios.get(imageUrl, { responseType: 'arraybuffer' });
        const originalBuffer = Buffer.from(imageResponse.data, 'binary');

        // 2. Process the image with Sharp
        const processedBuffer = await sharp(originalBuffer)
            .resize(1200, 1200, {
                fit: 'inside', // Resize while maintaining aspect ratio
                withoutEnlargement: true, // Don't enlarge smaller images
            })
            .webp({ quality: 80 }) // Convert to WebP with 80% quality
            .toBuffer();
            
        // 3. Prepare FormData for WordPress upload
        const webpFilename = seoFilename.replace(/\.[^/.]+$/, "") + ".webp"; // Ensure filename is .webp
        const formData = new FormData();
        formData.append('file', processedBuffer, webpFilename);
        formData.append('title', imageMetadata.title);
        formData.append('alt_text', imageMetadata.alt_text);
        formData.append('caption', imageMetadata.caption);
        formData.append('description', imageMetadata.description);

        // 4. Upload the processed image to WordPress
        const mediaResponse = await wpApi.post('/media', formData, {
            headers: {
                ...formData.getHeaders(),
                'Content-Disposition': `attachment; filename=${webpFilename}`,
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
