
// This file is intentionally left blank as it is no longer used.
// The deletion logic is now handled by the server action in `src/app/(app)/shopify/jobs/actions.ts`.
import { NextResponse } from 'next/server';

export async function DELETE() {
    return NextResponse.json({ success: true, message: 'This endpoint is deprecated. Use the server action instead.' });
}
