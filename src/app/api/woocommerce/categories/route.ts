import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

export async function GET(request: NextRequest) {
  // Return an empty array to prevent errors in components that call this.
  return NextResponse.json([], { status: 200 });
}
