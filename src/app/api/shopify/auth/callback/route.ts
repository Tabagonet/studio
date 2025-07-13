
import { NextRequest, NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebase-admin';
import { validateHmac, getPartnerCredentials } from '@/lib/api-helpers';
import axios from 'axios';

// This file is no longer used by the direct token flow, but kept for reference.
export async function GET(req: NextRequest) {
    const { searchParams } = new URL(req.url);
    const baseUrl = process.env.NEXT_PUBLIC_BASE_URL;
    if (!baseUrl) {
        throw new Error("NEXT_PUBLIC_BASE_URL is not set in environment variables.");
    }
    const settingsUrl = new URL('/settings/connections', baseUrl);
    settingsUrl.searchParams.set('shopify_auth', 'error');
    settingsUrl.searchParams.set('error_message', "Este flujo de autenticación está obsoleto. Por favor, usa el método de token de acceso directo.");
    return NextResponse.redirect(settingsUrl);
}
