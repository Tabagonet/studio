
import { NextRequest, NextResponse } from "next/server";
import { adminAuth } from "@/lib/firebase-admin";
import axios from "axios";
import FormData from "form-data";

export async function POST(req: NextRequest) {
  // Authentication
  const token = req.headers.get("Authorization")?.split("Bearer ")[1];
  if (!token) {
    return NextResponse.json({ success: false, error: "No se proporcionó token de autenticación" }, { status: 401 });
  }

  try {
    if (!adminAuth) throw new Error("La autenticación del administrador de Firebase no está inicializada.");
    await adminAuth.verifyIdToken(token);
  } catch (error) {
    console.error("Error al verificar el token de Firebase en /api/delete-image:", error);
    const errorMessage = error instanceof Error ? error.message : "Token de autenticación inválido o expirado";
    return NextResponse.json({ success: false, error: errorMessage }, { status: 401 });
  }

  try {
    const { filename } = await req.json();
    if (!filename) {
      return NextResponse.json({ success: false, error: "No se proporcionó nombre de archivo para eliminar" }, { status: 400 });
    }

    const deleteUrl = "https://quefoto.es/borrarfoto.php";
    console.log(`[API /api/delete-image] Enviando solicitud para eliminar ${filename} a ${deleteUrl}`);
    
    // Using FormData to be consistent with the upload API which is known to work.
    const deleteFormData = new FormData();
    deleteFormData.append('filename', filename);

    const response = await axios.post(deleteUrl, deleteFormData, {
      headers: {
        ...deleteFormData.getHeaders(),
      },
      timeout: 15000,
    });

    console.log(`[API /api/delete-image] Respuesta de ${deleteUrl}:`, response.data);

    // Make the response handling more robust.
    if (typeof response.data === 'object' && response.data !== null && response.data.success) {
      return NextResponse.json({ success: true, message: `Archivo ${filename} eliminado.` });
    } else if (typeof response.data === 'string' && response.data.toLowerCase().includes('success')) {
       return NextResponse.json({ success: true, message: `Archivo ${filename} eliminado.` });
    }
     else {
      const serverError = response.data?.error || (typeof response.data === 'string' ? response.data : "Error desconocido del servidor de imágenes al eliminar.");
      throw new Error(serverError);
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    if (axios.isAxiosError(error) && error.response) {
      console.error(`[API /api/delete-image] Error de Axios al contactar a quefoto.es:`, error.response.data);
    } else {
       console.error("[API /api/delete-image] Error general:", error);
    }
    return NextResponse.json({ success: false, error: errorMessage }, { status: 500 });
  }
}
