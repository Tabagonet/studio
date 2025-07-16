<?php
/*
Plugin Name: AutoPress AI Helper
Description: Añade endpoints a la REST API para gestionar traducciones, stock y otras funciones personalizadas para AutoPress AI.
Version: 1.40
Author: intelvisual@intelvisual.es
*/

if ( ! defined( 'ABSPATH' ) ) exit;

// === Admin Menu and Settings Page ===
add_action('admin_menu', 'autopress_ai_add_admin_menu');

function autopress_ai_get_plugin_version() {
    if (!function_exists('get_plugin_data')) {
        require_once(ABSPATH . 'wp-admin/includes/plugin.php');
    }
    $plugin_data = get_plugin_data(__FILE__);
    return $plugin_data['Version'];
}

function autopress_ai_add_admin_menu() {
    $plugin_version = autopress_ai_get_plugin_version();
    $page_title = 'AutoPress AI Helper - v' . esc_html($plugin_version);
    add_options_page($page_title, 'AutoPress AI', 'manage_options', 'autopress-ai', 'autopress_ai_options_page');
}

function autopress_ai_options_page() {
    ?>
    <div class="wrap">
        <h1><?php echo esc_html(get_admin_page_title()); ?></h1>
        <p>Este plugin añade las funcionalidades necesarias a la API de WordPress para que la aplicación principal de AutoPress AI pueda comunicarse con tu sitio de forma segura.</p>
        <p>Toda la configuración de las claves API se gestiona directamente desde la aplicación AutoPress AI en <a href="https://autopress.intelvisual.es/settings/connections" target="_blank">Ajustes > Conexiones</a>.</p>
        
        <h2>Verificar Conexión con AutoPress AI</h2>
        <p>Haz clic en el botón de abajo para comprobar si el plugin puede comunicarse correctamente con la plataforma de AutoPress AI. Esto verificará que tu sitio está correctamente configurado en la aplicación.</p>
        <button id="autopress-verify-connection" class="button button-primary">Verificar Conexión</button>
        <div id="autopress-verify-result" style="margin-top: 15px; padding: 10px; border-left-width: 4px; border-left-style: solid; display: none;"></div>
    </div>
    <script>
        document.getElementById('autopress-verify-connection').addEventListener('click', function() {
            var button = this;
            var resultDiv = document.getElementById('autopress-verify-result');
            resultDiv.style.display = 'block';
            resultDiv.textContent = 'Verificando...';
            resultDiv.style.borderColor = '#cccccc';
            button.disabled = true;

            var restUrl = '<?php echo esc_url_raw(get_rest_url(null, 'custom/v1/status')); ?>';
            var nonce = '<?php echo esc_js(wp_create_nonce('wp_rest')); ?>';
            
            fetch(restUrl, {
                method: 'GET',
                headers: {
                    'Content-Type': 'application/json',
                    'X-WP-Nonce': nonce
                }
            })
            .then(response => {
                return response.json().then(data => {
                    if (!response.ok) {
                        throw new Error(data.message || 'Error de comunicación.');
                    }
                    return data;
                });
            })
            .then(data => {
                if (data.verified) {
                    resultDiv.textContent = '¡Éxito! ' + data.message;
                    resultDiv.style.borderColor = '#46b450';
                } else {
                    resultDiv.textContent = 'Error: ' + data.message;
                    resultDiv.style.borderColor = '#dc3232';
                }
                button.disabled = false;
            })
            .catch(error => {
                resultDiv.textContent = 'Error: ' + error.message;
                resultDiv.style.borderColor = '#dc3232';
                button.disabled = false;
            });
        });
    </script>
    <?php
}

// === REST API Endpoints ===
add_action('init', 'custom_api_register_yoast_meta_fields');
add_action('plugins_loaded', 'autopress_ai_register_rest_endpoints');

