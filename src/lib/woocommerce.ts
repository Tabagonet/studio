// src/lib/woocommerce.ts
import WooCommerceRestApi from "@woocommerce/woocommerce-rest-api";
import type WooCommerceRestApiType from "@woocommerce/woocommerce-rest-api";

interface WooCommerceCredentials {
  url: string;
  consumerKey: string;
  consumerSecret: string;
}

/**
 * Creates a new WooCommerce REST API instance on-demand.
 * This is used in API routes to create a client with user-specific credentials.
 * @param {WooCommerceCredentials} credentials - The user's WooCommerce API credentials.
 * @returns {WooCommerceRestApiType | null} A configured API client or null if credentials are incomplete.
 */
export function createWooCommerceApi(credentials: WooCommerceCredentials): WooCommerceRestApiType | null {
  let { url, consumerKey, consumerSecret } = credentials;

  if (!url || !consumerKey || !consumerSecret) {
    // Return null instead of throwing an error immediately.
    // The calling function will be responsible for handling the null case.
    return null;
  }

  // Ensure the URL has a protocol
  if (!url.startsWith('http://') && !url.startsWith('https://')) {
    url = `https://${url}`;
  }

  try {
    const wooApi = new WooCommerceRestApi({
      url: url,
      consumerKey: consumerKey,
      consumerSecret: consumerSecret,
      version: "wc/v3",
      queryStringAuth: true,
      axiosConfig: {
        timeout: 20000, // 20-second timeout
      }
    });
    // console.log("WooCommerce API client dynamically created for user.");
    return wooApi;
  } catch (error) {
     const errorMessage = error instanceof Error ? error.message : "An unknown error occurred";
     console.error("Error creating dynamic WooCommerce API client:", errorMessage);
     return null;
  }
}

// The global wooApi instance is removed to enforce per-user credential usage.
export const wooApi = null;
