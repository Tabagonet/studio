
# Plan de Pruebas: Automatización de Shopify

Esta guía describe los pasos para realizar una prueba completa (end-to-end) del flujo de creación de tiendas de Shopify.

---

### ✅ Paso 1: Requisitos Previos

Antes de empezar, asegúrate de tener:

1.  **Una cuenta de Shopify Partner:** Puedes crear una gratis en [partners.shopify.com](https://partners.shopify.com).
2.  **Una API Key de Sistema:** En el archivo `.env.local` de este proyecto, asegúrate de que la variable `SHOPIFY_AUTOMATION_API_KEY` tiene un valor secreto que hayas inventado (ej: `super-secret-key-for-testing`). Esta clave es para autenticar la petición inicial del chatbot, no tiene que ver con las credenciales de Partner.

---

### 🔧 Paso 2: Configurar la App en Shopify Partner

Sigue la guía para clientes para crear una aplicación en tu panel de Shopify y obtener las credenciales.

*   **Ver guía:** `/docs/SHOPIFY_PARTNER_APP_SETUP.md`

Al final de este paso, deberías tener un **Client ID** y un **Client Secret**.

---

### 🔌 Paso 3: Configurar las Credenciales en AutoPress AI

1.  Inicia sesión en la aplicación AutoPress AI con una cuenta de Super Admin.
2.  Ve a **Ajustes > Conexiones**.
3.  Busca la tarjeta **"Conexión Global de Shopify Partners"**.
4.  Pega aquí el **Client ID** y el **Client Secret** que obtuviste en el paso anterior.
5.  Haz clic en **"Guardar Credenciales de Shopify"**.
6.  Ahora, sigue la guía del documento `SHOPIFY_PARTNER_APP_SETUP.md` para configurar también las **Credenciales de la API de Partner** (ID de Organización y Token). Guarda también esas credenciales.
7.  Refresca la página o el estado de la conexión. Deberías ver los indicadores de estado en verde o, al menos, como "Configurada".

---

### 🤖 Paso 4: Simular la Petición del Chatbot

Vamos a actuar como si fuéramos el chatbot, enviando una petición para crear una tienda. La forma más sencilla es usar `curl` desde tu terminal.

1.  **Copia el siguiente comando completo.**
2.  **Modifica los dos valores necesarios:**
    *   Reemplaza `TU_API_KEY_DE_SISTEMA` por la clave que pusiste en el archivo `.env.local`.
    *   Reemplaza `TU_UID_DE_FIREBASE` por el ID de tu usuario de Firebase (puedes encontrarlo en la base de datos o en la autenticación de Firebase).
3.  **Pega el comando modificado en tu terminal y ejecútalo.**

```bash
curl -X POST https://autopress.intelvisual.es/api/shopify/create-store \
-H "Content-Type: application/json" \
-H "Authorization: Bearer TU_API_KEY_DE_SISTEMA" \
-d '{
  "webhookUrl": "https://webhook.site/#!/a-test-url",
  "storeName": "Mi Tienda de Prueba Definitiva",
  "businessEmail": "tu.email+test@ejemplo.com",
  "countryCode": "ES",
  "currency": "EUR",
  "brandDescription": "Una tienda para probar la automatización de AutoPress AI.",
  "targetAudience": "Desarrolladores y equipos de producto.",
  "brandPersonality": "Funcional, robusta, eficiente",
  "productTypeDescription": "Productos digitales de prueba.",
  "creationOptions": {
    "createExampleProducts": true,
    "numberOfProducts": 2,
    "createAboutPage": true,
    "createContactPage": true,
    "createLegalPages": true,
    "createBlogWithPosts": true,
    "numberOfBlogPosts": 1,
    "setupBasicNav": true,
    "theme": "dawn"
  },
  "legalInfo": {
    "legalBusinessName": "Mi Empresa de Pruebas SL",
    "businessAddress": "Calle de la Prueba 123, 28080, Madrid"
  },
  "entity": {
    "type": "user",
    "id": "TU_UID_DE_FIREBASE"
  }
}'
```

---

### 🕵️ Paso 5: Monitorizar el Proceso

1.  **Respuesta Inmediata:** La terminal debería devolverte una respuesta `{"success":true,"jobId":"..."}` casi al instante. Esto significa que la tarea se ha encolado correctamente.
2.  **Panel de AutoPress AI:** Ve a la sección **Shopify > Trabajos de Creación** en la aplicación.
3.  **Verificar Estado:** Deberías ver una nueva fila en la tabla para "Mi Tienda de Prueba Definitiva".
    *   El estado inicial será **Pendiente**.
    *   Tras unos segundos, cambiará a **Procesando** y luego a **Esperando Autorización**. La página se actualiza sola.
    *   **¡Este es el paso clave!** En esta fase, el sistema te habría enviado (al `webhookUrl`) la URL de instalación. Como no tenemos un chatbot real, ve a la base de datos de Firestore, busca el `job` por su ID y copia el campo `installUrl`.
    *   Pega esa `installUrl` en tu navegador. Deberías ver la pantalla de consentimiento de Shopify. **¡Si ves esta pantalla, las credenciales de la App Personalizada (OAuth) funcionan!**
    *   Autoriza la instalación.
    *   El estado en la tabla de trabajos debería cambiar a **Autorizado**, luego a **Procesando** de nuevo mientras se puebla el contenido.
    *   Finalmente debería llegar a **Completado**.

---

### 🎉 Paso 6: Verificar el Resultado Final

1.  Una vez el trabajo esté **Completado**, haz clic en el botón **"Abrir Admin"** en la tabla.
2.  Esto te llevará al panel de administración de la nueva tienda Shopify.
3.  Verifica que las páginas, los productos de ejemplo y las entradas del blog se han creado correctamente si se solicitaron.

¡Si todo esto funciona, la prueba ha sido un éxito!
