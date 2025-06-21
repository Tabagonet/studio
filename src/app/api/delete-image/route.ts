import { NextRequest, NextResponse } from "next/server";
import { adminAuth } from "@/lib/firebase-admin"; // Corrected import
import axios from "axios";

export async function POST(req: NextRequest) {
  const token = req.headers.get("Authorization")?.split("Bearer ")[1];
  if (!token) {
    return NextResponse.json({ success: false, error: "No se proporcionó token" }, { status: 401 });
  }

  try {
    if (adminAuth) {
        await adminAuth.verifyIdToken(token);
    } else {
        throw new Error("Firebase Admin Auth no está inicializado.");
    }
    // console.log("Token verificado correctamente en /api/delete-image");
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error("Error verificando token en /api/delete-image:", error);
    return NextResponse.json({ success: false, error: `Token inválido: ${errorMessage}` }, { status: 401 });
  }

  try {
    const body = await req.json();
    // console.log("Cuerpo recibido en /api/delete-image:", body);
    const { imageUrl } = body; // Expecting imageUrl in the request body
    if (!imageUrl) {
      return NextResponse.json({ success: false, error: "No se proporcionó URL de la imagen" }, { status: 400 });
    }

    const fileName = imageUrl.split("/").pop();
    if (!fileName) {
      return NextResponse.json({ success: false, error: "URL de imagen inválida" }, { status: 400 });
    }

    // console.log("Intentando eliminar archivo en quefoto.es:", fileName);

    let response;
    try {
      // The PHP script expects 'fileName' in a JSON body based on your example.
      response = await axios.post(
        "https://quefoto.es/delete.php",
        { fileName: fileName }, // Sending as JSON
        { headers: { "Content-Type": "application/json" } }
      );
    } catch (axiosError) {
      console.error("Error en la solicitud a quefoto.es/delete.php:", axiosError);
      const errorMessage = axiosError instanceof Error ? axiosError.message : String(axiosError);
      // Log more details from axios error if available
      if (axios.isAxiosError(axiosError) && axiosError.response) {
        console.error("Axios error response data:", axiosError.response.data);
        console.error("Axios error response status:", axiosError.response.status);
      }
      return NextResponse.json(
        { success: false, error: `Error al conectar con el servidor de imágenes para eliminar: ${errorMessage}` },
        { status: 500 }
      );
    }

    const data = response.data;
    // console.log("Respuesta de quefoto.es/delete.php:", data);
    
    if (typeof data !== "object" || data === null) {
      console.error("Respuesta inválida de quefoto.es/delete.php: no es un objeto JSON", data);
      throw new Error("Respuesta inválida del servidor de imágenes al eliminar: formato incorrecto.");
    }
    if (!data.hasOwnProperty("success")) {
      console.error("Respuesta inválida de quefoto.es/delete.php: falta 'success'", data);
      throw new Error("Respuesta inválida del servidor de imágenes al eliminar: falta 'success'.");
    }
    if (!data.success) {
       console.error("Error de quefoto.es/delete.php al eliminar:", data.error || "Error desconocido");
      throw new Error(data.error || "Error al eliminar la imagen en el servidor externo.");
    }

    return NextResponse.json({ success: true, message: "Imagen eliminada correctamente" });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error("Error al eliminar la imagen en /api/delete-image:", error);
    return NextResponse.json({ success: false, error: `Error al eliminar la imagen: ${errorMessage}` }, { status: 500 });
  }
}
