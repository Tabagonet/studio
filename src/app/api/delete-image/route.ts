import { NextRequest, NextResponse } from "next/server";
import { adminStorage } from "@/lib/firebase-admin";

const BUCKET_NAME = process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET;

export async function POST(req: NextRequest) {
  if (!adminStorage) {
    return NextResponse.json({ success: false, error: "Firebase Admin Storage not initialized." }, { status: 503 });
  }
  if (!BUCKET_NAME) {
     return NextResponse.json({ success: false, error: "Firebase Storage bucket name not configured." }, { status: 503 });
  }
  
  try {
    const { storagePath } = await req.json();

    if (!storagePath) {
      return NextResponse.json({ success: false, error: "No storage path provided." }, { status: 400 });
    }

    const bucket = adminStorage.bucket(BUCKET_NAME);
    await bucket.file(storagePath).delete({ignoreNotFound: true});

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error("Error deleting image from Firebase Storage:", error);
    return NextResponse.json({ success: false, error: "Failed to delete image." }, { status: 500 });
  }
}
