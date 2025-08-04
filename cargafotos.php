<?php
header('Content-Type: application/json');
header('Access-Control-Allow-Origin: *'); // Cambiar a dominio específico en producción
header('Access-Control-Allow-Methods: POST, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type, Authorization');

if ($_SERVER['REQUEST_METHOD'] == 'OPTIONS') {
    exit(0);
}

// Clave secreta para validar peticiones de la API
$api_secret_key = 'tu-clave-secreta-muy-segura-aqui'; // ¡IMPORTANTE! Cambia esta clave

// Verificar la clave secreta para subidas programáticas
$auth_header = $_SERVER['HTTP_AUTHORIZATION'] ?? '';
if (strpos($auth_header, 'Bearer ') === 0) {
    $submitted_key = substr($auth_header, 7);
    if ($submitted_key !== $api_secret_key) {
        http_response_code(401);
        echo json_encode(['success' => false, 'error' => 'Clave de API no válida.']);
        exit;
    }
} else if (!isset($_FILES['imagen'])) {
    // Si no es una subida de formulario tradicional y tampoco tiene clave de API, se rechaza.
    http_response_code(401);
    echo json_encode(['success' => false, 'error' => 'Acceso no autorizado.']);
    exit;
}


$directorio = 'imagenes_cursos/';
if (!is_dir($directorio)) {
    if (!mkdir($directorio, 0755, true)) {
        echo json_encode(['success' => false, 'error' => 'Error al crear el directorio de imágenes. Path: ' . realpath(dirname(__FILE__)) . '/' . $directorio]);
        exit;
    }
}

$imageData = null;
$clientFilename = 'image.webp'; // Default filename for raw data
$error_code = UPLOAD_ERR_NO_FILE;

// Check for multipart/form-data upload first
if (isset($_FILES['imagen']) && $_FILES['imagen']['error'] === UPLOAD_ERR_OK) {
    $imagen_file_info = $_FILES['imagen'];
    $tmp_path = $imagen_file_info['tmp_name'];
    $clientFilename = $imagen_file_info['name'];
    $imageData = file_get_contents($tmp_path);
    $error_code = $_FILES['imagen']['error'];
} else {
    // Fallback to read raw POST data if no file is uploaded via multipart
    $imageData = file_get_contents('php://input');
    if ($imageData === false || empty($imageData)) {
        if (isset($_FILES['imagen']['error'])) {
            $error_code = $_FILES['imagen']['error'];
        }
        $error_messages = [
            UPLOAD_ERR_OK         => 'No hay error, archivo subido con éxito.',
            UPLOAD_ERR_INI_SIZE   => 'El archivo excede la directiva upload_max_filesize en php.ini.',
            UPLOAD_ERR_FORM_SIZE  => 'El archivo excede la directiva MAX_FILE_SIZE especificada en el formulario HTML.',
            UPLOAD_ERR_PARTIAL    => 'El archivo se subió solo parcialmente.',
            UPLOAD_ERR_NO_FILE    => 'No se subió ningún archivo.',
            UPLOAD_ERR_NO_TMP_DIR => 'Falta una carpeta temporal del servidor.',
            UPLOAD_ERR_CANT_WRITE => 'No se pudo escribir el archivo en el disco del servidor.',
            UPLOAD_ERR_EXTENSION  => 'Una extensión de PHP detuvo la subida del archivo.',
        ];
        $error_message = $error_messages[$error_code] ?? 'Error desconocido al subir la imagen.';
        echo json_encode(['success' => false, 'error' => 'No se proporcionó una imagen válida: ' . $error_message]);
        exit;
    }
}

// Create a temporary file to work with the image data
$tmp_path = tempnam(sys_get_temp_dir(), 'img');
if ($tmp_path === false) {
    echo json_encode(['success' => false, 'error' => 'No se pudo crear un archivo temporal.']);
    exit;
}
file_put_contents($tmp_path, $imageData);


// Validar el tipo de archivo real
$image_info = getimagesize($tmp_path);
if ($image_info === false) {
    unlink($tmp_path);
    echo json_encode(['success' => false, 'error' => 'El archivo no es una imagen válida.']);
    exit;
}

$mime_to_extension = [
    'image/jpeg' => 'jpg',
    'image/png' => 'png',
    'image/webp' => 'webp',
    'image/gif' => 'gif',
];
$detected_mime = $image_info['mime'];
$detected_extension = $mime_to_extension[$detected_mime] ?? null;

if (!$detected_extension) {
    unlink($tmp_path);
    echo json_encode(['success' => false, 'error' => 'Formato de imagen no soportado: ' . $detected_mime]);
    exit;
}

// Sanitizar el nombre del archivo
$nombre_base_sanitizado = basename($clientFilename);
$nombre_final_para_guardar = preg_replace('/[^A-Za-z0-9_.\-]/', '', str_replace(' ', '-', $nombre_base_sanitizado));
$nombre_final_para_guardar = trim($nombre_final_para_guardar, '-_.');
$nombre_final_para_guardar = preg_replace('/-+/', '-', $nombre_final_para_guardar);

// Forzar la extensión correcta según el tipo de archivo detectado
$nombre_sin_extension = pathinfo($nombre_final_para_guardar, PATHINFO_FILENAME);
if (empty($nombre_sin_extension)) {
    $nombre_final_para_guardar = 'fallback_' . uniqid() . '.' . $detected_extension;
} else {
    $nombre_final_para_guardar = $nombre_sin_extension . '.' . $detected_extension;
}

$ruta_destino = $directorio . $nombre_final_para_guardar;
error_log("[cargafotos.php] Moving uploaded file from $tmp_path to $ruta_destino (Filename: $nombre_final_para_guardar)");

if (rename($tmp_path, $ruta_destino)) {
    $scheme = (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off') ? 'https://' : 'http://';
    $host = $_SERVER['HTTP_HOST'];
    $script_path = dirname($_SERVER['SCRIPT_NAME']);
    $full_directory_path = rtrim($script_path, '/') . '/' . trim($directorio, '/');
    $full_directory_path = str_replace('\\', '/', $full_directory_path);
    $full_directory_path = preg_replace('#/+#', '/', $full_directory_path);

    $url = $scheme . $host . $full_directory_path . '/' . $nombre_final_para_guardar;

    echo json_encode([
        'success' => true,
        'url' => $url,
        'filename_saved' => $nombre_final_para_guardar,
        'mime_type' => $detected_mime // Para depuración
    ]);
} else {
    if (is_file($tmp_path)) {
        unlink($tmp_path);
    }
    echo json_encode(['success' => false, 'error' => 'Error al guardar la imagen en el servidor. Verifica permisos y ruta destino: ' . $ruta_destino]);
}
?>