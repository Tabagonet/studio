
# Guía para Configurar tu Aplicación de Shopify Partner

Sigue estos pasos para crear una aplicación en tu panel de Shopify Partner. Esto solo necesitas hacerlo una vez. Las credenciales que obtengas nos permitirán crear tiendas de desarrollo en tu nombre de forma automática.

**Paso 1: Accede a tu Panel de Shopify Partner**

*   Ve a [partners.shopify.com](https://partners.shopify.com) y accede con tu cuenta.

**Paso 2: Ve a la Sección de Aplicaciones**

*   En el menú de la izquierda, haz clic en **"Apps"**.

**Paso 3: Crea una Nueva Aplicación**

*   Haz clic en el botón **"Create app"** (Crear aplicación).
*   Se te pedirá que elijas cómo quieres crearla. Selecciona **"Create app manually"** (Crear aplicación manualmente).

**Paso 4: Dale un Nombre a tu Aplicación**

*   **App name:** Dale un nombre descriptivo, por ejemplo: `AutoPress AI Creator`.
*   Haz clic en **"Create"**.

**Paso 5: Obtén tus Credenciales**

*   Serás redirigido a la página de tu nueva aplicación.
*   En la sección **"API keys"**, verás tu `Client ID` y `Client secret`.
*   **Copia y pega estos dos valores** en los campos `Client ID de la App de Partner` y `Client Secret de la App de Partner` en la página de **Ajustes > Conexiones** de nuestra plataforma.

**Paso 6: Configura las URLs de la Aplicación**

*   En la misma página, busca la sección **"App setup"** (Configuración de la aplicación).
*   **App URL:** Introduce la URL principal de nuestra plataforma. Por ejemplo: `https://autopress.intelvisual.es/dashboard`
*   **Allowed redirection URL(s):** Esta es la parte más importante. Añade la siguiente URL exactamente como está escrita:
    *   `https://autopress.intelvisual.es/api/shopify/auth/callback`

**Paso 7: Guarda los Cambios**

*   Haz clic en el botón **"Save"** en la parte superior derecha de la página.

¡Y eso es todo! Con estas credenciales guardadas en nuestra plataforma y las URLs configuradas, el sistema ya está listo para crear tiendas de Shopify de forma 100% automática.
