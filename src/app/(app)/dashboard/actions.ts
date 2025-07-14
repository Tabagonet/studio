
'use server';

import axios from 'axios';

// This is a server action, designed to be called from a client component.
// It now calls a dedicated, secure API route to trigger the test.
// This new route will handle the internal API key securely on the backend.
export async function triggerShopifyCreationTestAction(token: string): Promise<{ success: boolean; message: string; jobId?: string; }> {
    console.log('[Server Action] Calling secure trigger endpoint...');
    
    // The base URL must be available on the server.
    if (!process.env.NEXT_PUBLIC_BASE_URL) {
        return { success: false, message: 'Error de configuración: La URL base de la aplicación no está definida en el servidor.' };
    }
    
    const targetUri = `${process.env.NEXT_PUBLIC_BASE_URL}/api/shopify/trigger-test-creation`;
    
    try {
        // Use axios for more detailed error responses and explicit method definition.
        const response = await axios.post(targetUri, {}, {
            headers: {
                'Authorization': `Bearer ${token}`, // Use the user's auth token to authorize with our own secure endpoint
            }
        });

        if (response.status !== 202) {
             throw new Error(`La API devolvió un estado inesperado: ${response.status}`);
        }

        const jobId = response.data.jobId;
        console.log('[Server Action] Job creation successfully enqueued by the API. Job ID:', jobId);
        return { success: true, message: '¡Trabajo de creación de tienda enviado! Revisa el progreso en la sección de Trabajos.', jobId: jobId };

    } catch (error: any) {
        console.error('[Server Action Error] Failed to trigger store creation:', error.response?.data || error.message);
        // Extract more detailed error message if available from axios response
        const errorDetails = error.response?.data?.details?.message || error.response?.data?.error || error.message;
        const errorMessage = `No se pudo iniciar el trabajo: ${errorDetails}`;
        return { success: false, message: errorMessage };
    }
}
