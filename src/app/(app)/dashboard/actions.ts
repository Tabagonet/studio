// src/app/(app)/dashboard/actions.ts
'use server';

import { adminAuth } from '@/lib/firebase-admin';
import axios from 'axios';

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
        console.error('[Server Action Config Error] NEXT_PUBLIC_BASE_URL is not set.');
        return { success: false, message: 'Error de configuración: La URL base de la aplicación no está definida en el servidor.' };
    }
    
    const targetUri = `${process.env.NEXT_PUBLIC_BASE_URL}/api/shopify/trigger-test-creation`;
    console.log(`[Server Action] Attempting to call secure proxy API endpoint via POST: ${targetUri}`);

    try {
        const response = await fetch(targetUri, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`,
            }
        });
        
        console.log(`[Server Action] Proxy API responded with status: ${response.status}`);
        const responseData = await response.json();

        if (!response.ok) {
             throw new Error(`Proxy API call failed with status ${response.status}: ${responseData.error || JSON.stringify(responseData)}`);
        }

        const jobId = responseData.jobId;
        console.log('[Server Action] Job creation successfully triggered by the internal API. Job ID:', jobId);
        return { success: true, message: '¡Trabajo de creación de tienda enviado! Revisa el progreso en la sección de Trabajos.', jobId: jobId };

    } catch (error: any) {
        const errorMessage = `No se pudo iniciar el trabajo: ${error.message}`;
        console.error('[Server Action Error] Failed to trigger store creation via internal API:', errorMessage);
        return { success: false, message: errorMessage };
    }
}
