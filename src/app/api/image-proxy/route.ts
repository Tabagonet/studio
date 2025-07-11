
import { NextRequest, NextResponse } from 'next/server';

export async function GET(req: NextRequest) {
  return NextResponse.json({ error: 'This endpoint is disabled.' }, { status: 410 });
}