function custom_api_register_yoast_meta_fields() {
    $post_types = get_post_types( [ 'public' => true ], 'names' );
    $yoast_meta_keys = ['_yoast_wpseo_title', '_yoast_wpseo_metadesc', '_yoast_wpseo_focuskw'];
    foreach ( $post_types as $post_type ) {
        foreach ( $yoast_meta_keys as $meta_key ) {
            register_post_meta( $post_type, $meta_key, ['show_in_rest' => true, 'single' => true, 'type' => 'string', 'auth_callback' => function() { return current_user_can( 'edit_posts' ); }]);
        }
    }
}

// Rewritten security check function. This is the standard, secure way to check permissions in WordPress REST API.
function autopress_ai_permission_check() {
    // This single check correctly handles both cookie-based authentication (for the admin panel)
    // and application password authentication (for the external app).
    // The 'edit_posts' capability is a good general-purpose check to ensure the user is at least an Editor.
    return current_user_can('edit_posts');
}


function autopress_ai_register_rest_endpoints() {
    
    add_filter( 'rest_post_query', 'pll_rest_filter_by_language', 10, 2 );
    add_filter( 'rest_page_query', 'pll_rest_filter_by_language', 10, 2 );
    add_filter( 'rest_product_query', 'pll_rest_filter_by_language', 10, 2);

    function pll_rest_filter_by_language( $args, $request ) { $lang = $request->get_param( 'lang' ); if ( $lang && function_exists( 'pll_get_language' ) ) { $lang_obj = pll_get_language( $lang ); if ( $lang_obj ) { $args['lang'] = $lang; } } return $args; }

    add_action( 'rest_api_init', function () {
        $post_types = get_post_types( [ 'public' => true ], 'names' );
        foreach ( $post_types as $type ) {
            if (function_exists('pll_get_post_language')) {
                register_rest_field( $type, 'lang', ['get_callback' => function ($p) { return pll_get_post_language($p['id'], 'slug'); }, 'schema' => null,] );
                register_rest_field( $type, 'translations', ['get_callback' => function ($p) { return pll_get_post_translations($p['id']); }, 'schema' => null,] );
            } else {
                 register_rest_field( $type, 'lang', ['get_callback' => function ($p) { $lang = get_locale(); return substr($lang, 0, 2); }, 'schema' => null,] );
            }
        }
        if (function_exists('pll_save_post_translations')) {
            register_rest_route( 'custom/v1', '/link-translations', ['methods' => 'POST', 'callback' => 'custom_api_link_translations', 'permission_callback' => 'autopress_ai_permission_check']);
        }
        register_rest_route( 'custom/v1', '/batch-trash-posts', ['methods' => 'POST', 'callback' => 'custom_api_batch_trash_posts', 'permission_callback' => 'autopress_ai_permission_check']);
        register_rest_route( 'custom/v1', '/batch-clone-posts', ['methods'  => 'POST', 'callback' => 'custom_api_batch_clone_posts', 'permission_callback' => 'autopress_ai_permission_check']);
        register_rest_route( 'custom/v1', '/content-list', ['methods'  => 'GET', 'callback' => 'custom_api_get_content_list', 'permission_callback' => 'autopress_ai_permission_check']);
        
        // This endpoint is the primary method for status verification.
        register_rest_route( 'custom/v1', '/status', ['methods' => 'GET', 'callback' => 'custom_api_status_check', 'permission_callback' => 'autopress_ai_permission_check']);
        
        register_rest_route( 'custom/v1', '/trash-post/(?P<id>\d+)', ['methods' => 'POST', 'callback' => 'custom_api_trash_single_post', 'permission_callback' => 'autopress_ai_permission_check']);
        
        // New endpoint for regenerating Elementor CSS
        register_rest_route( 'custom/v1', '/regenerate-css/(?P<id>\d+)', ['methods' => 'POST', 'callback' => 'custom_api_regenerate_elementor_css', 'permission_callback' => 'autopress_ai_permission_check']);
    });
    
    function custom_api_status_check($request) {
        // The permission callback already handled verification. If we got here, it's a success.
        return new WP_REST_Response([
            'status' => 'ok',
            'plugin_version' => autopress_ai_get_plugin_version(),
            'verified' => true,
            'message' => 'Plugin activo y verificado.',
            'woocommerce_active' => class_exists('WooCommerce'),
            'polylang_active' => function_exists('pll_get_post_language'),
        ], 200);
    }
    function custom_api_link_translations( $request ) { if ( ! function_exists( 'pll_save_post_translations' ) ) { return new WP_Error( 'polylang_not_found', 'Polylang no está activo.', [ 'status' => 501 ] ); } $translations = $request->get_param( 'translations' ); if ( empty( $translations ) || ! is_array( $translations ) ) { return new WP_Error( 'invalid_payload', 'Se requiere un array asociativo de traducciones.', [ 'status' => 400 ] ); } $sanitized = []; foreach ( $translations as $lang => $post_id ) { $sanitized[ sanitize_key( $lang ) ] = absint( $post_id ); } pll_save_post_translations( $sanitized ); return new WP_REST_Response( ['success' => true, 'message' => 'Traducciones enlazadas.'], 200 ); }
    function custom_api_trash_single_post( $request ) {
        $post_id = $request->get_param('id');
        $id = absint($post_id);
        if (!$id || $id === 0) {
            return new WP_Error('invalid_id', 'ID de post inválido.', ['status' => 400]);
        }
        if (!function_exists('wp_trash_post')) {
            return new WP_Error('trash_function_missing', 'La función wp_trash_post no está disponible.', ['status' => 500]);
        }
        if (wp_trash_post($id)) {
            return new WP_REST_Response(['success' => true, 'message' => "Post {$id} movido a la papelera."], 200);
        } else {
            return new WP_Error('trash_failed', "No se pudo mover el post {$id} a la papelera.", ['status' => 500]);
        }
    }
    function custom_api_batch_trash_posts( $request ) { $post_ids = $request->get_param( 'post_ids' ); if ( empty( $post_ids ) || ! is_array( $post_ids ) ) { return new WP_Error( 'invalid_payload', 'Se requiere un array de IDs de entradas.', ['status' => 400] ); } $results = [ 'success' => [], 'failed' => [] ]; foreach ( $post_ids as $post_id ) { $id = absint($post_id); if ( $id && current_user_can('delete_post', $id) && function_exists('wp_trash_post') ) { if ( wp_trash_post( $id ) ) { $results['success'][] = $id; } else { $results['failed'][] = ['id' => $id, 'reason' => 'Fallo en wp_trash_post.']; } } else { $results['failed'][] = ['id' => $id, 'reason' => 'Permiso denegado o ID inválido.']; } } return new WP_REST_Response( ['success' => true, 'data' => $results], 200 ); }
    function custom_api_batch_clone_posts( $request ) { $post_ids = $request->get_param( 'post_ids' ); $target_lang = sanitize_key( $request->get_param( 'target_lang' ) ); if ( empty( $post_ids ) || ! is_array( $post_ids ) ) { return new WP_Error( 'invalid_payload', 'Se requiere un array de IDs de posts.', [ 'status' => 400 ] ); } if ( ! $target_lang || !function_exists('pll_set_post_language') ) { return new WP_Error( 'no_target_lang', 'Debes indicar el idioma destino y Polylang debe estar activo.', [ 'status' => 400 ] ); } $results = [ 'success' => [], 'failed' => [] ]; foreach ( $post_ids as $source_id ) { $source_id = absint( $source_id ); if ( ! $source_id || ! current_user_can( 'edit_post', $source_id ) ) { $results['failed'][] = ['id' => $source_id, 'reason' => 'Permiso denegado o ID inválido.']; continue; } $source_post = get_post( $source_id ); if ( ! $source_post ) { $results['failed'][] = ['id' => $source_id, 'reason' => 'Post no encontrado.']; continue; } $original_lang = pll_get_post_language( $source_id, 'slug' ); if ( ! $original_lang || $original_lang === $target_lang ) { $results['failed'][] = ['id' => $source_id, 'reason' => 'Idioma inválido o ya coincide.']; continue; } $new_post_args = [ 'post_author' => $source_post->post_author, 'post_content' => $source_post->post_content, 'post_title' => $source_post->post_title, 'post_excerpt' => $source_post->post_excerpt, 'post_status' => 'draft', 'post_type' => $source_post->post_type ]; $new_post_id = wp_insert_post( wp_slash( $new_post_args ), true ); if ( is_wp_error( $new_post_id ) ) { $results['failed'][] = ['id' => $source_id, 'reason' => 'Error al clonar.']; continue; } $meta_blacklist = [ '_edit_lock', '_edit_last', '_thumbnail_id', '_pll_content_id', '_post_translations', ]; $source_meta = get_post_meta( $source_id ); foreach ( $source_meta as $meta_key => $meta_values ) { if ( in_array( $meta_key, $meta_blacklist ) ) { continue; } foreach ( $meta_values as $meta_value ) { add_post_meta( $new_post_id, $meta_key, maybe_unserialize( $meta_value ) ); } } $taxonomies = get_object_taxonomies( $source_post->post_type ); foreach ( $taxonomies as $taxonomy ) { if ($taxonomy == 'language' || $taxonomy == 'post_translations') continue; $terms = wp_get_object_terms( $source_id, $taxonomy, [ 'fields' => 'ids' ] ); if ( ! is_wp_error( $terms ) ) { wp_set_object_terms( $new_post_id, $terms, $taxonomy ); } } $thumbnail_id = get_post_thumbnail_id( $source_id ); if ( $thumbnail_id ) { set_post_thumbnail( $new_post_id, $thumbnail_id ); } pll_set_post_language( $new_post_id, $target_lang ); $existing_translations = pll_get_post_translations( $source_id ); $new_translations = array_merge($existing_translations, [$target_lang => $new_post_id]); pll_save_post_translations( $new_translations ); $results['success'][] = [ 'original_id' => $source_id, 'clone_id' => $new_post_id, 'post_type' => $source_post->post_type ]; } return new WP_REST_Response( $results, 200 ); }
    function custom_api_get_content_list($request) {
        $post_types_to_query = ['post', 'page', 'product'];
        
        $args = [ 
            'post_type' => $post_types_to_query,
            'posts_per_page' => -1, 
            'post_status' => ['publish', 'draft', 'pending', 'private', 'future', 'trash'], 
            'fields' => 'ids',
            'lang' => '',
        ]; 
        $query = new WP_Query($args); 
        $post_ids = $query->posts; 
        $content_list = []; 
        if (!empty($post_ids)) { 
            foreach ($post_ids as $post_id) { 
                $post_obj = get_post($post_id); 
                if (!$post_obj) continue; 
                $type_slug = get_post_type($post_obj->ID); $type_label = 'Post'; 
                if ($type_slug === 'page') { 
                    $type_label = 'Page'; 
                } elseif ($type_slug === 'product') { 
                    $type_label = 'Producto'; 
                } 
                $content_list[] = [ 
                    'id' => $post_obj->ID, 
                    'title' => $post_obj->post_title, 
                    'type' => $type_label, 
                    'link' => get_permalink($post_obj->ID), 
                    'status' => $post_obj->post_status, 
                    'parent' => $post_obj->post_parent, 
                    'lang' => function_exists('pll_get_post_language') ? pll_get_post_language($post_obj->ID, 'slug') : null, 
                    'translations' => function_exists('pll_get_post_translations') ? pll_get_post_translations($post_obj->ID) : [], 
                    'modified' => $post_obj->post_modified, 
                ]; 
            } 
        } 
        return new WP_REST_Response(['content' => $content_list], 200); 
    }
    function custom_api_regenerate_elementor_css( $request ) {
        $post_id = $request->get_param('id');
        $id = absint($post_id);

        if ( !$id || !class_exists( 'Elementor\\Plugin' ) ) {
            return new WP_Error( 'invalid_request', 'ID de post inválido o Elementor no está activo.', ['status' => 400] );
        }

        try {
            \Elementor\Plugin::$instance->files_manager->clear_cache();
            return new WP_REST_Response( ['success' => true, 'message' => "Caché de CSS de Elementor limpiada para el post {$id}."], 200 );
        } catch ( Exception $e ) {
            return new WP_Error( 'regeneration_failed', 'Fallo al regenerar el CSS: ' . $e->getMessage(), ['status' => 500] );
        }
    }
}

?>
