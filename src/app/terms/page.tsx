
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import Link from "next/link";
import { APP_NAME } from "@/lib/constants";

export default function TermsOfServicePage() {
  return (
    <div className="bg-muted min-h-screen py-12">
      <div className="container mx-auto max-w-4xl">
        <Card className="shadow-lg">
          <CardHeader>
            <CardTitle className="text-3xl font-bold text-center">Términos y Condiciones del Servicio</CardTitle>
            <CardDescription className="text-center">Última actualización: {new Date().toLocaleDateString('es-ES', { year: 'numeric', month: 'long', day: 'numeric' })}</CardDescription>
          </CardHeader>
          <CardContent className="prose prose-sm md:prose-base max-w-none text-muted-foreground">
            <p>
              Estos términos y condiciones ("Términos") rigen tu acceso y uso de la aplicación web {APP_NAME} (el "Servicio"), operada por {`Grupo 4 alas S.L.`} ("nosotros", "nuestro"). Al acceder o utilizar el Servicio, aceptas estar sujeto a estos Términos.
            </p>

            <h3>1. Cuentas de Usuario y Aprobación</h3>
            <p>
              Para utilizar el Servicio, debes registrarte utilizando una cuenta de un proveedor de autenticación de terceros, como Google. Cada nueva cuenta está sujeta a un proceso de aprobación manual por parte de un administrador. Nos reservamos el derecho, a nuestra entera discreción, de aprobar, rechazar o revocar el acceso a cualquier cuenta sin previo aviso ni responsabilidad. No se te permitirá acceder a las funcionalidades del Servicio hasta que tu cuenta haya sido aprobada.
            </p>

            <h3>2. Uso del Servicio</h3>
            <p>
              El Servicio está diseñado para ayudarte a automatizar la creación y gestión de productos en tus tiendas de WooCommerce. Aceptas utilizar el Servicio solo para los fines previstos y de conformidad con todas las leyes y regulaciones aplicables.
            </p>
            <ul>
              <li><strong>Credenciales API:</strong> Eres el único responsable de obtener y proteger tus credenciales API (claves de WooCommerce, contraseñas de aplicación de WordPress). Debes asegurarte de que tienes los permisos necesarios para utilizar estas credenciales.</li>
              <li><strong>Conducta del Usuario:</strong> No debes utilizar el Servicio para ningún propósito ilegal o no autorizado. Aceptas no interferir ni interrumpir el Servicio o los servidores y redes conectados al Servicio.</li>
            </ul>
            
            <h3>3. Contenido del Usuario</h3>
            <p>
              Tú retienes todos los derechos sobre la información, datos, imágenes, prompts de IA y otros materiales que proporcionas al Servicio ("Contenido del Usuario"). Al utilizar el Servicio, nos otorgas una licencia limitada para usar, modificar, procesar y transmitir tu Contenido del Usuario con el único propósito de proporcionarte el Servicio. No reclamamos ninguna propiedad sobre tu Contenido del Usuario. Eres el único responsable de la exactitud, calidad y legalidad de tu Contenido del Usuario.
            </p>
            
            <h3>4. Propiedad Intelectual</h3>
            <p>
              El Servicio y su contenido original, características y funcionalidades son y seguirán siendo propiedad exclusiva de {`Grupo 4 alas S.L.`} y sus licenciantes. El Servicio está protegido por derechos de autor, marcas comerciales y otras leyes.
            </p>

            <h3>5. Terminación de la Cuenta</h3>
            <p>
              Podemos suspender o cancelar tu cuenta y prohibir el acceso al Servicio de inmediato, sin previo aviso ni responsabilidad, por cualquier motivo, incluido, entre otros, el incumplimiento de estos Términos.
            </p>

            <h3>6. Limitación de Responsabilidad</h3>
            <p>
              El Servicio se proporciona "TAL CUAL" y "SEGÚN DISPONIBILIDAD". En la máxima medida permitida por la ley aplicable, renunciamos a todas las garantías, expresas o implícitas. No garantizamos que el Servicio funcionará sin interrupciones, de forma segura o disponible en cualquier momento o lugar; que cualquier error o defecto será corregido; o que los resultados del uso del Servicio cumplirán con tus requisitos.
            </p>
            <p>
              En ningún caso {`Grupo 4 alas S.L.`} será responsable de ninguna pérdida o daño, incluida la pérdida de datos, la interrupción del negocio o cualquier otro daño resultante de tu uso o incapacidad para usar el Servicio o de errores en tus tiendas conectados al Servicio.
            </p>

            <h3>7. Cambios en los Términos</h3>
            <p>
              Nos reservamos el derecho, a nuestra entera discreción, de modificar o reemplazar estos Términos en cualquier momento. Si una revisión es material, intentaremos proporcionar un aviso con al menos 30 días de antelación antes de que los nuevos términos entren en vigor.
            </p>

            <h3>8. Ley Aplicable</h3>
            <p>
              Estos Términos se regirán e interpretarán de acuerdo con las leyes de {`España`}, sin tener en cuenta sus disposiciones sobre conflictos de leyes.
            </p>
            
            <h3>9. Contacto</h3>
            <p>
              Si tienes alguna pregunta sobre estos Términos, por favor, contáctanos en: <a href="mailto:intelvisual@intelvisual.es">intelvisual@intelvisual.es</a>.
            </p>
            <div className="text-center pt-6">
                <Link href="/login" className="text-sm text-primary hover:underline">Volver al inicio de sesión</Link>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
