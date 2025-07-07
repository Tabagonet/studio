
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import Link from "next/link";
import { APP_NAME, SUPPORT_EMAIL } from "@/lib/constants";
import { adminDb } from '@/lib/firebase-admin';

export const dynamic = 'force-dynamic';
export const revalidate = 0; // Ensure the page is always re-rendered

const defaultCookiePolicy = `
<h1>Política de Cookies</h1>
<p>Esta Política de Cookies explica qué son las cookies y cómo las utilizamos en ${APP_NAME}. Le recomendamos que lea esta política para que pueda entender qué tipo de cookies utilizamos, o la información que recopilamos usando cookies y cómo se usa esa información.</p>

<h3>¿Qué son las cookies?</h3>
<p>Las cookies son pequeños archivos de texto que se almacenan en su navegador cuando visita un sitio web. Permiten que el sitio recuerde información sobre su visita, como su idioma preferido y otras configuraciones. Esto puede facilitar su próxima visita y hacer que el sitio sea más útil para usted.</p>

<h3>¿Cómo utilizamos las cookies?</h3>
<p>En ${APP_NAME}, utilizamos cookies por una razón principal: <strong>garantizar el funcionamiento esencial de la aplicación</strong>. No utilizamos cookies para rastreo, publicidad o análisis de terceros.</p>
<p>Nuestro uso de cookies se limita a:</p>
<ul>
  <li><strong>Cookies Estrictamente Necesarias:</strong> Estas cookies son esenciales para que pueda navegar por el Servicio y utilizar sus funciones. Utilizamos cookies de <strong>Firebase Authentication</strong> para gestionar de forma segura su sesión de inicio de sesión. Sin estas cookies, el servicio de autenticación no podría proporcionarse.</li>
  <li><strong>Cookies de Consentimiento:</strong> Almacenamos una cookie simple para recordar si ha aceptado nuestra política de cookies, para no volver a mostrarle el banner en futuras visitas.</li>
</ul>
<p>No utilizamos cookies de rendimiento, de funcionalidad, de seguimiento o de publicidad de terceros.</p>

<h3>Cómo puede gestionar las cookies</h3>
<p>La mayoría de los navegadores web le permiten controlar las cookies a través de la configuración del navegador. Puede configurar su navegador para que le notifique cuándo recibe una cookie, dándole la opción de decidir si la acepta o no. También puede configurar su navegador para que rechace todas las cookies. Sin embargo, tenga en cuenta que si no acepta nuestras cookies, es posible que no pueda utilizar algunas partes de nuestro Servicio, ya que la autenticación depende de ellas.</p>
<p>Para obtener más información sobre cómo gestionar y eliminar cookies, visite <a href="https://www.allaboutcookies.org" target="_blank" rel="noopener noreferrer">allaboutcookies.org</a>.</p>

<h3>Contacto</h3>
<p>Si tiene alguna pregunta sobre nuestro uso de cookies, puede contactarnos en: <a href="mailto:${SUPPORT_EMAIL}">${SUPPORT_EMAIL}</a>.</p>
`;

async function getCookiePolicy() {
    if (!adminDb) return defaultCookiePolicy;
    try {
        const docRef = adminDb.collection('config').doc('legal');
        const doc = await docRef.get();
        if (!doc.exists || !doc.data()?.cookiePolicy) return defaultCookiePolicy;
        return doc.data()!.cookiePolicy;
    } catch (error) {
        console.error("Failed to fetch cookie policy:", error);
        return defaultCookiePolicy;
    }
}


export default async function CookiePolicyPage() {
  const content = await getCookiePolicy();

  return (
    <div className="bg-muted min-h-screen py-12">
      <div className="container mx-auto max-w-4xl">
        <Card className="shadow-lg">
          <CardHeader>
            <CardTitle className="text-3xl font-bold text-center">Política de Cookies</CardTitle>
            <CardDescription className="text-center">Última actualización: {new Date().toLocaleDateString('es-ES', { year: 'numeric', month: 'long', day: 'numeric' })}</CardDescription>
          </CardHeader>
          <CardContent>
            <div
              className="prose prose-sm md:prose-base max-w-none text-muted-foreground"
              dangerouslySetInnerHTML={{ __html: content }}
            />
            <div className="text-center pt-6">
                <Link href="/login" className="text-sm text-primary hover:underline">Volver al inicio de sesión</Link>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
