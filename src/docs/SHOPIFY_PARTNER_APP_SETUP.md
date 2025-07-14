<h2>Guía: Configurar Cliente de la API de Partner de Shopify</h2>
<p>Sigue estos pasos para crear un <strong>"Cliente de API de Partner"</strong> en tu panel de Shopify Partner. Esto nos dará los permisos necesarios para crear tiendas de desarrollo en tu nombre de forma segura y automática. Solo necesitas hacerlo una vez.</p>

<h3>Paso 1: Accede a los Ajustes de Partner</h3>
<ol>
  <li>Ve a tu panel de <a href="https://partners.shopify.com" target="_blank" rel="noopener noreferrer">Shopify Partner</a> y accede con tu cuenta.</li>
  <li>En el menú de la izquierda, en la parte inferior, busca y haz clic en <strong>"Ajustes"</strong> (Settings).</li>
  <li>Dentro de Ajustes, busca y haz clic en la opción <strong>"Partner API clients"</strong>.</li>
</ol>
<p><strong>Importante:</strong> Solo los <strong>propietarios de la organización</strong> de Partner pueden ver y gestionar esta sección. Si no ves esta opción, pide al propietario de tu organización de Partner que realice estos pasos o te conceda los permisos necesarios.</p>

<h3>Paso 2: Crea un nuevo cliente de API</h3>
<ol>
  <li>Dentro de la página "Partner API clients", haz clic en el botón azul <strong>"Create API client"</strong>.</li>
  <li>Aparecerá un modal para configurar el cliente. Rellena los siguientes campos:</li>
</ol>
<ul>
    <li><strong>Client name:</strong> Dale un nombre descriptivo, por ejemplo: <code>AutoPress AI - Creador de Tiendas</code>.</li>
    <li><strong>Description:</strong> Una breve descripción, por ejemplo: <code>Cliente de API para crear tiendas de desarrollo desde la plataforma AutoPress AI.</code>.</li>
</ul>

<h3>Paso 3: Asigna los Permisos Correctos</h3>
<ol>
  <li>En la misma ventana modal, verás una sección de <strong>"Permissions"</strong> o <strong>"Access scopes"</strong>.</li>
  <li>Aquí es crucial que marques la casilla que dice <strong>"Manage apps"</strong>. Este permiso incluye la capacidad de crear y gestionar tiendas de desarrollo (<code>write_development_stores</code>).</li>
  <li>No necesitas marcar otros permisos como "View financials" o "Manage themes" a menos que quieras usar esas funcionalidades por tu cuenta. Para la creación de tiendas, <strong>"Manage apps"</strong> es el permiso clave.</li>
  <li>Haz clic en <strong>"Save"</strong>.</li>
</ol>

<h3>Paso 4: Obtén y Guarda tus Credenciales</h3>
<p>¡Casi has terminado! Después de guardar, la página se refrescará y verás tu nuevo cliente de API en la lista.</p>
<ol>
  <li>Busca la sección <strong>"Credentials"</strong> o <strong>"API credentials"</strong>.</li>
  <li>Copia tu <strong>ID de Organización (Organization ID)</strong>. Suele ser un número que también puedes ver en la URL de tu navegador (ej: <code>https://partners.shopify.com/1234567/...</code>).</li>
  <li>Copia el <strong>Token de Acceso (Access token)</strong>. Este es un token largo que empieza por <code>shptka_...</code> o similar. Trátalo como una contraseña, es secreto.</li>
  <li>Vuelve a la plataforma <strong>AutoPress AI</strong>, ve a <code>Ajustes > Conexiones</code> y, en la tarjeta de "Conexión Global de Shopify Partners", pega los dos valores en sus respectivos campos:
    <ul>
      <li>ID de Organización</li>
      <li>Token de Acceso de la API de Partner</li>
    </ul>
  </li>
  <li>Haz clic en <strong>"Guardar Credenciales de Partner"</strong>.</li>
  <li>La aplicación intentará verificar la conexión. Si todo es correcto, el indicador de estado se pondrá en verde. ¡Ya está todo listo para crear tiendas!</li>
</ol>
