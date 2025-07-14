// src/app/(app)/dashboard/actions.ts
'use server';

import { adminAuth } from '@/lib/firebase-admin';
import axios from 'axios';

// This server action is now a secure proxy to call our internal API endpoint.
// It uses the user's authentication to authorize itself.
export async function triggerShopifyCreationTestAction(token: string): Promise<{ success: boolean; message: string; jobId?: string; }> {
    console.log('[Server Action] Paso 2: Llamando al endpoint del servidor seguro...');
    
    // Auth Check: Ensure the user calling this action is authenticated.
    try {
      if (!adminAuth) throw new Error("Firebase Admin not initialized.");
      await adminAuth.verifyIdToken(token);
    } catch (error) {
      console.error('[Server Action Auth Error]', error);
      return { success: false, message: 'Authentication failed.' };
    }

    if (!process.env.NEXT_PUBLIC_BASE_URL) {
        console.error('[Server Action Config Error] NEXT_PUBLIC_BASE_URL is not configured.');
        return { success: false, message: 'Error de configuración del servidor.' };
    }

    const targetUri = `${process.env.NEXT_PUBLIC_BASE_URL}/api/shopify/trigger-test-creation`;
    
    try {
        // We call our OWN secure API endpoint. This endpoint is where the secret key will be handled.
        const response = await axios.post(targetUri, {}, {
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`, // Pass the user's token for verification in the API route
            }
        });

        if (response.status === 202) {
            console.log(`[Server Action] Éxito. La API respondió con status 202.`);
            return { success: true, message: '¡Trabajo de creación de tienda enviado! Revisa el progreso en la sección de Trabajos.', jobId: response.data.jobId };
        } else {
            throw new Error(`La API respondió con un estado inesperado: ${response.status}`);
        }
    } catch (error: any) {
        const errorMessage = error.response?.data?.error || error.response?.data?.message || error.message;
        const finalMessage = `No se pudo iniciar el trabajo: ${errorMessage}`;
        console.error('[Server Action] Error durante la llamada a la API interna:', finalMessage);
        return { success: false, message: finalMessage };
    }
}
