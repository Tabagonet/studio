# Guía: Obtener Token de Acceso a la API de Shopify Partner

Sigue estos sencillos pasos para generar un token de acceso directo. Este token nos permitirá crear tiendas de desarrollo en tu nombre de forma segura y automática. Solo necesitas hacerlo una vez.

### Paso 1: Ve a los Ajustes de tu Panel de Partner

1.  Ve a tu panel de **[Shopify Partner](https://partners.shopify.com)** y accede con tu cuenta.
2.  En el menú de la izquierda, en la parte inferior, haz clic en **"Settings"** (Ajustes).

### Paso 2: Crea un Cliente de API

1.  En la página de Ajustes, busca y haz clic en la opción **"Partner API clients"**.
2.  Haz clic en el botón azul que dice **"Create API client"**.

### Paso 3: Configura los Permisos

Aparecerá una ventana emergente. Sigue estos pasos:

1.  **App name:** Escribe un nombre descriptivo para identificar el token, por ejemplo: `AutoPress AI Creator Token`.
2.  **Permissions:** Esta es la parte más importante. Verás una lista de permisos. **NO selecciones "All"**. Busca la sección **"Development stores"** y marca la única casilla disponible. Esto le dará al token el permiso justo y necesario para crear tiendas.
3.  Haz clic en **"Save"**.

### Paso 4: Guarda tu Token de Acceso

¡Ya está! Shopify ahora te mostrará tus credenciales.

1.  Busca el campo **"Partner API client token"**.
2.  **Copia este valor.** Es una clave secreta larga que empieza por `shpatt_`.
3.  Vuelve a la plataforma AutoPress AI, a **Ajustes > Conexiones**. En la tarjeta "Conexión Global de Shopify Partners", pega este valor en el campo **"Token de Acceso de la API de Partner"**.
4.  No olvides rellenar también el **"ID de tu Organización de Partner"**. Puedes encontrarlo en la URL de tu navegador (ej: `partners.shopify.com/`**`1234567`**`/...).
5.  Haz clic en **"Guardar Credenciales"**.

¡Eso es todo! Con esto, la conexión quedará establecida y no necesitarás hacer nada más.