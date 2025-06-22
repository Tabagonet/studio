
// src/lib/wordpress.ts
import axios, { AxiosInstance } from 'axios';

interface WordPressCredentials {
  url: string;
  username: string;
  applicationPassword: string;
}

/**
 * Creates a new Axios instance configured for the WordPress REST API on-demand.
 * This is used in API routes to create a client with user-specific credentials.
 * @param {WordPressCredentials} credentials - The user's WordPress API credentials.
 * @returns {AxiosInstance | null} A configured Axios instance or null if credentials are incomplete.
 */
export function createWordPressApi(credentials: WordPressCredentials): AxiosInstance | null {
  const { url, username, applicationPassword } = credentials;

  if (!url || !username || !applicationPassword) {
    console.warn("Incomplete WordPress credentials provided. Cannot create API client.");
    return null;
  }
  
  try {
    const token = Buffer.from(`${username}:${applicationPassword}`, 'utf8').toString('base64');
    
    const wpApi = axios.create({
      baseURL: `${url}/wp-json/wp/v2`,
      headers: {
        'Authorization': `Basic ${token}`,
      },
      timeout: 45000, // Increased timeout for media uploads
    });
    // console.log("WordPress API client dynamically created for user.");
    return wpApi;
  } catch (error) {
     console.error("Error creating dynamic WordPress API client:", error);
     return null;
  }
}

// The global wpApi instance is removed to enforce per-user credential usage.
export const wpApi = null;
