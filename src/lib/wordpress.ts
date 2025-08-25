
// src/lib/wordpress.ts
import axios, { AxiosInstance } from 'axios';

interface WordPressCredentials {
  url: string;
  username: string;
  applicationPassword: string;
  pluginSecretKey?: string; // Make the secret key optional
}

interface WordPressApi {
  api: AxiosInstance;
  nonce: string; // Nonce for WordPress REST API
}

/**
 * Creates a new Axios instance configured for the WordPress REST API and fetches a nonce.
 * This is used in API routes to create a client with user-specific credentials.
 * @param {WordPressCredentials} credentials - The user's WordPress API credentials.
 * @returns {Promise<WordPressApi | null>} A configured Axios instance and a nonce, or null if credentials are incomplete.
 */
export async function createWordPressApi(credentials: WordPressCredentials): Promise<WordPressApi | null> {
  let { url, username, applicationPassword, pluginSecretKey } = credentials;

  if (!url || !username || !applicationPassword) {
    console.warn("[createWordPressApi] Incomplete credentials provided. Cannot create API client.");
    return null;
  }
  
  if (!url.startsWith('http://') && !url.startsWith('https://')) {
    url = `https://${url}`;
  }

  try {
    const authHeader = `Basic ${Buffer.from(`${username}:${applicationPassword}`).toString('base64')}`;
    
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'Authorization': authHeader,
    };

    if (pluginSecretKey) {
        headers['X-Autopress-Secret'] = pluginSecretKey;
    }

    const api = axios.create({
      baseURL: `${url}/wp-json/wp/v2`,
      headers: headers,
      timeout: 45000, 
    });

    let nonce = '';
    // Only attempt to fetch a nonce if we don't have the secret key (fallback method)
    if (!pluginSecretKey) {
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
            console.error(`[createWordPressApi] FAILED to fetch nonce. This is a critical authentication error. Details: ${errorDetails}`);
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
