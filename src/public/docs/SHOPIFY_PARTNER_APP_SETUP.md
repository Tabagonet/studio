# Guía: Configurar Partner API Client para Creación de Tiendas

Sigue estos pasos para crear un cliente de API en tu panel de Shopify Partner. Esto nos dará los permisos necesarios para crear tiendas de desarrollo en tu nombre de forma segura y automática a través de la API para Partners. Solo necesitas hacerlo una vez.

### Paso 1: Accede a los Ajustes de Partner

1.  Ve a tu panel de **[Shopify Partner](https://partners.shopify.com)** y accede con tu cuenta.
2.  En el menú de la izquierda, busca y haz clic en **"Settings"** (Ajustes).

### Paso 2: Crea un Partner API Client

1.  Dentro de los Ajustes, busca y haz clic en la opción **"Partner API clients"**.
2.  Haz clic en el botón azul que dice **"Create API client"** (Crear cliente de API).
    *   **Nota:** Solo los **propietarios de la organización** pueden ver y gestionar esta sección.

### Paso 3: Configura el Cliente de API

1.  **Nombre:** Dale un nombre descriptivo, por ejemplo: `AutoPress AI Automator`.
2.  **Permisos (Permissions):** Esta es la parte más importante. Marca la casilla para el permiso:
    *   ✅ **Manage apps** (Gestionar aplicaciones).
        *   Según la documentación oficial de Shopify, este permiso engloba la capacidad de crear tiendas de desarrollo (`write_development_stores`).

3.  Haz clic en **"Save"** (Guardar).

### Paso 4: Obtén y Guarda tu Token de Acceso

¡Casi has terminado!

1.  Después de guardar, Shopify te mostrará una pantalla con las credenciales.
2.  Busca el **`Partner API client access token`**. Este es el token que necesitas.
3.  Haz clic en el botón de copiar para guardarlo en tu portapapeles.
    *   **¡IMPORTANTE!** Este token solo se muestra una vez. Guárdalo en un lugar seguro. Si lo pierdes, tendrás que generar uno nuevo.

4.  Vuelve a la plataforma AutoPress AI, a **Ajustes > Conexiones**. En la tarjeta "Conexión Global de Shopify Partners", pega este token en el campo **"Token de Acceso de la API de Partner"**.
5.  Haz clic en **"Guardar Token"**.

La aplicación verificará automáticamente la validez del token y te mostrará el estado "Conectado" si todo es correcto. ¡Ya podrás crear tiendas automáticamente!
