
// src/app/api/upload-image/route.ts
import { NextRequest, NextResponse } from "next/server";
import { adminAuth } from "@/lib/firebase-admin"; // Corrected import
import axios from "axios";
import FormDataLib from "form-data"; // Use form-data library for Node.js environment if axios needs it

export async function POST(req: NextRequest) {
  const token = req.headers.get("Authorization")?.split("Bearer ")[1];
  if (!token) {
    return NextResponse.json({ success: false, error: "No se proporcionó token" }, { status: 401 });
  }

  try {
    await adminAuth.verifyIdToken(token);
    // console.log("Token verificado correctamente en /api/upload-image");
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error("Error verificando token en /api/upload-image:", error);
    return NextResponse.json({ success: false, error: `Token inválido: ${errorMessage}` }, { status: 401 });
  }

  try {
    const requestFormData = await req.formData();
    const imagen = requestFormData.get("imagen"); // Name of the file input should be "imagen"

    if (!imagen || !(imagen instanceof File)) {
      return NextResponse.json({ success: false, error: "No se proporcionó ninguna imagen válida" }, { status: 400 });
    }

    // console.log("Nombre del archivo recibido en /api/upload-image:", imagen.name);
    // console.log("Tipo MIME del archivo:", imagen.type);
    // console.log("Tamaño del archivo:", imagen.size);

    const allowedTypes = ["image/jpeg", "image/jpg", "image/png", "image/gif", "image/webp"];
    if (!allowedTypes.includes(imagen.type)) {
      return NextResponse.json(
        { success: false, error: "Formato de imagen no permitido. Usa JPEG, PNG, GIF o WebP." },
        { status: 400 }
      );
    }

    // Convert File to Buffer for form-data library
    const imageBuffer = Buffer.from(await imagen.arrayBuffer());
    
    console.log(`[API /api/upload-image] Enviando a quefoto.es con filename: ${imagen.name}, contentType: ${imagen.type}, size: ${imageBuffer.length} bytes`);

    const uploadFormData = new FormDataLib(); // Use the library
    uploadFormData.append("imagen", imageBuffer, {
        filename: imagen.name,
        contentType: imagen.type,
    });


    let response;
    try {
      response = await axios.post("https://quefoto.es/upload.php", uploadFormData, {
        headers: {
          ...uploadFormData.getHeaders(), // Pass headers from form-data library
        },
        timeout: 30000, // Added timeout
      });
    } catch (axiosError) {
      console.error("Error en la solicitud a quefoto.es/upload.php:", axiosError);
      const errorMessage = axiosError instanceof Error ? axiosError.message : String(axiosError);
      // Log more details from axios error if available
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
    // console.log("Respuesta de quefoto.es/upload.php:", data);

    if (typeof data !== "object" || data === null) {
      console.error("Respuesta inválida de quefoto.es/upload.php: no es un objeto JSON", data);
      throw new Error("Respuesta inválida del servidor de imágenes: formato incorrecto.");
    }
    if (!data.hasOwnProperty("success")) {
       console.error("Respuesta inválida de quefoto.es/upload.php: falta el campo 'success'", data);
      throw new Error("Respuesta inválida del servidor de imágenes: falta el campo 'success'.");
    }
    if (data.success && !data.url) {
      console.error("Respuesta inválida de quefoto.es/upload.php: falta 'url' en respuesta exitosa", data);
      throw new Error("Respuesta inválida del servidor de imágenes: falta 'url' en respuesta exitosa.");
    }
    if (!data.success) {
      console.error("Error de quefoto.es/upload.php:", data.error || "Error desconocido");
      throw new Error(data.error || "Error al subir la imagen al servidor externo.");
    }

    return NextResponse.json({ success: true, url: data.url });
  } catch (error) {
    console.error("Error al procesar la imagen en /api/upload-image:", error);
    const errorMessage = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ success: false, error: errorMessage }, { status: 500 });
  }
}

