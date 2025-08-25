// src/lib/wordpress.ts
import axios, { AxiosInstance } from 'axios';

interface WordPressCredentials {
  url: string;
  username: string;
  applicationPassword: string;
  pluginSecretKey?: string; // This is now optional and used for the new auth method.
}

interface WordPressApi {
  api: AxiosInstance;
  nonce: string; // Nonce for WordPress REST API (kept for potential future use)
}

/**
 * Creates a new Axios instance configured for the WordPress REST API.
 * This now includes a fallback authentication mechanism using a secret key.
 * @param {WordPressCredentials} credentials - The user's WordPress API credentials.
 * @returns {Promise<WordPressApi | null>} A configured Axios instance and a nonce, or null if credentials are incomplete.
 */
export async function createWordPressApi(credentials: WordPressCredentials): Promise<WordPressApi | null> {
  let { url, username, applicationPassword, pluginSecretKey } = credentials;

  if (!url) {
    console.warn("[createWordPressApi] URL is missing. Cannot create API client.");
    return null;
  }
  
  if (!url.startsWith('http://') && !url.startsWith('https://')) {
    url = `https://${url}`;
  }

  try {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };

    // If a plugin secret key is provided, use it as the primary auth method for our custom endpoints.
    if (pluginSecretKey) {
        headers['X-Autopress-Secret'] = pluginSecretKey;
    }

    // Still include Basic Auth for standard WP REST API endpoints.
    if (username && applicationPassword) {
      const authHeader = `Basic ${Buffer.from(`${username}:${applicationPassword}`).toString('base64')}`;
      headers['Authorization'] = authHeader;
    }
    
    const api = axios.create({
      baseURL: `${url}/wp-json/wp/v2`,
      headers: headers,
      timeout: 45000, 
    });

    let nonce = '';
    // Nonce fetching is now a fallback/informational step, not a hard requirement for all our custom endpoints.
    if (username && applicationPassword) {
        try {
            const nonceResponse = await api.get('/users/me', { params: { context: 'edit' } });
            nonce = nonceResponse.headers['x-wp-nonce'] || '';
            if (nonce) {
                 console.log('[createWordPressApi] Successfully fetched a new nonce from WordPress.');
            } else {
                 console.warn('[createWordPressApi] Nonce was not found in the response headers from /users/me.');
            }
        } catch (nonceError: any) {
            const errorDetails = nonceError.response 
                ? `Status: ${nonceError.response.status}. WordPress Message: ${JSON.stringify(nonceError.response.data?.message || nonceError.response.data)}`
                : nonceError.message;
            console.error(`[createWordPressApi] FAILED to fetch nonce. This can be due to incorrect credentials or a security plugin blocking the request. Details: ${errorDetails}`);
        }
    }
    
    return { api, nonce };
  } catch (error) {
     const errorMessage = error instanceof Error ? error.message : "An unknown error occurred";
     console.error("Error creating dynamic WordPress API client:", errorMessage);
     return null;
  }
}

// The global wpApi instance is removed to enforce per-user credential usage.
export const wpApi = null;
