// src/app/api/process-photos/route.ts
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

export async function POST(request: NextRequest) {
    return NextResponse.json({ error: 'Endpoint disabled for project reset.' }, { status: 503 });
}
