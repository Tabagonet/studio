
import { NextRequest, NextResponse } from 'next/server';

export async function GET(req: NextRequest) {
   const { searchParams } = new URL(req.url);
   const error = searchParams.get('error');
   const errorDescription = searchParams.get('error_description');
   
   // This endpoint is part of a deprecated flow.
   // It will redirect back to the connections page with an informative error.
   const settingsUrl = new URL('/settings/connections', process.env.NEXT_PUBLIC_BASE_URL!);
   
   if (error) {
       settingsUrl.searchParams.set('shopify_auth', 'error');
       settingsUrl.searchParams.set('error_message', `Error de autorización de Shopify: ${error} - ${errorDescription || 'Sin detalles.'}`);
   } else {
       settingsUrl.searchParams.set('shopify_auth', 'error');
       settingsUrl.searchParams.set('error_message', 'Este flujo de autenticación está obsoleto. Por favor, utiliza el método de "Partner API Access Token".');
   }
   
   return NextResponse.redirect(settingsUrl);
}
