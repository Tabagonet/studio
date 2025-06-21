// src/app/api/upload-image-local/route.ts
import { NextRequest, NextResponse } from 'next/server';

export async function POST(request: NextRequest) {
    return NextResponse.json({ success: false, error: 'Endpoint disabled for project reset.' }, { status: 503 });
}
