// src/ai/genkit.ts
'use server';
/**
 * @fileoverview Centralized Firebase Admin initialization.
 * This file ensures that Firebase Admin is configured and initialized once for the server.
 * Genkit initialization and AI logic has been moved to API routes directly to avoid bundling issues.
 */

import { initializeApp, getApps } from 'firebase-admin/app';

// Ensure Firebase Admin is initialized only once.
if (getApps().length === 0) {
  try {
    initializeApp();
    console.log('Firebase Admin SDK initialized successfully in genkit.ts.');
  } catch (error) {
    console.error('Firebase Admin SDK initialization error in genkit.ts:', error);
  }
}
