// This file is no longer used as site limits are now managed by plans.
// It can be safely deleted.
import { NextRequest, NextResponse } from 'next/server';

export async function POST(req: NextRequest, { params }: { params: { userId: string } }) {
    return NextResponse.json({ error: 'This endpoint is deprecated. Site limits are now managed via plans.' }, { status: 410 });
}
