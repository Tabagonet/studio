# Guía para Configurar tu Aplicación de Shopify Partner (Para Clientes)

Sigue estos sencillos pasos para darnos los permisos necesarios para crear tiendas de desarrollo en tu nombre de forma automática. Solo necesitas hacerlo una vez.

### Paso 1: Entra en tu panel de Shopify Partner

*   Ve a [partners.shopify.com](https://partners.shopify.com) y accede con tu cuenta.

### Paso 2: Ve a la sección de "Aplicaciones"

*   En el menú de la izquierda, busca y haz clic en **"Apps"**.

### Paso 3: Crea una nueva aplicación

*   Haz clic en el botón azul que dice **"Create app"** (Crear aplicación).
*   Te preguntará cómo quieres crearla. Elige la opción **"Create app manually"** (Crear aplicación manualmente).

### Paso 4: Dale un nombre a tu aplicación

*   **App name:** Escribe un nombre que la identifique, por ejemplo: `AutoPress AI Creator`.
*   Haz clic en el botón **"Create"**.

### Paso 5: Obtén tus credenciales (¡La parte importante!)

*   Ahora estarás en la página de configuración de tu nueva aplicación.
*   Busca la sección llamada **"API keys"**. Verás dos códigos:
    *   `Client ID`
    *   `Client secret`
*   **Copia estos dos valores** y pégalos en los campos correspondientes de nuestra plataforma, en la sección **Ajustes > Conexiones**, dentro de la tarjeta "Conexión Global de Shopify Partners".

### Paso 6: Configura la redirección

*   En la misma página de configuración de tu aplicación en Shopify, busca la sección **"App setup"** (Configuración de la aplicación).
*   En el campo **Allowed redirection URL(s)** (URLs de redirección permitidas), tienes que añadir una URL exacta.
*   **Pega la siguiente URL:** `https://autopress.intelvisual.es/api/shopify/auth/callback`
    *   *Nota: Si tu instancia de AutoPress AI está en otra URL, reemplaza `https://autopress.intelvisual.es` por la URL correcta.*

### Paso 7: Guarda los cambios

*   Haz clic en el botón **"Save"** (Guardar) en la parte superior derecha de la página de Shopify.

¡Y eso es todo! Una vez que hayas guardado estas credenciales en nuestra plataforma, el sistema estará listo para empezar a trabajar para ti.
