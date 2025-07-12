
# Guía para Configurar tu Aplicación de Shopify Partner (Para Clientes)

Sigue estos sencillos pasos para darnos los permisos necesarios para crear tiendas de desarrollo en tu nombre de forma automática. Solo necesitas hacerlo una vez.

### Paso 1: Entra en tu panel de Shopify Partner

*   Ve a [partners.shopify.com](https://partners.shopify.com) y accede con tu cuenta.

### Paso 2: Ve a la sección de "Aplicaciones"

*   En el menú de la izquierda, busca y haz clic en **"Apps"**.

### Paso 3: Crea una nueva aplicación

*   Haz clic en el botón azul que dice **"Create app"** (Crear aplicación).
*   Te preguntará cómo quieres crearla. Elige la opción **"Create app manually"** (Crear aplicación manualmente).

### Paso 4: Rellena los datos básicos de la aplicación

*   **App name:** Escribe un nombre que la identifique, por ejemplo: `AutoPress AI Creator`.
*   **App URL:** Pega aquí la URL base de tu aplicación AutoPress AI (ej. `https://autopress.intelvisual.es`).
*   **Allowed redirection URL(s):** Aquí tienes que añadir **una URL por línea**. Pega las siguientes:
    *   `https://autopress.intelvisual.es/api/shopify/auth/callback`
    *   Si estás usando el entorno de desarrollo de Firebase Studio, añade también la URL de ese entorno, que verás en tu navegador (ej. `https://1234.cluster-xyz.cloudworkstations.dev/api/shopify/auth/callback`).

*   Haz clic en el botón **"Create"**.

### Paso 5: Obtén tus credenciales (¡La parte importante!)

*   Ahora estarás en la página de configuración de tu nueva aplicación.
*   Busca la sección llamada **"API keys"**. Verás dos códigos:
    *   `Client ID`
    *   `Client secret`
*   **Copia estos dos valores** y pégalos en los campos correspondientes de nuestra plataforma, en la sección **Ajustes > Conexiones**, dentro de la tarjeta "Conexión Global de Shopify Partners".

### Paso 6: Guarda los cambios en AutoPress AI

*   Dentro de la plataforma AutoPress AI, haz clic en el botón **"Guardar Credenciales"**.

¡Y eso es todo! Una vez que hayas guardado estas credenciales en nuestra plataforma, el sistema estará listo para empezar a trabajar para ti. Puedes usar el botón "Verificar Conexión" para confirmar que todo es correcto.
