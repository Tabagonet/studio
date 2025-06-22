
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

  if (!wooApi || !wpApi) {
    throw new Error('Failed to initialize API clients due to missing or invalid credentials in the active profile.');
  }

  return { wooApi, wpApi };
}
