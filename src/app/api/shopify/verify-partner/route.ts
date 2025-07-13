
// This file is no longer used by the new OAuth flow and can be removed or left as-is.
// The new verification happens implicitly when the user approves the OAuth consent screen.
import { NextRequest, NextResponse } from 'next/server';

export async function POST(req: NextRequest) {
    return NextResponse.json({ success: true, message: 'Endpoint obsoleto. La verificación ahora usa OAuth 2.0.' });
}
