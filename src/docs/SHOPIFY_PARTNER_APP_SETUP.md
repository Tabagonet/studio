<h2>Guía: Configurar App Personalizada en Tienda Shopify</h2>
<p>Sigue estos pasos para crear una <strong>"App Personalizada"</strong> en el panel de administración de una tienda Shopify de desarrollo. Esto nos dará los permisos necesarios para poblar la tienda con contenido de forma segura y automática.</p>
<p><strong>Nota:</strong> Este proceso debe realizarse para cada tienda de desarrollo a la que quieras conectar AutoPress AI.</p>

<h3>Paso 1: Habilita el desarrollo de apps personalizadas</h3>
<ol>
  <li>Accede al panel de administración de tu tienda de desarrollo Shopify.</li>
  <li>En el menú de la izquierda, ve a <strong>"Aplicaciones y canales de ventas"</strong> (Apps and sales channels).</li>
  <li>Haz clic en <strong>"Desarrollar aplicaciones"</strong> (Develop apps).</li>
  <li>Si es la primera vez, haz clic en <strong>"Permitir desarrollo de aplicaciones personalizadas"</strong>. Lee el aviso y confírmalo.</li>
</ol>

<h3>Paso 2: Crea una nueva app personalizada</h3>
<ol>
  <li>En la página "Desarrollar aplicaciones", haz clic en <strong>"Crear una aplicación"</strong>.</li>
  <li>Dale un nombre que la identifique, por ejemplo: <code>AutoPress AI Content Manager</code>.</li>
  <li>En el campo "Desarrollador de la aplicación", selecciona tu cuenta de desarrollador.</li>
  <li>Haz clic en <strong>"Crear aplicación"</strong>.</li>
</ol>

<h3>Paso 3: Configura los Scopes (Permisos)</h3>
<p>Después de crear la app, Shopify te llevará a la página de configuración. Es crucial asignar los permisos correctos.</p>
<ol>
  <li>Ve a la pestaña <strong>"Configuración"</strong> y luego a <strong>"Configurar ámbitos de la API de Admin"</strong> (Configure Admin API scopes).</li>
  <li>Busca y marca las casillas para los siguientes permisos (scopes). Esto le dará a AutoPress AI acceso para gestionar el contenido de la tienda:</li>
</ol>
<ul>
    <li>✅ <code>read_content</code> y <code>write_content</code> (Para páginas y redirecciones)</li>
    <li>✅ <code>read_products</code> y <code>write_products</code> (Para productos y colecciones)</li>
    <li>✅ <code>read_themes</code> y <code>write_themes</code> (Para personalizar el tema)</li>
    <li>✅ <code>read_navigation</code> y <code>write_navigation</code> (Para gestionar menús)</li>
    <li>✅ <code>read_files</code> y <code>write_files</code> (Para subir imágenes a los archivos de la tienda)</li>
    <li>✅ <code>read_blogs</code> y <code>write_blogs</code> (Para artículos y blogs)</li>
</ul>
<ol start="3">
  <li>Haz clic en <strong>"Guardar"</strong> en la parte superior derecha.</li>
</ol>

<h3>Paso 4: Instala la App y Obtén el Token</h3>
<p>¡Casi has terminado! Ahora necesitas instalar la app en tu tienda para generar el token de acceso.</p>
<ol>
  <li>Ve a la pestaña <strong>"Credenciales de la API"</strong> (API credentials).</li>
  <li>En la sección "Token de acceso a la API de Admin", haz clic en <strong>"Instalar aplicación"</strong>.</li>
  <li>Confirma la instalación en la ventana emergente.</li>
  <li>Una vez instalada, Shopify te mostrará el <strong>"Token de acceso a la API de Admin"</strong>. ¡Es la única vez que se mostrará por completo!</li>
  <li>Haz clic en <strong>"Mostrar token una vez"</strong> y copia el token (empieza por <code>shpat_...</code>).</li>
</ol>

<h3>Paso 5: Guarda las Credenciales en AutoPress AI</h3>
<ol>
  <li>Vuelve a la plataforma AutoPress AI.</li>
  <li>Ve a <strong>Ajustes > Conexiones</strong>.</li>
  <li>Crea un nuevo perfil de conexión o edita uno existente.</li>
  <li>En la sección de "Conexión a Tienda Shopify", pega los siguientes datos:</li>
  <ul>
      <li><strong>URL de la Tienda (.myshopify.com):</strong> La URL de tu tienda de desarrollo (ej: <code>mi-tienda-dev.myshopify.com</code>).</li>
      <li><strong>Token de Acceso de Admin API:</strong> El token <code>shpat_...</code> que acabas de copiar.</li>
  </ul>
  <li>Haz clic en <strong>"Guardar y Activar"</strong>.</li>
</ol>
<p>¡Listo! Con esto, AutoPress AI ya tiene los permisos necesarios para poblar y gestionar el contenido de esta tienda de desarrollo específica.</p>
