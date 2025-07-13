
# Guía: Configurar Aplicación de Shopify Partner (Flujo OAuth)

Sigue estos pasos para crear una aplicación personalizada en tu panel de Shopify Partner. Esto nos dará los permisos necesarios para crear tiendas de desarrollo en tu nombre de forma segura y automática. Solo necesitas hacerlo una vez por cada cuenta de Partner que quieras conectar.

### Paso 1: Crea una nueva aplicación

1.  Ve a tu panel de **[Shopify Partner](https://partners.shopify.com)** y accede con tu cuenta.
2.  En el menú de la izquierda, busca y haz clic en **"Apps"**.
3.  Haz clic en el botón azul que dice **"Create app"** (Crear aplicación).
4.  Te preguntará cómo quieres crearla. Elige la opción **"Create app manually"** (Crear aplicación manualmente).

### Paso 2: Rellena los datos básicos de la aplicación

Ahora verás una pantalla de configuración. Rellena los siguientes campos:

*   **App name:** Escribe un nombre que la identifique, por ejemplo: `AutoPress AI Creator`. Es solo para tu referencia.
*   **App URL:** Pega aquí la URL base de la plataforma AutoPress AI. Te la proporcionamos en la página de **Ajustes > Conexiones**:
    *   `https://autopress.intelvisual.es`
*   **Allowed redirection URL(s):** Esta es la parte más importante para la seguridad. Shopify solo permitirá redirigir a los usuarios a esta URL después de autorizar la conexión. Pega la siguiente URL que te proporcionamos en la misma página de **Ajustes > Conexiones**:
    *   `https://autopress.intelvisual.es/api/shopify/auth/callback`

Haz clic en el botón **"Create"**.

### Paso 3: Configura la distribución y los permisos

Después de crear la app, Shopify te llevará a la página de configuración.

1.  Busca la sección **"Distribución"** (Distribution).
2.  Haz clic en **"Seleccionar método de distribución"** y elige **"Distribución personalizada"** (Custom distribution). Esto indica que la app es para tu uso privado.
3.  Shopify podría pedirte un **"Dominio de la tienda"** como requisito. No te preocupes, esto no instalará la app en esa tienda. Simplemente introduce el dominio `.myshopify.com` de cualquiera de tus tiendas de desarrollo existentes como un valor temporal.
4.  Ahora, ve a la pestaña **"Acceso a la API"** (API access) o busca una opción llamada **"Configurar ámbitos de la API de Administrador"** (Configure Admin API scopes).
5.  Se desplegará una lista larga de permisos. Busca y marca las casillas para los siguientes dos permisos:
    *   ✅ `write_development_stores`
    *   ✅ `read_development_stores`
6.  Haz clic en **"Guardar"** en la parte superior derecha de la página para aplicar los cambios de permisos.

### Paso 4: Obtén y guarda tus credenciales

¡Casi has terminado!

1.  En la misma página de **"Acceso a la API"**, busca la sección **"Credenciales"** (API keys).
2.  Copia el valor de **`Client ID`**.
3.  Vuelve a la plataforma AutoPress AI, a **Ajustes > Conexiones**. En la tarjeta "Conexión Global de Shopify Partners", pega el valor en el campo **"Client ID"**.
4.  Vuelve al panel de Shopify Partner y copia el valor de **`Client secret`**.
5.  Pega este valor en el campo **"Client Secret"** de nuestra plataforma.
6.  Finalmente, haz clic en el botón **"Guardar y Conectar con Shopify"**.

Serás redirigido a una página de Shopify para autorizar la conexión. Haz clic en "Aprobar" y el proceso habrá finalizado. ¡Ya podrás crear tiendas automáticamente!
