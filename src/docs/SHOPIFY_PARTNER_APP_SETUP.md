# Guía: Configurar Aplicación Personalizada de Shopify Partner (Flujo OAuth)

Sigue estos pasos para crear una aplicación personalizada en tu panel de Shopify Partner. Esto nos dará los permisos necesarios para crear tiendas de desarrollo en tu nombre de forma segura y automática. Solo necesitas hacerlo una vez.

### Paso 1: Crea una nueva aplicación

1.  Ve a tu panel de **[Shopify Partner](https://partners.shopify.com)** y accede con tu cuenta.
2.  En el menú de la izquierda, busca y haz clic en **"Apps"**.
3.  Haz clic en el botón azul que dice **"Create app"** (Crear aplicación).
4.  Te preguntará cómo quieres crearla. Elige la opción **"Create app manually"** (Crear aplicación manualmente).

### Paso 2: Rellena los datos básicos y las URLs

Ahora verás una pantalla de configuración. Rellena los siguientes campos con la información que te proporciona la plataforma AutoPress AI en **Ajustes > Conexiones**.

*   **App name:** Escribe un nombre que la identifique, por ejemplo: `AutoPress AI Creator`. Es solo para tu referencia interna.

*   **App URL:** Esta es la URL base de la aplicación. **Copia y pégala desde la sección "URLs Requeridas" en la página de conexiones de AutoPress AI**.
    *   Ejemplo para producción: `https://autopress.intelvisual.es`

*   **Allowed redirection URL(s):** Esta es la parte más importante para la seguridad. Shopify solo permitirá redirigir a los usuarios a la URL que pongas aquí. Debes añadir una URL por cada entorno donde uses AutoPress AI.

    *   **1. URL de Producción (Obligatoria):**
        *   `https://autopress.intelvisual.es/api/shopify/auth/callback`

    *   **2. URL de Desarrollo (Importante):**
        *   Si usas AutoPress AI en un entorno de desarrollo como Project IDX o en tu máquina local (`localhost`), debes añadir la URL pública de ese entorno. La aplicación intentará mostrarte esta URL en los logs o en la página de conexiones.
        *   **Ejemplo para Project IDX:** `https://1234.cluster-xyz.cloudworkstations.dev/api/shopify/auth/callback`
        *   **Ejemplo si usas un túnel como ngrok:** `https://tunnelfe8a.ngrok.io/api/shopify/auth/callback`

    **Importante:** Debes tener una entrada por cada entorno. Haz clic en **"Add URL"** para añadir más de una.

Haz clic en el botón **"Create"**.

### Paso 3: Configura la distribución y los permisos

Después de crear la app, Shopify te llevará a la página de configuración.

1.  Busca la sección **"Distribución"** (Distribution).
2.  Haz clic en **"Seleccionar método de distribución"** y elige **"Distribución personalizada"** (Custom distribution). Esto indica que la app es para tu uso privado.
3.  Shopify podría pedirte un **"Dominio de la tienda"** como requisito. No te preocupes, esto no instalará la app en esa tienda. Puedes usar cualquier tienda de desarrollo activa como valor temporal.
4.  Ahora, ve a la pestaña **"Acceso a la API"** (API access) o busca una opción llamada **"Configurar ámbitos de la API de Administrador"** (Configure Admin API scopes).
5.  Se desplegará una lista larga de permisos. Busca y marca las casillas para los siguientes permisos:
    *   ✅ `write_development_stores`
    *   ✅ `read_development_stores`
6.  Haz clic en **"Guardar"** en la parte superior derecha de la página para aplicar los cambios de permisos.

### Paso 4: Obtén y guarda tus credenciales

¡Casi has terminado!

1.  En la misma página de **"Acceso a la API"**, busca la sección **"Credenciales"** (API keys).
2.  Copia el valor de **`Client ID`**.
3.  Vuelve a la plataforma AutoPress AI, a **Ajustes > Conexiones**. En la tarjeta "Conexión Global de Shopify", pega el valor en el campo **"Client ID"**.
4.  Vuelve al panel de Shopify Partner y copia el valor de **`Client Secret`**.
5.  Pega este valor en el campo **"Client Secret"** de nuestra plataforma.
6.  Haz clic en **"Guardar Credenciales"**.

### Paso 5: Verifica la conexión

*   **Verificación Implícita:** A diferencia de la API de Partner, las credenciales de OAuth no se pueden "verificar" con una simple llamada. La única forma de asegurarse de que funcionan es completar el flujo de creación de una tienda.
*   **Prueba Real:** La mejor forma de probarlo es seguir nuestra **Guía de Pruebas** para crear una tienda. Si el proceso te redirige a Shopify para autorizar la app y luego finaliza correctamente, ¡tus credenciales de OAuth están bien configuradas!
