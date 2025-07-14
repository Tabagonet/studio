
# Guía: Configurar Aplicación de Shopify Partner (Flujo OAuth)

Sigue estos pasos para crear una aplicación personalizada en tu panel de Shopify Partner. Esto nos dará los permisos necesarios para crear tiendas de desarrollo en tu nombre de forma segura y automática. Solo necesitas hacerlo una vez.

### Paso 1: Crea una nueva aplicación

1.  Ve a tu panel de **[Shopify Partner](https://partners.shopify.com)** y accede con tu cuenta.
2.  En el menú de la izquierda, busca y haz clic en **"Apps"**.
3.  Haz clic en el botón azul que dice **"Create app"** (Crear aplicación).
4.  Te preguntará cómo quieres crearla. Elige la opción **"Create app manually"** (Crear aplicación manualmente).

### Paso 2: Rellena los datos básicos y las URLs

Ahora verás una pantalla de configuración. Rellena los siguientes campos con la información que te proporciona la plataforma AutoPress AI en **Ajustes > Conexiones**.

*   **App name:** Escribe un nombre que la identifique, por ejemplo: `AutoPress AI Creator`. Es solo para tu referencia interna.

*   **App URL:** **¡MUY IMPORTANTE!** Esta es la URL base de la aplicación. Debe coincidir exactamente con la que has puesto en la configuración de AutoPress AI.
    *   Ejemplo para producción: `https://autopress.intelvisual.es`
    *   *Pega este valor en el campo "URL de la Aplicación" en la página de conexiones de AutoPress AI.*

*   **Allowed redirection URL(s):** Esta es la parte más importante para la seguridad. Shopify solo permitirá redirigir a los usuarios a la URL que pongas aquí. Nuestra aplicación necesita la siguiente URL:
    *   `https://autopress.intelvisual.es/api/shopify/auth/callback`
    *   **Importante:** Si estás usando la aplicación en diferentes entornos (ej. local, Firebase Studio), debes añadir la URL de redirección específica para **cada uno** de esos entornos en esta lista.

Haz clic en el botón **"Create"**.

### Paso 3: Obtén y guarda tus credenciales

¡Casi has terminado!

1.  En la misma página de configuración de la app, busca la sección **"API keys"** (Credenciales).
2.  Copia el valor de **`Client ID`**.
3.  Vuelve a la plataforma AutoPress AI, a **Ajustes > Conexiones**. En la tarjeta "Conexión Global de Shopify Partners", pega el valor en el campo **"Client ID"**.
4.  Vuelve al panel de Shopify Partner y copia el valor de **`Client Secret`**.
5.  Pega este valor en el campo **"Client Secret"** de nuestra plataforma.
6.  Haz clic en **"Guardar Credenciales"**.

### Paso 4: Conecta tu cuenta

1. Después de guardar, asegúrate de que el campo "URL de la aplicación" en AutoPress AI contiene la misma URL que pusiste en el paso 2.
2. Haz clic en el botón **"Conectar con Shopify"**.
3. Serás redirigido a una página de Shopify para autorizar la conexión. Haz clic en "Aprobar".
4. Serás redirigido de vuelta a la aplicación. La conexión debería mostrarse como activa. ¡Ya podrás crear tiendas automáticamente!
