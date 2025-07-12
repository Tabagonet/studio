
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
*   **App URL:** Pega aquí la URL base de tu aplicación AutoPress AI. La puedes encontrar en la página de **Ajustes > Conexiones** de la plataforma, dentro de la alerta "URLs Requeridas por Shopify". Por ejemplo: `https://autopress.intelvisual.es`.
*   **Allowed redirection URL(s):** Aquí tienes que añadir **una URL por línea**. Pega las URLs que te proporciona la plataforma en la sección de **Ajustes > Conexiones**. Verás una para producción y, si estás en un entorno de desarrollo, otra para ese entorno.

*   Haz clic en el botón **"Create"**.

### Paso 5: Obtén tus credenciales (¡La parte importante!)

*   Ahora estarás en la página de configuración de tu nueva aplicación.
*   Busca la sección llamada **"API keys"**. Verás dos códigos:
    *   `Client ID`
    *   `Client secret`
*   **Copia estos dos valores** y pégalos en los campos correspondientes de nuestra plataforma, en la sección **Ajustes > Conexiones**, dentro de la tarjeta "Conexión Global de Shopify Partners".

### Paso 6: Guarda y Verifica

*   Dentro de la plataforma AutoPress AI, haz clic en el botón **"Guardar Credenciales"**.
*   Una vez guardadas, haz clic en el botón **"Verificar Conexión"**. Deberías ver un mensaje de éxito.

¡Y eso es todo! Una vez que hayas guardado y verificado estas credenciales, el sistema estará listo para empezar a trabajar para ti.
