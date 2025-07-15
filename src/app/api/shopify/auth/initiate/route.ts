// This file is no longer used and can be deleted.
// The logic has been moved to a server action for better security and flow control.
import { NextRequest, NextResponse } from 'next/server';

export async function GET(req: NextRequest) {
    return NextResponse.json({ error: 'This endpoint is deprecated.' }, { status: 410 });
}
