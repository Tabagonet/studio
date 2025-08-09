
// src/app/api/upload-image/route.ts
import { NextRequest, NextResponse } from "next/server";
import { adminAuth } from "@/lib/firebase-admin";
import axios from "axios";
import FormDataLib from "form-data";
import { Readable } from 'stream';

export async function POST(req: NextRequest) {
  const token = req.headers.get("Authorization")?.split("Bearer ")[1];
  if (!token) {
    return NextResponse.json({ success: false, error: "No se proporcionó token de autenticación" }, { status: 401 });
  }

  try {
    if (!adminAuth) throw new Error("La autenticación del administrador de Firebase no está inicializada.");
    await adminAuth.verifyIdToken(token);
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error("Error verificando token en /api/upload-image:", error);
    return NextResponse.json({ success: false, error: `Token inválido: ${errorMessage}` }, { status: 401 });
  }

  try {
    const requestFormData = await req.formData();
    const imagen = requestFormData.get("imagen");

    if (!imagen || !(imagen instanceof File)) {
      return NextResponse.json({ success: false, error: "No se proporcionó ninguna imagen válida" }, { status: 400 });
    }

    const allowedTypes = ["image/jpeg", "image/jpg", "image/png", "image/gif", "image/webp"];
    if (!allowedTypes.includes(imagen.type)) {
      return NextResponse.json(
        { success: false, error: "Formato de imagen no permitido. Usa JPEG, PNG, GIF o WebP." },
        { status: 400 }
      );
    }

    const imageBuffer = Buffer.from(await imagen.arrayBuffer());
    
    console.log(`[API /api/upload-image] Enviando a quefoto.es/cargafotos.php con filename: ${imagen.name}`);

    const uploadFormData = new FormDataLib();
    uploadFormData.append("imagen", imageBuffer, {
        filename: imagen.name,
        contentType: imagen.type,
    });


    let response;
    try {
      response = await axios.post("https://quefoto.es/cargafotos.php", uploadFormData, {
        headers: {
          ...uploadFormData.getHeaders(),
        },
        timeout: 30000, 
      });
    } catch (axiosError) {
      console.error("Error en la solicitud a quefoto.es/cargafotos.php:", axiosError);
      const errorMessage = axiosError instanceof Error ? axiosError.message : String(axiosError);
      if (axios.isAxiosError(axiosError) && axiosError.response) {
        console.error("Axios error response data:", axiosError.response.data);
        console.error("Axios error response status:", axiosError.response.status);
      }
      return NextResponse.json(
        { success: false, error: `Error al conectar con el servidor de imágenes: ${errorMessage}` },
        { status: 500 }
      );
    }

    const data = response.data;
    console.log("Respuesta de quefoto.es/cargafotos.php:", data);

    if (typeof data !== "object" || data === null || !data.hasOwnProperty("success")) {
      const errorMsg = "Respuesta inválida del servidor de imágenes quefoto.es. No se recibió un objeto JSON con el campo 'success'.";
      console.error(errorMsg, data);
      throw new Error(errorMsg);
    }
    
    if (data.success && !data.url) {
      const errorMsg = "El servidor de imágenes quefoto.es indicó éxito pero no devolvió una URL.";
      console.error(errorMsg, data);
      throw new Error(errorMsg);
    }

    if (!data.success) {
       const errorMsg = data.error || "Error desconocido al subir la imagen al servidor quefoto.es.";
       console.error("Error reportado por quefoto.es/cargafotos.php:", errorMsg);
       throw new Error(errorMsg);
    }
    
    let sanitizedUrl = data.url;
    if (sanitizedUrl && !sanitizedUrl.startsWith('http')) {
        sanitizedUrl = `https://${sanitizedUrl.replace(/^(https?:\/\/)?/, '')}`;
    }
    
    return NextResponse.json({ 
        success: true, 
        url: sanitizedUrl, 
        filename_saved_on_server: data.filename_saved,
        // No esperamos media_id del script actual
    });
  } catch (error) {
    console.error("Error al procesar la imagen en /api/upload-image:", error);
    const errorMessage = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ success: false, error: errorMessage }, { status: 500 });
  }
}
