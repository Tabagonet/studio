// This file is no longer used by the new workflow and can be safely removed.
// The new flow starts with a user-created dev store, and the population logic
// is triggered from a different endpoint after authorization.
import { NextRequest, NextResponse } from 'next/server';

export async function POST(req: NextRequest) {
    console.warn("Attempted to call deprecated endpoint: /api/tasks/create-shopify-store");
    return NextResponse.json({
        error: "This endpoint is deprecated. The new workflow assigns an existing store."
    }, { status: 410 });
}
