
import { NextRequest, NextResponse } from "next/server";
import { adminAuth } from "@/lib/firebase-admin";
import axios from "axios";

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
    return NextResponse.json({ success: false, error: "Token de autenticación inválido o expirado" }, { status: 401 });
  }

  try {
    const { filename } = await req.json();
    if (!filename) {
      return NextResponse.json({ success: false, error: "No se proporcionó nombre de archivo para eliminar" }, { status: 400 });
    }

    // This assumes your external server has a `borrarfoto.php` script that accepts a POST request
    // with a `filename` in the body to delete the specified file.
    const deleteUrl = "https://quefoto.es/borrarfoto.php";
    console.log(`[API /api/delete-image] Enviando solicitud para eliminar ${filename} a ${deleteUrl}`);
    
    // We send data as application/x-www-form-urlencoded as PHP often expects it this way
    const params = new URLSearchParams();
    params.append('filename', filename);

    const response = await axios.post(deleteUrl, params, {
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      timeout: 15000,
    });

    console.log(`[API /api/delete-image] Respuesta de ${deleteUrl}:`, response.data);

    if (response.data.success) {
      return NextResponse.json({ success: true, message: `Archivo ${filename} eliminado.` });
    } else {
      throw new Error(response.data.error || "Error desconocido del servidor de imágenes al eliminar.");
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
