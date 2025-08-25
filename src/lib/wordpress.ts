// src/lib/wordpress.ts
import axios, { AxiosInstance } from 'axios';

interface WordPressCredentials {
  url: string;
  username: string;
  applicationPassword: string;
}

interface WordPressApi {
  api: AxiosInstance;
  nonce: string;
}

/**
 * Creates a new Axios instance configured for the WordPress REST API and fetches a nonce.
 * This is used in API routes to create a client with user-specific credentials.
 * @param {WordPressCredentials} credentials - The user's WordPress API credentials.
 * @returns {Promise<WordPressApi | null>} A configured Axios instance and a nonce, or null if credentials are incomplete.
 */
export async function createWordPressApi(credentials: WordPressCredentials): Promise<WordPressApi | null> {
  let { url, username, applicationPassword } = credentials;

  if (!url || !username || !applicationPassword) {
    console.error("[createWordPressApi] Incomplete credentials:", { url, username, applicationPassword: '***' });
    return null;
  }
  
  if (!url.startsWith('http://') && !url.startsWith('https://')) {
    url = `https://${url}`;
  }

  try {
    const api = axios.create({
      baseURL: `${url}/wp-json/wp/v2`,
      auth: {
        username,
        password: applicationPassword,
      },
      headers: {
        'Content-Type': 'application/json',
      },
      timeout: 45000, 
    });

    // Fetch the nonce by making an authenticated request to a core endpoint
    let nonce = '';
    try {
        const nonceResponse = await api.get('/users/me?context=edit');
        nonce = nonceResponse.headers['x-wp-nonce'] || '';
        if (!nonce) {
             console.warn('[createWordPressApi] Nonce was not found in the response headers from /users/me.');
        } else {
             console.log('[createWordPressApi] Successfully fetched a new nonce from WordPress.');
        }
    } catch (nonceError: any) {
        console.error('[createWordPressApi] Failed to fetch nonce:', nonceError.message, nonceError.response?.data);
        // Do not throw an error, allow proceeding without a nonce for public endpoints.
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
