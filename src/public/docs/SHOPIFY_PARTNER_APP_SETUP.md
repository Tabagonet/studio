
# Guía: Configurar Cliente de API de Shopify Partner

Sigue estos pasos para crear un **Cliente de API de Partner**. Esto te dará los permisos necesarios para crear tiendas de desarrollo en tu nombre de forma segura y automática. Solo necesitas hacerlo una vez.

### Paso 1: Ve a los Ajustes de tu Panel de Partner

1.  Ve a tu panel de **[Shopify Partner](https://partners.shopify.com)** y accede con tu cuenta.
2.  En el menú de la izquierda, busca y haz clic en **"Ajustes"** (Settings).
3.  Dentro de los Ajustes, busca la sección **"Partner API clients"** (Clientes de API de Partner) y haz clic en ella.

**Importante:** Solo el **propietario** de la organización de Shopify Partner puede ver y gestionar los Clientes de API.

### Paso 2: Crea un Nuevo Cliente de API

1.  Haz clic en el botón **"Create API client"** (Crear cliente de API).
2.  Se abrirá un formulario. Rellena los siguientes campos:
    *   **Client name:** Escribe un nombre que lo identifique, por ejemplo: `AutoPress AI Creator`. Es solo para tu referencia interna.
    *   **Description:** Una breve descripción, por ejemplo: `Cliente de API para crear tiendas de desarrollo automáticamente`.

### Paso 3: Asigna los Permisos Correctos

1.  Verás una sección de **Permissions** (Permisos).
2.  Busca la sección **"Stores"** (Tiendas).
3.  Marca la casilla para **"Manage stores"** (Gestionar tiendas). Esto le dará a tu cliente de API los permisos necesarios para `write_development_stores`, que es lo que necesitamos.
4.  No necesitas marcar ninguna otra casilla para esta funcionalidad.
5.  Haz clic en **"Save"** (Guardar).

### Paso 4: Obtén y Guarda tu Token de Acceso

¡Casi has terminado!

1.  Después de guardar, Shopify te mostrará las credenciales del cliente. Verás un campo llamado **"Access token"** (Token de acceso).
2.  Este token es secreto y solo se mostrará una vez. Haz clic en el botón para **revelar el token completo**.
3.  **Copia este token de acceso**. Es una cadena larga que probablemente empiece por `shptka_...`.
4.  Vuelve a la plataforma AutoPress AI, a **Ajustes > Conexiones**.
5.  En la tarjeta "Conexión Global de Shopify Partners", pega este token en el único campo disponible: **"Token de Acceso de la API de Partner"**.
6.  Haz clic en **"Guardar Token"**.

¡Listo! Si todo ha ido bien, el indicador de estado en la tarjeta se pondrá en verde y ya podrás empezar a usar las automatizaciones de Shopify.
