# Guía: Configurar Cliente de la API de Partner de Shopify

Sigue estos pasos para crear un "Cliente de API de Partner" en tu panel de Shopify Partner. Esto nos dará los permisos necesarios para crear tiendas de desarrollo en tu nombre de forma segura y automática. Solo necesitas hacerlo una vez.

### Paso 1: Accede a los Ajustes de Partner

1.  Ve a tu panel de **[Shopify Partner](https://partners.shopify.com)** y accede con tu cuenta.
2.  En el menú de la izquierda, en la parte inferior, busca y haz clic en **"Ajustes"** (Settings).
3.  Dentro de Ajustes, busca y haz clic en la opción **"Partner API clients"**.

**Importante:** Solo los **propietarios de la organización** de Partner pueden ver y gestionar esta sección. Si no ves esta opción, pide al propietario de tu organización de Partner que realice estos pasos o te conceda los permisos necesarios.

### Paso 2: Crea un nuevo cliente de API

1.  Dentro de la página "Partner API clients", haz clic en el botón azul **"Create API client"**.
2.  Aparecerá un modal para configurar el cliente. Rellena los siguientes campos:
    *   **Client name:** Dale un nombre descriptivo, por ejemplo: `AutoPress AI - Creador de Tiendas`.
    *   **Description:** Una breve descripción, por ejemplo: `Cliente de API para crear tiendas de desarrollo desde la plataforma AutoPress AI.`.

### Paso 3: Asigna los Permisos Correctos

1.  En la misma ventana modal, verás una sección de **"Permissions"** o **"Access scopes"**.
2.  Aquí es crucial que marques la casilla que dice **"Manage apps"**. Este permiso incluye la capacidad de crear y gestionar tiendas de desarrollo (`write_development_stores`).
3.  No necesitas marcar otros permisos como "View financials" o "Manage themes" a menos que quieras usar esas funcionalidades por tu cuenta. Para la creación de tiendas, **"Manage apps"** es el permiso clave.
4.  Haz clic en **"Save"**.

### Paso 4: Obtén y Guarda tus Credenciales

¡Casi has terminado! Después de guardar, la página se refrescará y verás tu nuevo cliente de API en la lista.

1.  Busca la sección **"Credentials"** o **"API credentials"**.
2.  Copia tu **ID de Organización (Organization ID)**. Suele ser un número que también puedes ver en la URL de tu navegador (ej: `https://partners.shopify.com/1234567/...).`
3.  Copia el **Token de Acceso (Access token)**. Este es un token largo que empieza por `shptka_...` o similar. Trátalo como una contraseña, es secreto.
4.  Vuelve a la plataforma **AutoPress AI**, ve a `Ajustes > Conexiones` y, en la tarjeta de "Conexión Global de Shopify Partners", pega los dos valores en sus respectivos campos:
    *   `ID de Organización`
    *   `Token de Acceso de la API de Partner`
5.  Haz clic en **"Guardar Credenciales de Partner"**.
6.  La aplicación intentará verificar la conexión. Si todo es correcto, el indicador de estado se pondrá en verde. ¡Ya está todo listo para crear tiendas!
