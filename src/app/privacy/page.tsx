
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import Link from "next/link";
import { APP_NAME } from "@/lib/constants";

export default function PrivacyPolicyPage() {
  return (
    <div className="bg-muted min-h-screen py-12">
      <div className="container mx-auto max-w-4xl">
        <Card className="shadow-lg">
          <CardHeader>
            <CardTitle className="text-3xl font-bold text-center">Política de Privacidad</CardTitle>
            <CardDescription className="text-center">Última actualización: {new Date().toLocaleDateString('es-ES', { year: 'numeric', month: 'long', day: 'numeric' })}</CardDescription>
          </CardHeader>
          <CardContent className="prose prose-sm md:prose-base max-w-none text-muted-foreground">
            <p>
              Bienvenido a {APP_NAME}. Tu privacidad es de suma importancia para nosotros. Esta Política de Privacidad explica cómo {`[Nombre de la Empresa/Tu Nombre]`} ("nosotros", "nuestro") recopila, usa, comparte y protege tu información en relación con el uso de nuestra aplicación web {APP_NAME} (el "Servicio").
            </p>

            <h3>1. Información que Recopilamos</h3>
            <p>Recopilamos varios tipos de información para proporcionar y mejorar nuestro Servicio:</p>
            <ul>
              <li>
                <strong>Información de Autenticación:</strong> Cuando te registras o inicias sesión con un proveedor externo como Google, recibimos información de tu perfil, como tu nombre, dirección de correo electrónico y foto de perfil. Usamos esta información únicamente para crear y gestionar tu cuenta.
              </li>
              <li>
                <strong>Datos de Conexión:</strong> Para que el Servicio funcione, debes proporcionar credenciales para servicios de terceros, como las claves API de WooCommerce y las contraseñas de aplicación de WordPress ("Datos de Conexión"). Estos datos se almacenan de forma segura en nuestra base de datos (Firestore) y se asocian exclusivamente a tu cuenta de usuario.
              </li>
              <li>
                <strong>Contenido Generado por el Usuario:</strong> Recopilamos la información que proporcionas directamente al Servicio, lo que incluye, entre otros, los prompts de IA personalizados que guardas, los nombres de productos, los SKUs y los archivos (imágenes, CSVs) que subes para su procesamiento.
              </li>
              <li>
                <strong>Datos de Uso y Acciones:</strong> Registramos información sobre cómo interactúas con el Servicio. Esto incluye acciones como la creación de productos, modificaciones, uso de funciones de IA y las conexiones utilizadas. Estos registros ("Logs de Acciones") se asocian a tu cuenta y se utilizan para fines estadísticos y de monitorización por parte del administrador del sistema.
              </li>
            </ul>

            <h3>2. Cómo Usamos tu Información</h3>
            <p>Utilizamos la información que recopilamos para los siguientes propósitos:</p>
            <ul>
              <li><strong>Para proporcionar y mantener el Servicio:</strong> Usamos tus Datos de Conexión para interactuar con tus tiendas de WooCommerce y WordPress, y el Contenido Generado por el Usuario para llevar a cabo las acciones que solicitas (por ejemplo, crear un producto).</li>
              <li><strong>Para gestionar tu cuenta:</strong> Incluyendo la comunicación contigo sobre tu cuenta y el proceso de aprobación de nuevos usuarios.</li>
              <li><strong>Para mejorar el Servicio:</strong> Analizamos los Datos de Uso para entender cómo se utiliza la aplicación, identificar problemas y planificar nuevas funcionalidades.</li>
              <li><strong>Para fines administrativos y de seguridad:</strong> El administrador del sistema tiene acceso a los Logs de Acciones para monitorizar la actividad, garantizar el correcto funcionamiento y la seguridad del Servicio.</li>
            </ul>

            <h3>3. Cómo Compartimos tu Información</h3>
            <p>No vendemos ni alquilamos tu información personal. Podemos compartir tu información en las siguientes circunstancias limitadas:</p>
            <ul>
              <li><strong>Con los Servicios de Terceros que Conectas:</strong> Enviamos datos a las APIs de WooCommerce y WordPress según tus instrucciones para crear o modificar productos y subir archivos multimedia.</li>
              <li><strong>Con Proveedores de IA:</strong> La información necesaria para generar contenido (como el nombre del producto y las palabras clave) se envía a proveedores de modelos de lenguaje, como Google (a través de su API Gemini), para procesar tu solicitud. No compartimos tus claves API personales con ellos.</li>
              <li><strong>Requisitos Legales:</strong> Podemos divulgar tu información si así lo exige la ley o en respuesta a solicitudes válidas de las autoridades públicas.</li>
            </ul>
            
            <h3>4. Almacenamiento y Seguridad de Datos</h3>
            <p>
              Tus Datos de Conexión y otro tipo de información sensible se almacenan en la base de datos de Google Firestore. Implementamos medidas de seguridad razonables para proteger tu información, incluyendo el cifrado en tránsito y en reposo. Sin embargo, ningún método de transmisión por Internet o de almacenamiento electrónico es 100% seguro.
            </p>

            <h3>5. Tus Derechos sobre tus Datos</h3>
            <p>
              Tienes derecho a acceder, corregir o solicitar la eliminación de tus datos personales. Puedes gestionar tus Datos de Conexión directamente desde la sección de "Configuración" de la aplicación. Para solicitar la eliminación de tu cuenta y todos los datos asociados, por favor, contáctanos.
            </p>

            <h3>6. Cookies y Tecnologías Similares</h3>
            <p>
              Utilizamos cookies estrictamente necesarias para el funcionamiento del Servicio, principalmente para gestionar tu sesión de autenticación a través de Firebase. No utilizamos cookies de seguimiento o publicitarias de terceros.
            </p>

            <h3>7. Privacidad de los Niños</h3>
            <p>
              Nuestro Servicio no está dirigido a menores de 13 años. No recopilamos intencionadamente información de identificación personal de niños menores de 13 años.
            </p>

            <h3>8. Cambios en esta Política de Privacidad</h3>
            <p>
              Podemos actualizar nuestra Política de Privacidad de vez en cuando. Te notificaremos cualquier cambio publicando la nueva Política de Privacidad en esta página. Se te aconseja revisar esta Política de Privacidad periódicamente para cualquier cambio.
            </p>

            <h3>9. Contacto</h3>
            <p>
              Si tienes alguna pregunta sobre esta Política de Privacidad, por favor, contáctanos en: <a href="mailto:[Tu Email de Contacto]">[Tu Email de Contacto]</a>.
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
