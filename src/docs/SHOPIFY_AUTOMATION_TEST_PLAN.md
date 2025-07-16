# Plan de Pruebas: Automatización de Shopify (Poblado de Contenido)

Esta guía describe los pasos para realizar una prueba completa (end-to-end) del flujo de poblado de contenido en tiendas de Shopify.

---

### ✅ Paso 1: Requisitos Previos

Antes de empezar, asegúrate de tener:

1.  **Una cuenta de Shopify Partner:** Puedes crear una gratis en [partners.shopify.com](https://partners.shopify.com).
2.  **Una tienda de desarrollo VACÍA:** Crea una nueva tienda de desarrollo desde tu panel de Shopify Partner. Esta será la tienda que usaremos para la prueba.
3.  **Una API Key de Sistema:** En el archivo `.env.local` de este proyecto, asegúrate de que la variable `SHOPIFY_AUTOMATION_API_KEY` tiene un valor secreto que hayas inventado (ej: `super-secret-key-for-testing`).

---

### 🔧 Paso 2: Configurar la App Personalizada en Shopify

Sigue la guía para clientes para crear una aplicación personalizada en tu panel de Shopify Partner y obtener las credenciales de OAuth.

*   **Ver guía:** `/docs/SHOPIFY_PARTNER_APP_SETUP.md`

Al final de este paso, deberías tener un **Client ID** y un **Client Secret**.

---

### 🔌 Paso 3: Configurar las Credenciales en AutoPress AI

1.  Inicia sesión en la aplicación AutoPress AI con una cuenta de Super Admin.
2.  Ve a **Ajustes > Conexiones**.
3.  Busca la tarjeta **"Conexión Global de Shopify"**.
4.  Pega aquí el **Client ID** y el **Client Secret** que obtuviste en el paso anterior.
5.  Haz clic en **"Guardar Credenciales Globales"**.
6.  Refresca la página. El estado de la conexión debería aparecer como configurado.

---

### 🤖 Paso 4: Simular la Petición del Chatbot para Iniciar un Trabajo

Vamos a actuar como si fuéramos el chatbot, enviando una petición para crear un **trabajo de poblado de contenido**.

1.  **Copia el siguiente comando `curl` completo.**
2.  **Modifica los dos valores necesarios:**
    *   Reemplaza `TU_API_KEY_DE_SISTEMA` por la clave que pusiste en el archivo `.env.local`.
    *   Reemplaza `TU_UID_DE_FIREBASE` por el ID de tu usuario de Firebase.
3.  **Pega el comando modificado en tu terminal y ejecútalo.**

```bash
curl -X POST http://localhost:9002/api/shopify/create-store \
-H "Content-Type: application/json" \
-H "Authorization: Bearer TU_API_KEY_DE_SISTEMA" \
-d '{
  "webhookUrl": "https://webhook.site/#!/a-test-url",
  "storeName": "Mi Tienda Poblada de Prueba",
  "businessEmail": "tu.email+test-populate@ejemplo.com",
  "brandDescription": "Una tienda para probar la automatización de poblado de contenido de AutoPress AI.",
  "targetAudience": "Desarrolladores y equipos de producto.",
  "brandPersonality": "Funcional, robusta, eficiente",
  "productTypeDescription": "Productos digitales de prueba generados por IA.",
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

### 🕵️ Paso 5: Asignar, Autorizar y Poblar

1.  **Respuesta Inmediata:** La terminal debería devolverte una respuesta `{"success":true,"jobId":"..."}`. Esto significa que la tarea se ha creado correctamente.
2.  **Panel de AutoPress AI:** Ve a la sección **Shopify > Trabajos de Creación** en la aplicación.
3.  **Verificar Estado:** Deberías ver una nueva fila en la tabla para "Mi Tienda Poblada de Prueba". El estado inicial será **Pendiente**.
4.  **Asignar Tienda (Paso Clave 1):**
    *   Haz clic en el menú de acciones de la fila y selecciona **"Asignar Tienda"**.
    *   Introduce el **ID de la tienda** y el **dominio .myshopify.com** de la tienda de desarrollo vacía que creaste en el Paso 1.
    *   Haz clic en "Asignar". El estado debería cambiar a **"Asignado"**.
5.  **Autorizar App (Paso Clave 2):**
    *   Ahora, desde el mismo menú, haz clic en **"Autorizar Instalación"**.
    *   Serás redirigido a una página de consentimiento de Shopify. **Si ves esta pantalla, las credenciales de la App Personalizada (OAuth) funcionan.**
    *   Acepta la instalación. Serás redirigido de vuelta a la lista de trabajos.
6.  **Poblar Contenido (Paso Clave 3):**
    *   El estado debería haber cambiado a **"Autorizado"**.
    *   Vuelve al menú de acciones y haz clic en **"Poblar Contenido"**.
    *   El estado cambiará a **Populating** y, finalmente, a **Completado**.

---

### 🎉 Paso 6: Verificar el Resultado Final

1.  Una vez el trabajo esté **Completado**, haz clic en el botón **"Abrir Admin"** en la tabla.
2.  Esto te llevará al panel de administración de la tienda Shopify.
3.  Verifica que las páginas, los productos de ejemplo y las entradas del blog se han creado correctamente.

¡Si todo esto funciona, la prueba ha sido un éxito!
