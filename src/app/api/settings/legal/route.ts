
import { NextRequest, NextResponse } from 'next/server';
import { adminAuth, adminDb } from '@/lib/firebase-admin';
import { z } from 'zod';
import { APP_NAME, SUPPORT_EMAIL } from '@/lib/constants';

async function isSuperAdmin(req: NextRequest): Promise<boolean> {
    const token = req.headers.get('Authorization')?.split('Bearer ')[1];
    if (!token) return false;
    try {
        if (!adminAuth || !adminDb) throw new Error("Firebase Admin not initialized");
        const decodedToken = await adminAuth.verifyIdToken(token);
        const userDoc = await adminDb.collection('users').doc(decodedToken.uid).get();
        return userDoc.exists && userDoc.data()?.role === 'super_admin';
    } catch {
        return false;
    }
}

const legalTextsSchema = z.object({
  privacyPolicy: z.string(),
  termsOfService: z.string(),
  cookiePolicy: z.string(),
});

const defaultTexts = {
    privacyPolicy: `<h1>Política de Privacidad</h1>
<p>Bienvenido a ${APP_NAME}. Tu privacidad es de suma importancia para nosotros. Esta Política de Privacidad explica cómo ${`Grupo 4 alas S.L.`} ("nosotros", "nuestro") recopila, usa, comparte y protege tu información en relación con el uso de nuestra aplicación web ${APP_NAME} (el "Servicio").</p>

<h3>1. Información que Recopilamos</h3>
<p>Recopilamos varios tipos de información para proporcionar y mejorar nuestro Servicio:</p>
<ul>
  <li><strong>Información de Autenticación:</strong> Cuando te registras o inicias sesión con un proveedor externo como Google, recibimos información de tu perfil, como tu nombre, dirección de correo electrónico y foto de perfil. Usamos esta información únicamente para crear y gestionar tu cuenta.</li>
  <li><strong>Datos de Conexión:</strong> Para que el Servicio funcione, debes proporcionar credenciales para servicios de terceros, como las claves API de WooCommerce y las contraseñas de aplicación de WordPress ("Datos de Conexión"). Estos datos se almacenan de forma segura en nuestra base de datos (Firestore) y se asocian exclusivamente a tu cuenta de usuario.</li>
  <li><strong>Contenido Generado por el Usuario:</strong> Recopilamos la información que proporcionas directamente al Servicio, lo que incluye, entre otros, los prompts de IA personalizados que guardas, los nombres de productos, los SKUs y los archivos (imágenes, CSVs) que subes para su procesamiento.</li>
  <li><strong>Datos de Uso y Acciones:</strong> Registramos información sobre cómo interactúas con el Servicio. Esto incluye acciones como la creación de productos, modificaciones, uso de funciones de IA y las conexiones utilizadas. Estos registros ("Logs de Acciones") se asocian a tu cuenta y se utilizan para fines estadísticos y de monitorización por parte del administrador del sistema.</li>
  <li><strong>Información de Prospectos (Chatbot):</strong> A través de nuestro chatbot público, podemos recopilar información de contacto (nombre, email) e información sobre el negocio (URL, objetivos, presupuesto) de clientes potenciales que interactúan voluntariamente con él.</li>
</ul>

<h3>2. Cómo Usamos tu Información</h3>
<p>Utilizamos la información que recopilamos para los siguientes propósitos:</p>
<ul>
  <li><strong>Para proporcionar y mantener el Servicio:</strong> Usamos tus Datos de Conexión para interactuar con tus tiendas de WooCommerce y WordPress, y el Contenido Generado por el Usuario para llevar a cabo las acciones que solicitas (por ejemplo, crear un producto).</li>
  <li><strong>Para gestionar tu cuenta:</strong> Incluyendo la comunicación contigo sobre tu cuenta y el proceso de aprobación de nuevos usuarios.</li>
  <li><strong>Para mejorar el Servicio:</strong> Analizamos los Datos de Uso para entender cómo se utiliza la aplicación, identificar problemas y planificar nuevas funcionalidades.</li>
  <li><strong>Para fines administrativos y de seguridad:</strong> El administrador del sistema tiene acceso a los Logs de Acciones para monitorizar la actividad, garantizar el correcto funcionamiento y la seguridad del Servicio. Los datos de prospectos se utilizan para fines comerciales legítimos de seguimiento.</li>
  <li><strong>Para proteger nuestros servicios:</strong> Usamos Google reCAPTCHA en nuestro chatbot para protegerlo contra spam y abuso.</li>
</ul>

<h3>3. Cómo Compartimos tu Información</h3>
<p>No vendemos ni alquilamos tu información personal. Podemos compartir tu información en las siguientes circunstancias limitadas:</p>
<ul>
  <li><strong>Con los Servicios de Terceros que Conectas:</strong> Enviamos datos a las APIs de WooCommerce y WordPress según tus instrucciones para crear o modificar productos y subir archivos multimedia.</li>
  <li><strong>Con Proveedores de IA:</strong> La información necesaria para generar contenido (como el nombre del producto y las palabras clave) se envía a proveedores de modelos de lenguaje, como Google (a través de su API Gemini), para procesar tu solicitud. No compartimos tus claves API personales con ellos.</li>
  <li><strong>Requisitos Legales:</strong> Podemos divulgar tu información si así lo exige la ley o en respuesta a solicitudes válidas de las autoridades públicas.</li>
</ul>

<h3>4. Almacenamiento y Seguridad de Datos</h3>
<p>Tus Datos de Conexión y otro tipo de información sensible se almacenan en la base de datos de Google Firestore. Implementamos medidas de seguridad razonables para proteger tu información, incluyendo el cifrado en tránsito y en reposo. Sin embargo, ningún método de transmisión por Internet o de almacenamiento electrónico es 100% seguro.</p>

<h3>5. Tus Derechos sobre tus Datos</h3>
<p>Tienes derecho a acceder, corregir o solicitar la eliminación de tus datos personales. Puedes gestionar tus Datos de Conexión directamente desde la sección de "Configuración" de la aplicación. Para solicitar la eliminación de tu cuenta y todos los datos asociados, por favor, contáctanos.</p>

<h3>6. Cookies y Tecnologías Similares</h3>
<p>Utilizamos cookies estrictamente necesarias para el funcionamiento del Servicio, principalmente para gestionar tu sesión de autenticación a través de Firebase. Nuestro banner de cookies te informa de este uso. No utilizamos cookies de seguimiento o publicitarias de terceros.</p>

<h3>7. Privacidad de los Niños</h3>
<p>Nuestro Servicio no está dirigido a menores de 13 años. No recopilamos intencionadamente información de identificación personal de niños menores de 13 años.</p>

<h3>8. Cambios en esta Política de Privacidad</h3>
<p>Podemos actualizar nuestra Política de Privacidad de vez en cuando. Te notificaremos cualquier cambio publicando la nueva Política de Privacidad en esta página. Se te aconseja revisar esta Política de Privacidad periódicamente para cualquier cambio.</p>

<h3>9. Contacto</h3>
<p>Si tienes alguna pregunta sobre esta Política de Privacidad, por favor, contáctanos en: <a href="mailto:intelvisual@intelvisual.es">intelvisual@intelvisual.es</a>.</p>`,
    termsOfService: `<h1>Términos y Condiciones del Servicio</h1>
<p>
  Estos términos y condiciones ("Términos") rigen tu acceso y uso de la aplicación web ${APP_NAME} (el "Servicio"), operada por ${`Grupo 4 alas S.L.`} ("nosotros", "nuestro"). Al acceder o utilizar el Servicio, aceptas estar sujeto a estos Términos.
</p>

<h3>1. Cuentas de Usuario y Aprobación</h3>
<p>
  Para utilizar el Servicio, debes registrarte utilizando una cuenta de un proveedor de autenticación de terceros, como Google. Cada nueva cuenta está sujeta a un proceso de aprobación manual por parte de un administrador. Nos reservamos el derecho, a nuestra entera discreción, de aprobar, rechazar o revocar el acceso a cualquier cuenta sin previo aviso ni responsabilidad. No se te permitirá acceder a las funcionalidades del Servicio hasta que tu cuenta haya sido aprobada.
</p>

<h3>2. Uso del Servicio</h3>
<p>
  El Servicio está diseñado para ayudarte a automatizar la creación y gestión de productos, contenido y estrategias de marketing para tus sitios web de WooCommerce y WordPress. Aceptas utilizar el Servicio solo para los fines previstos y de conformidad con todas las leyes y regulaciones aplicables.
</p>
<ul>
  <li><strong>Credenciales API:</strong> Eres el único responsable de obtener y proteger tus credenciales API (claves de WooCommerce, contraseñas de aplicación de WordPress). Debes asegurarte de que tienes los permisos necesarios para utilizar estas credenciales. Al introducirlas en nuestro Servicio, nos autorizas a actuar en tu nombre para realizar las acciones que solicites en tus sitios web.</li>
  <li><strong>Conducta del Usuario:</strong> No debes utilizar el Servicio para ningún propósito ilegal o no autorizado. Aceptas no interferir ni interrumpir el Servicio o los servidores y redes conectados al Servicio.</li>
  <li><strong>Uso de IA:</strong> El Servicio utiliza modelos de inteligencia artificial para generar contenido. Eres responsable de revisar, editar y verificar la exactitud y adecuación de todo el contenido generado por la IA antes de publicarlo en tus sitios web. No nos hacemos responsables de la precisión, legalidad o idoneidad del contenido generado.</li>
</ul>

<h3>3. Contenido del Usuario</h3>
<p>
  Tú retienes todos los derechos sobre la información, datos, imágenes, prompts de IA y otros materiales que proporcionas al Servicio ("Contenido del Usuario"). Al utilizar el Servicio, nos otorgas una licencia limitada para usar, modificar, procesar y transmitir tu Contenido del Usuario con el único propósito de proporcionarte el Servicio. No reclamamos ninguna propiedad sobre tu Contenido del Usuario. Eres el único responsable de la exactitud, calidad y legalidad de tu Contenido del Usuario.
</p>

<h3>4. Propiedad Intelectual</h3>
<p>
  El Servicio y su contenido original, características y funcionalidades son y seguirán siendo propiedad exclusiva de ${`Grupo 4 alas S.L.`} y sus licenciantes. El Servicio está protegido por derechos de autor, marcas comerciales y otras leyes.
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
  En ningún caso ${`Grupo 4 alas S.L.`} será responsable de ninguna pérdida o daño, incluida la pérdida de datos, la interrupción del negocio o cualquier otro daño resultante de tu uso o incapacidad para usar el Servicio o de errores en tus tiendas conectados al Servicio.
</p>

<h3>7. Ley Aplicable</h3>
<p>
  Estos Términos se regirán e interpretarán de acuerdo con las leyes de ${`España`}, sin tener en cuenta sus disposiciones sobre conflictos de leyes.
</p>

<h3>8. Cambios en los Términos</h3>
<p>
  Nos reservamos el derecho, a nuestra entera discreción, de modificar o reemplazar estos Términos en cualquier momento. Si una revisión es material, intentaremos proporcionar un aviso con al menos 30 días de antelación antes de que los nuevos términos entren en vigor.
</p>

<h3>9. Contacto</h3>
<p>
  Si tienes alguna pregunta sobre estos Términos, por favor, contáctanos en: <a href="mailto:intelvisual@intelvisual.es">intelvisual@intelvisual.es</a>.
</p>`,
    cookiePolicy: `<h1>Política de Cookies</h1>
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
<p>Si tienes alguna pregunta sobre nuestro uso de cookies, puede contactarnos en: <a href="mailto:${SUPPORT_EMAIL}">${SUPPORT_EMAIL}</a>.</p>`,
};

