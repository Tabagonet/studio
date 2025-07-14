
// src/lib/shopify.ts
import axios, { AxiosInstance } from 'axios';

interface ShopifyCredentials {
  url: string;
  accessToken: string; // The "API Password" is the access token
}

const SHOPIFY_API_VERSION = '2025-04';

/**
 * Creates a new Axios instance configured for the Shopify Admin REST API.
 * This is used in API routes to create a client with user-specific credentials.
 * @param {ShopifyCredentials} credentials - The user's Shopify API credentials.
 * @returns {AxiosInstance | null} A configured Axios instance or null if credentials are incomplete.
 */
export function createShopifyApi(credentials: ShopifyCredentials): AxiosInstance | null {
  let { url, accessToken } = credentials;

  if (!url || !accessToken) {
    console.warn("Incomplete Shopify credentials provided. Cannot create API client.");
    return null;
  }
  
  if (!url.includes('.myshopify.com')) {
      console.warn(`Invalid Shopify URL format: ${url}. It should be the .myshopify.com domain.`);
      return null;
  }
  
  // Ensure the URL has a protocol and is clean
  if (!url.startsWith('http')) {
    url = `https://${url}`;
  }
  const cleanUrl = new URL(url).hostname;


  try {
    const shopifyApi = axios.create({
      baseURL: `https://${cleanUrl}/admin/api/${SHOPIFY_API_VERSION}`,
      headers: {
        'X-Shopify-Access-Token': accessToken,
        'Content-Type': 'application/json',
      },
      timeout: 20000, 
    });
    // console.log("Shopify API client dynamically created for user.");
    return shopifyApi;
  } catch (error) {
     const errorMessage = error instanceof Error ? error.message : "An unknown error occurred";
     console.error("Error creating dynamic Shopify API client:", errorMessage);
     return null;
  }
}

// Global instance is not used to enforce per-user credential usage.
export const shopifyApi = null;
