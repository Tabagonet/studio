
# Guía de Integración del Chatbot con la API de AutoPress AI

Este documento proporciona la especificación técnica para que un chatbot o sistema externo se integre con la API de AutoPress AI para la creación automática de tiendas de desarrollo de Shopify.

## Flujo General de la Integración

El proceso de comunicación sigue estos pasos:

1.  **Autenticación**: El chatbot obtiene una API Key desde la plataforma AutoPress AI.
2.  **Petición de Creación**: El chatbot recopila los datos del usuario y envía una única petición `POST` a la API de AutoPress AI para iniciar un nuevo trabajo de creación de tienda.
3.  **Respuesta Inmediata**: La API de AutoPress AI valida la petición, crea un registro del trabajo con estado "pendiente" y responde inmediatamente con un `HTTP 202 Accepted` y el ID del trabajo. El proceso largo de creación se ejecuta en segundo plano.
4.  **Notificación de Estado (Webhook)**: Cuando el trabajo de creación finaliza (ya sea con éxito o con error), AutoPress AI envía una petición `POST` a la `webhookUrl` que el chatbot proporcionó en la petición inicial, informando del resultado.

---

## 1. URL Base de la API

Todas las rutas de endpoints mencionadas en este documento son relativas a la siguiente URL base:

**`https://autopress.intelvisual.es`**

Por ejemplo, el endpoint de creación de tienda se encuentra en `https://autopress.intelvisual.es/api/shopify/create-store`.

---

## 2. Autenticación

Todas las peticiones a la API deben incluir una API Key para la autenticación.

*   **Método**: La clave debe ser enviada en la cabecera `Authorization` con el esquema `Bearer`.
*   **Cabecera**: `Authorization: Bearer <TU_API_KEY_AQUI>`
*   **Obtención de la Clave**: La API Key es una clave estática y secreta que **será proporcionada por el equipo de AutoPress AI**. Esta clave no se genera en la interfaz de usuario y debe ser almacenada de forma segura como una variable de entorno en el sistema del chatbot.

---

## 3. Endpoint de Creación de Tienda

Para iniciar la creación de una nueva tienda, el chatbot debe realizar una petición a este endpoint.

*   **URL**: `/api/shopify/create-store`
*   **Método**: `POST`
*   **Cabeceras**:
    *   `Content-Type: application/json`
    *   `Authorization: Bearer <TU_API_KEY_AQUI>`

### Estructura del Body (JSON)

El cuerpo de la petición debe ser un objeto JSON con la siguiente estructura. Todos los campos son obligatorios a menos que se indique lo contrario.

```json
{
  "webhookUrl": "https://url.de.tu.chatbot/para/recibir/notificaciones",
  "storeName": "La Tienda de Ana",
  "businessEmail": "ana@ejemplo.com",
  "countryCode": "ES",
  "currency": "EUR",
  "brandDescription": "Una tienda de velas artesanales hechas con cera de soja y aromas naturales.",
  "targetAudience": "Personas interesadas en decoración del hogar, bienestar y productos ecológicos.",
  "brandPersonality": "Cálida, natural, minimalista, elegante",
  "colorPaletteSuggestion": "Tonos crema, beige y verde salvia",
  "productTypeDescription": "Velas aromáticas, difusores de aroma y jabones artesanales.",
  "creationOptions": {
    "createExampleProducts": true,
    "numberOfProducts": 3,
    "createAboutPage": true,
    "createContactPage": true,
    "createLegalPages": true,
    "createBlogWithPosts": true,
    "numberOfBlogPosts": 2,
    "setupBasicNav": true,
    "theme": "dawn"
  },
  "legalInfo": {
    "legalBusinessName": "Ana García S.L.",
    "businessAddress": "Calle Falsa 123, 28001, Madrid, España"
  },
  "entity": {
    "type": "user",
    "id": "firebase_user_uid"
  }
}
```

### Descripción de los Campos del JSON