export async function GET(req: NextRequest) {
    if (!await isSuperAdmin(req)) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
    if (!adminDb) {
        return NextResponse.json({ error: 'Firestore no configurado.' }, { status: 503 });
    }

    try {
        const docRef = adminDb.collection('config').doc('legal');
        const doc = await docRef.get();

        if (!doc.exists) {
            await docRef.set(defaultTexts);
            return NextResponse.json(defaultTexts);
        }
        
        const data = doc.data();
        return NextResponse.json({
            privacyPolicy: data?.privacyPolicy || defaultTexts.privacyPolicy,
            termsOfService: data?.termsOfService || defaultTexts.termsOfService,
            cookiePolicy: data?.cookiePolicy || defaultTexts.cookiePolicy,
        });
    } catch (e: any) {
        return NextResponse.json({ error: e.message }, { status: 500 });
    }
}


export async function POST(req: NextRequest) {
    if (!await isSuperAdmin(req)) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
    if (!adminDb) {
        return NextResponse.json({ error: 'Firestore no configurado.' }, { status: 503 });
    }

    try {
        const body = await req.json();
        const validation = legalTextsSchema.safeParse(body);

        if (!validation.success) {
            return NextResponse.json({ error: 'Invalid data', details: validation.error.flatten() }, { status: 400 });
        }
        
        const docRef = adminDb.collection('config').doc('legal');
        await docRef.set(validation.data, { merge: true });
        
        return NextResponse.json({ success: true, message: "Textos legales actualizados." });

    } catch (e: any) {
        return NextResponse.json({ error: e.message }, { status: 500 });
    }
}
