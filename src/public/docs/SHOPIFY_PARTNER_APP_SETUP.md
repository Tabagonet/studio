# Guía: Obtener Credenciales de API para Shopify Partner

Sigue estos pasos para generar un **Token de Acceso a la API** en tu panel de Shopify Partner. Este token es lo que nos permite crear tiendas de desarrollo en tu nombre de forma segura y automática. Solo necesitas hacerlo una vez.

### Paso 1: Ve a la configuración de tu panel de Partner

1.  Ve a tu panel de **[Shopify Partner](https://partners.shopify.com)** y accede con tu cuenta.
2.  En el menú de la izquierda, busca y haz clic en **"Settings"** (Configuración) en la parte inferior.
3.  Busca tu **ID de Organización** en la URL de la página de configuración. La URL se verá así: `https://partners.shopify.com/organizations/1234567/settings`. Copia ese número (en este ejemplo, `1234567`).

### Paso 2: Genera un Token de Acceso

1.  En la misma página de **"Settings"**, busca la sección **"Partner API clients"** (Clientes de API de Partner).
2.  Haz clic en el botón **"Create API client"** (Crear cliente de API).
3.  Se abrirá un modal. Dale un nombre descriptivo, por ejemplo: `AutoPress AI Creator`.
4.  **No cambies los permisos**. Déjalos como están por defecto. La creación de tiendas de desarrollo es un permiso que tu cuenta de Partner tiene por naturaleza, no necesita un `scope` específico en el token.
5.  Haz clic en **"Save"** (Guardar).
6.  Shopify te mostrará tu **"Partner API client token"**. Este token es como una contraseña. **Cópialo inmediatamente y guárdalo en un lugar seguro**, ya que solo se muestra una vez.

### Paso 3: Guarda las Credenciales en AutoPress AI

1.  Vuelve a la plataforma AutoPress AI y ve a **Ajustes > Conexiones**.
2.  Busca la tarjeta **"Conexión Global de Shopify Partners"**.
3.  Pega el **ID de Organización** que copiaste en el Paso 1.
4.  Pega el **Token de Acceso** que generaste y guardaste en el Paso 2.
5.  Haz clic en **"Guardar Credenciales"**.

¡Y eso es todo! No hay un botón de "Conectar" porque la autenticación es directa. Si las credenciales son correctas, el sistema estará listo para crear tiendas.
