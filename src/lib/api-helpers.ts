
// src/lib/api-helpers.ts
import { adminDb } from '@/lib/firebase-admin';
import { createWooCommerceApi } from '@/lib/woocommerce';
import { createWordPressApi } from '@/lib/wordpress';
import type WooCommerceRestApi from '@woocommerce/woocommerce-rest-api';
import type { AxiosInstance } from 'axios';

interface ApiClients {
  wooApi: WooCommerceRestApi;
  wpApi: AxiosInstance;
}

/**
 * Fetches user-specific credentials from Firestore and creates API clients.
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
  const connections = settings?.connections;

  if (!connections) {
    throw new Error('API connections not configured for this user.');
  }

  const wooApi = createWooCommerceApi({
    url: connections.wooCommerceStoreUrl,
    consumerKey: connections.wooCommerceApiKey,
    consumerSecret: connections.wooCommerceApiSecret,
  });

  const wpApi = createWordPressApi({
    url: connections.wordpressApiUrl,
    username: connections.wordpressUsername,
    applicationPassword: connections.wordpressApplicationPassword,
  });

  if (!wooApi || !wpApi) {
    throw new Error('Failed to initialize API clients due to missing or invalid credentials.');
  }

  return { wooApi, wpApi };
}
