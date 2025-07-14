
# Guía: Obtener Token de Acceso para la API de Shopify

Sigue estos pasos para generar un **token de acceso de una App Personalizada**. Este token nos permitirá crear tiendas de desarrollo en tu nombre de forma segura y automática. Solo necesitas hacerlo una vez por cada cuenta de Partner.

### Paso 1: Ve a los Ajustes de tu Tienda de Partner

1.  Ve a tu panel de **[Shopify Partner](https://partners.shopify.com)** y accede con tu cuenta.
2.  Desde el panel principal, **entra a la tienda asociada a tu cuenta de Partner**. No es una tienda de desarrollo, sino la tienda que Shopify crea para tu propia organización de Partner.

### Paso 2: Ve a la sección de Aplicaciones

1.  En el menú de la izquierda de la administración de tu tienda, haz clic en **"Apps"**.
2.  Luego, haz clic en **"Apps and sales channels"** (Aplicaciones y canales de venta).
3.  En la parte superior, verás un botón que dice **"Develop apps"** (Desarrollar aplicaciones). Haz clic ahí.

### Paso 3: Crea una App Personalizada

1.  En la página de "Develop apps", haz clic en el botón **"Create an app"** (Crear una aplicación).
2.  Aparecerá una ventana emergente. Dale un nombre descriptivo, por ejemplo: `AutoPress AI Store Creator`.
3.  Haz clic en **"Create app"**.

### Paso 4: Configura los Permisos (Scopes)

Esta es la parte más importante.

1.  Serás redirigido a la página de configuración de tu nueva app. Haz clic en la pestaña **"Admin API integration"** (Integración de la API de Admin).
2.  Verás una sección llamada **"Admin API access scopes"**. Haz clic en **"Configure"** (Configurar).
3.  Se desplegará una lista larga de permisos. **No marques "All"**. Busca y marca la casilla para el siguiente permiso:
    *   ✅ `write_development_stores`
4.  Haz clic en **"Save"** en la esquina superior derecha.

### Paso 5: Instala la App y Obtén el Token

1.  Vuelve a la pestaña **"API credentials"** (Credenciales de API).
2.  Verás un botón que dice **"Install app"**. Haz clic en él y confirma la instalación en la siguiente pantalla.
3.  ¡Listo! Shopify ahora te revelará el token secreto. Busca el campo **"Admin API access token"**.
4.  Haz clic en **"Reveal token once"**.
5.  **Copia este valor.** Es una clave secreta larga que empieza por `shpat_`. **Guárdala bien, ya que no podrás volver a verla.**

### Paso 6: Pega las Credenciales en AutoPress AI

1.  Vuelve a la plataforma AutoPress AI, a **Ajustes > Conexiones**.
2.  En la tarjeta "Conexión Global de Shopify Partners", pega el siguiente dato:
    *   **Token de Acceso de la API de Admin**: El token `shpat_...` que acabas de copiar.
3.  Haz clic en **"Guardar Credenciales de Partner"**.

¡Eso es todo! Con esto, la conexión quedará establecida y lista para usar.