| Clave                        | Tipo    | Descripción                                                                                                                                                             | Ejemplo                                 |
| ---------------------------- | ------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------- |
| `webhookUrl`                 | string  | **Importante**: La URL donde tu sistema esperará recibir la notificación `POST` cuando el trabajo finalice.                                                           | `"https://api.chatbot.com/shopify-status"` |
| `storeName`                  | string  | El nombre deseado para la nueva tienda Shopify.                                                                                                                         | `"Velas Luz de Luna"`                   |
| `businessEmail`              | string  | El email de contacto principal para la tienda.                                                                                                                          | `"contacto@velasluzdeluna.com"`         |
| `countryCode`                | string  | Código de país de 2 letras (ISO 3166-1 alpha-2).                                                                                                                        | `"ES"`                                  |
| `currency`                   | string  | Código de moneda de 3 letras (ISO 4217).                                                                                                                                | `"EUR"`                                 |
| `brandDescription`           | string  | Descripción de la marca para que la IA genere contenido.                                                                                                                | `"Velas artesanales con aromas..."`     |
| `targetAudience`             | string  | Descripción del público objetivo.                                                                                                                                       | `"Mujeres entre 25-45 años..."`         |
| `brandPersonality`           | string  | Adjetivos que describen la marca.                                                                                                                                       | `"Elegante, natural, sostenible"`       |
| `colorPaletteSuggestion`     | string  | (Opcional) Sugerencia de colores para la IA.                                                                                                                            | `"Tonos tierra y dorados"`              |
| `productTypeDescription`     | string  | Descripción de los tipos de productos que se venderán.                                                                                                                  | `"Velas de soja, difusores, jabones"`    |
| `creationOptions`            | object  | Un objeto que define qué módulos de contenido se deben crear.                                                                                                           | `{...}`                                 |
| `creationOptions.createExampleProducts` | boolean | `true` si se deben crear productos de ejemplo.                                                                                                                | `true`                                  |
| `creationOptions.numberOfProducts`      | number  | (Opcional) Número de productos a crear (si el anterior es `true`). Máximo: 10.                                                                                 | `3`                                     |
| `creationOptions.createAboutPage`       | boolean | `true` para crear la página "Sobre Nosotros".                                                                                                               | `true`                                  |
| `creationOptions.createContactPage`     | boolean | `true` para crear la página de "Contacto".                                                                                                                  | `true`                                  |
| `creationOptions.createLegalPages`      | boolean | `true` para generar y crear páginas legales (Privacidad, Términos).                                                                                         | `true`                                  |
| `creationOptions.createBlogWithPosts`   | boolean | `true` para crear un blog con artículos de ejemplo.                                                                                                         | `false`                                 |
| `creationOptions.numberOfBlogPosts`     | number  | (Opcional) Número de posts a crear (si el anterior es `true`). Máximo: 5.                                                                                     | `2`                                     |
| `creationOptions.setupBasicNav`         | boolean | `true` para crear un menú de navegación básico.                                                                                                             | `true`                                  |
| `creationOptions.theme`                 | string  | (Opcional) El "handle" del tema gratuito de Shopify a instalar (ej. `dawn`, `refresh`, `sense`). Si se omite, se usa el por defecto.                         | `"dawn"`                                |
| `legalInfo`                  | object  | Información requerida para rellenar los textos legales.                                                                                                                 | `{...}`                                 |
| `legalInfo.legalBusinessName`| string  | El nombre fiscal completo del negocio.                                                                                                                                  | `"Velas Luz de Luna S.L."`              |
| `legalInfo.businessAddress`  | string  | La dirección fiscal completa del negocio.                                                                                                                               | `"Calle de la Cera 5, 28001 Madrid"`    |
| `entity`                     | object  | Define a qué usuario o empresa de AutoPress AI pertenece este trabajo.                                                                                                  | `{...}`                                 |
| `entity.type`                | string  | Debe ser `"user"` o `"company"`.                                                                                                                                        | `"user"`                                |
| `entity.id`                  | string  | El ID de Firebase del usuario o el ID de la empresa de AutoPress AI.                                                                                                      | `"firebase_user_uid_123"`               |

---

## 4. Webhook de Notificación (Respuesta de AutoPress AI)

Una vez que el trabajo de creación de la tienda finaliza, nuestro sistema enviará una petición `POST` a la `webhookUrl` que proporcionaste.

*   **Método**: `POST`
*   **Cabeceras**: `Content-Type: application/json`

### Estructura del Body (JSON)

Tu sistema debe estar preparado para recibir un objeto JSON con la siguiente estructura:

```json
{
  "jobId": "unique_job_identifier_from_our_system",
  "status": "completed",
  "message": "¡Tienda creada y poblada con éxito!",
  "storeName": "La Tienda de Ana",
  "storeUrl": "https://la-tienda-de-ana.myshopify.com",
  "adminUrl": "https://admin.shopify.com/store/la-tienda-de-ana"
}
```

### Descripción de los Campos del Webhook

| Clave        | Tipo    | Descripción                                                                                              |
| ------------ | ------- | -------------------------------------------------------------------------------------------------------- |
| `jobId`      | string  | El ID del trabajo que se inició, para que puedas asociar esta notificación con la petición original.       |
| `status`     | string  | El estado final del trabajo. Puede ser **`"completed"`** o **`"error"`**.                                  |
| `message`    | string  | Un mensaje descriptivo del resultado. En caso de error, contendrá la razón del fallo.                      |
| `storeName`  | string  | El nombre de la tienda que se intentó crear.                                                             |
| `storeUrl`   | string  | (Opcional) La URL pública de la tienda, solo presente si `status` es `completed`.                         |
| `adminUrl`   | string  | (Opcional) La URL del panel de administración de la tienda, solo presente si `status` es `completed`.      |

**Tu sistema debe responder a esta petición de webhook con un código de estado `200 OK` para confirmar la recepción.**

---

## 5. Respuestas de Error de la API

Si la petición `POST` inicial al endpoint `/api/shopify/create-store` falla, la API responderá con un código de estado de error y un cuerpo JSON que describe el problema.

### Códigos de Error Comunes

*   **`400 Bad Request`**: Los datos enviados son inválidos. El cuerpo de la respuesta contendrá detalles sobre qué campos fallaron la validación.
    ```json
    {
      "error": "Cuerpo de la petición inválido.",
      "details": {
        "fieldErrors": {
          "businessEmail": ["El email del negocio no es válido."]
        }
      }
    }
    ```

*   **`401 Unauthorized`**: La `API Key` proporcionada en la cabecera `Authorization` es incorrecta o no existe.

*   **`403 Forbidden`**: La `API Key` es correcta, pero la entidad (usuario o empresa) asociada a la clave no tiene permisos para realizar la acción (ej. ha alcanzado su límite de creación de tiendas).

*   **`500 Internal Server Error`**: Ocurrió un error inesperado en nuestro servidor al intentar procesar la petición.
