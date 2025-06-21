import { NextRequest, NextResponse } from "next/server";
import { adminStorage } from "@/lib/firebase-admin";
import { v4 as uuidv4 } from 'uuid';

const BUCKET_NAME = process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET;

export async function POST(req: NextRequest) {
  if (!adminStorage) {
    return NextResponse.json({ success: false, error: "Firebase Admin Storage not initialized." }, { status: 503 });
  }
  if (!BUCKET_NAME) {
    return NextResponse.json({ success: false, error: "Firebase Storage bucket name not configured." }, { status: 503 });
  }

  try {
    const formData = await req.formData();
    const file = formData.get("file") as File | null;

    if (!file) {
      return NextResponse.json({ success: false, error: "No file provided." }, { status: 400 });
    }

    const fileBuffer = Buffer.from(await file.arrayBuffer());
    const fileExtension = file.name.split('.').pop();
    const uniqueFilename = `${uuidv4()}.${fileExtension}`;
    const filePath = `product-images/${uniqueFilename}`;

    const bucket = adminStorage.bucket(BUCKET_NAME);
    const fileUpload = bucket.file(filePath);

    await fileUpload.save(fileBuffer, {
      metadata: {
        contentType: file.type,
      },
    });

    // Get signed URL which is a more secure way than making files public
    const [publicUrl] = await fileUpload.getSignedUrl({
        action: 'read',
        expires: '03-09-2491' // A long time in the future
    });

    return NextResponse.json({ success: true, url: publicUrl, storagePath: filePath });
  } catch (error) {
    console.error("Error uploading image to Firebase Storage:", error);
    return NextResponse.json({ success: false, error: "Failed to upload image." }, { status: 500 });
  }
}
