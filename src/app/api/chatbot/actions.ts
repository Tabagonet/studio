
'use server';

import { adminDb, admin } from '@/lib/firebase-admin';
import axios from 'axios';

/**
 * This file is being kept for potential future use with the strategic analysis flow,
 * but the store creation logic has been moved directly into the chatbot API route
 * to simplify the architecture and resolve server-side request failures.
 */
export async function handleStoreCreationAction() {
    // This function is deprecated for the chatbot flow.
    // The logic is now handled directly in /api/chatbot/route.ts to prevent
    // server-to-server call issues within the same application.
    throw new Error("handleStoreCreationAction is deprecated and should not be called directly from the chatbot.");
}
