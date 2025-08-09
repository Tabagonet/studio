// src/app/api/upload-image/route.ts

import { NextRequest, NextResponse } from 'next/server';
import { adminAuth, adminStorage } from '@/lib/firebase-admin';
import { v4 as uuidv4 } from 'uuid';
import sharp from 'sharp';

// This endpoint is only for direct uploads to Firebase Storage
// for temporary use cases like the wizard preview. It does not
// interact with WordPress.

export async function POST(req: NextRequest) {
    try {
        const token = req.headers.get("Authorization")?.split("Bearer ")[1];
        if (!token) {
            return NextResponse.json({ error: "No se proporcionó token de autenticación" }, { status: 401 });
        }
        if (!adminAuth) throw new Error("La autenticación del administrador de Firebase no está inicializada.");
        await adminAuth.verifyIdToken(token);
    } catch (error) {
        console.error("Error al verificar el token de Firebase:", error);
        const errorMessage = error instanceof Error ? error.message : "Token de autenticación inválido o expirado";
        return NextResponse.json({ error: errorMessage }, { status: 401 });
    }
    
    if (!adminStorage) {
         return NextResponse.json({ error: "Firebase Storage no está configurado en el servidor." }, { status: 503 });
    }

    try {
        const formData = await req.formData();
        const file = formData.get('imagen') as File | null;

        if (!file) {
            return NextResponse.json({ error: "No se encontró ningún archivo en la petición." }, { status: 400 });
        }

        const fileBuffer = await file.arrayBuffer();

        // Process with sharp for optimization
        const processedBuffer = await sharp(Buffer.from(fileBuffer))
            .resize(1200, 1200, { fit: 'inside', withoutEnlargement: true })
            .webp({ quality: 80 })
            .toBuffer();

        const bucket = adminStorage.bucket();
        const uniqueFilename = `${uuidv4()}-${file.name.replace(/\.[^/.]+$/, "")}.webp`;
        // Use a different path for these direct uploads to distinguish them from sideloading tasks
        const filePath = `user_uploads/direct/${uniqueFilename}`;
        const fileUpload = bucket.file(filePath);

        await fileUpload.save(processedBuffer, {
            metadata: { contentType: 'image/webp' },
            public: true, // Make the file publicly readable for previews
        });
        
        // Return the public URL
        const publicUrl = fileUpload.publicUrl();

        return NextResponse.json({ 
            success: true, 
            url: publicUrl, 
            filename_saved_on_server: filePath // Return the path for potential future reference
        });
    } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        console.error("[API upload-image] Error:", error);
        return NextResponse.json({ success: false, error: errorMessage }, { status: 500 });
    }
}
