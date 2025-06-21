import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
  return NextResponse.json(
    { success: false, error: "This endpoint is deprecated and no longer in use." },
    { status: 410 } // 410 Gone
  );
}
