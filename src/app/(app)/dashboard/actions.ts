
'use server';

import axios from 'axios';
import { adminAuth } from '@/lib/firebase-admin';

// This server action is now a secure proxy to call our internal API endpoint.
// It uses the user's authentication to authorize itself.
export async function triggerShopifyCreationTestAction(token: string): Promise<{ success: boolean; message: string; jobId?: string; }> {
    console.log('[Server Action] Initiating Shopify creation test...');
    
    // Auth Check: Ensure the user calling this action is authenticated.
    try {
      if (!adminAuth) throw new Error("Firebase Admin not initialized.");
      await adminAuth.verifyIdToken(token);
    } catch (error) {
      console.error('[Server Action Auth Error]', error);
      return { success: false, message: 'Authentication failed.' };
    }

    if (!process.env.NEXT_PUBLIC_BASE_URL) {
        return { success: false, message: 'Error de configuración: La URL base de la aplicación no está definida en el servidor.' };
    }
    
    // The target API route is now an internal, authenticated endpoint.
    const targetUri = `${process.env.NEXT_PUBLIC_BASE_URL}/api/shopify/trigger-test-creation`;
    console.log(`[Server Action] Calling secure proxy API endpoint: ${targetUri}`);

    try {
        // We use axios.post and pass the user's auth token for verification on the other side.
        const response = await axios.post(targetUri, {}, {
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`,
            }
        });

        if (response.status !== 200 && response.status !== 202) {
             throw new Error(`La API interna devolvió un estado inesperado: ${response.status}`);
        }

        const jobId = response.data.jobId;
        console.log('[Server Action] Job creation successfully triggered by the internal API. Job ID:', jobId);
        return { success: true, message: '¡Trabajo de creación de tienda enviado! Revisa el progreso en la sección de Trabajos.', jobId: jobId };

    } catch (error: any) {
        const errorDetails = error.response?.data?.details || error.response?.data?.error || error.message;
        const errorMessage = `No se pudo iniciar el trabajo: ${errorDetails}`;
        console.error('[Server Action Error] Failed to trigger store creation via internal API:', errorMessage);
        return { success: false, message: errorMessage };
    }
}
