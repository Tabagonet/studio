// src/app/api/delete-image/route.ts
import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
  return NextResponse.json({ success: false, error: "Endpoint disabled for project reset." }, { status: 503 });
}
