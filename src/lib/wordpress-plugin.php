<?php
/*
Plugin Name: AutoPress AI Helper
Description: Añade endpoints a la REST API para gestionar traducciones, stock y otras funciones personalizadas para AutoPress AI.
Version: 1.61
Author: intelvisual@intelvisual.es
Requires at least: 5.8
Requires PHP: 7.4
*/

if ( ! defined( 'ABSPATH' ) ) exit;

add_action( 'woocommerce_rest_product_query', 'wc_rest_filter_products_by_has_image', 10, 2 );

function wc_rest_filter_products_by_has_image( $args, $request ) {
    $has_image = $request->get_param( 'has_image' );
    if ( $has_image === null ) {
        return $args;
    }
    
    if ($has_image === 'yes' || $has_image === 'true' || $has_image === 1 || $has_image === '1' ) {
        $args['meta_query'][] = array(
            'key'     => '_thumbnail_id',
            'compare' => 'EXISTS'
        );
    } elseif ($has_image === 'no' || $has_image === 'false' || $has_image === 0 || $has_image === '0') {
        $args['meta_query'][] = array(
            'key'     => '_thumbnail_id',
            'compare' => 'NOT EXISTS'
        );
    }
    return $args;
}

// === Admin Menu and Settings Page (existing code) ===
add_action('admin_menu', 'autopress_ai_add_admin_menu');
function autopress_ai_get_plugin_version() { if (!function_exists('get_plugin_data')) { require_once(ABSPATH . 'wp-admin/includes/plugin.php'); } $plugin_data = get_plugin_data(__FILE__); return $plugin_data['Version']; }
function autopress_ai_add_admin_menu() { $plugin_version = autopress_ai_get_plugin_version(); $page_title = 'AutoPress AI Helper - v' . esc_html($plugin_version); add_options_page($page_title, 'AutoPress AI', 'manage_options', 'autopress-ai', 'autopress_ai_options_page');}
function autopress_ai_options_page() { ?> <div class="wrap"> <h1><?php echo esc_html(get_admin_page_title()); ?></h1> <p>Este plugin añade las funcionalidades necesarias a la API de WordPress para que la aplicación principal de AutoPress AI pueda comunicarse con tu sitio de forma segura.</p> <p>Toda la configuración de las claves API se gestiona directamente desde la aplicación AutoPress AI en <a href="https://autopress.intelvisual.es/settings/connections" target="_blank">Ajustes > Conexiones</a>.</p> <h2>Verificar Conexión con AutoPress AI</h2> <p>Haz clic en el botón de abajo para comprobar si el plugin puede comunicarse correctamente con la plataforma de AutoPress AI. Esto verificará que tu sitio está correctamente configurado en la aplicación.</p> <button id="autopress-verify-connection" class="button button-primary">Verificar Conexión</button> <div id="autopress-verify-result" style="margin-top: 15px; padding: 10px; border-left-width: 4px; border-left-style: solid; display: none;"></div> </div> <script> document.getElementById('autopress-verify-connection').addEventListener('click', function() { var button = this; var resultDiv = document.getElementById('autopress-verify-result'); resultDiv.style.display = 'block'; resultDiv.textContent = 'Verificando...'; resultDiv.style.borderColor = '#cccccc'; button.disabled = true; var restUrl = '<?php echo esc_url_raw(get_rest_url(null, 'custom/v1/status')); ?>'; var nonce = '<?php echo esc_js(wp_create_nonce('wp_rest')); ?>'; fetch(restUrl, { method: 'GET', headers: { 'Content-Type': 'application/json', 'X-WP-Nonce': nonce } }) .then(response => { return response.json().then(data => { if (!response.ok) { throw new Error(data.message || 'Error de comunicación.'); } return data; }); }) .then(data => { if (data.verified) { resultDiv.textContent = '¡Éxito! ' + data.message; resultDiv.style.borderColor = '#46b450'; } else { resultDiv.textContent = 'Error: ' + data.message; resultDiv.style.borderColor = '#dc3232'; } button.disabled = false; }) .catch(error => { resultDiv.textContent = 'Error: ' + error.message; resultDiv.style.borderColor = '#dc3232'; button.disabled = false; }); }); </script> <?php }

// === REST API Endpoints ===
add_action('init', 'custom_api_register_yoast_meta_fields');
add_action('plugins_loaded', 'autopress_ai_register_rest_endpoints');

function custom_api_register_yoast_meta_fields() { $post_types = get_post_types( [ 'public' => true ], 'names' ); $yoast_meta_keys = ['_yoast_wpseo_title', '_yoast_wpseo_metadesc', '_yoast_wpseo_focuskw']; foreach ( $post_types as $post_type ) { foreach ( $yoast_meta_keys as $meta_key ) { register_post_meta( $post_type, $meta_key, ['show_in_rest' => true, 'single' => true, 'type' => 'string', 'auth_callback' => function() { return current_user_can( 'edit_posts' ); }]);}}}
function autopress_ai_permission_check(WP_REST_Request $request) { return current_user_can('edit_posts'); }

// ### NEW IMAGE HANDLING LOGIC - START ###
function custom_media_sideload_image($file_url, $post_id) {
    if (!function_exists('media_handle_sideload')) {
        require_once ABSPATH . 'wp-admin/includes/file.php';
        require_once ABSPATH . 'wp-admin/includes/media.php';
        require_once ABSPATH . 'wp-admin/includes/image.php';
    }
    $tmp = download_url($file_url, 15); // Add a 15-second timeout
    if (is_wp_error($tmp)) {
        error_log('AutoPress AI Sideload Error (download_url): ' . $tmp->get_error_message());
        return $tmp;
    }
    $file_array = ['name' => basename(wp_parse_url($file_url, PHP_URL_PATH)), 'tmp_name' => $tmp];
    $id = media_handle_sideload($file_array, $post_id);
    if (is_wp_error($id)) {
        @unlink($file_array['tmp_name']);
        error_log('AutoPress AI Sideload Error (media_handle_sideload): ' . $id->get_error_message());
    }
    return $id;
}

function custom_api_update_product_images(WP_REST_Request $request) {
    $product_id = intval($request->get_param('product_id'));
    $mode = sanitize_text_field($request->get_param('mode'));
    $image_urls = $request->get_param('images');

    if (!$product_id) { return new WP_Error('no_id', 'Falta el ID del producto', ['status' => 400]); }
    $product = wc_get_product($product_id);
    if (!$product) { return new WP_Error('not_found', 'Producto no encontrado', ['status' => 404]); }

    $current_ids = [];
    if ($product->get_image_id()) { $current_ids[] = $product->get_image_id(); }
    if (method_exists($product, 'get_gallery_image_ids')) {
        $current_ids = array_merge($current_ids, $product->get_gallery_image_ids());
    }

    $new_ids = [];
    if (is_array($image_urls)) {
        foreach ($image_urls as $img) {
            if (is_numeric($img)) { $new_ids[] = intval($img); }
            else if (filter_var($img, FILTER_VALIDATE_URL)) {
                $id = custom_media_sideload_image($img, $product_id);
                if (is_numeric($id)) $new_ids[] = $id;
            }
        }
    }

    $final_ids = [];
    if ($mode === 'replace') { $final_ids = $new_ids; }
    else if ($mode === 'add') { $final_ids = array_unique(array_merge($current_ids, $new_ids)); }
    else if ($mode === 'remove') { $final_ids = array_diff($current_ids, $new_ids); }
    else if ($mode === 'clear') { $final_ids = []; }
    else { $final_ids = $new_ids; } // Default to replace

    $main_id = array_shift($final_ids);
    $product->set_image_id($main_id ?: 0);
    $product->set_gallery_image_ids($final_ids);
    $product->save();

    return new WP_REST_Response(['status' => 'success', 'product_id' => $product_id, 'images' => $product->get_gallery_image_ids()], 200);
}

function custom_api_get_polylang_languages() {
    if ( ! function_exists( 'pll_the_languages' ) ) {
        return new WP_Error( 'polylang_not_active', 'Polylang plugin is not active.', [ 'status' => 501 ] );
    }
    $languages = pll_the_languages( [ 'raw' => 1 ] );
    $formatted_languages = [];
    foreach ( $languages as $lang ) {
        $formatted_languages[] = [
            'code' => $lang['slug'],
            'name' => $lang['name'],
            'flag' => $lang['flag'],
        ];
    }
    return new WP_REST_Response( $formatted_languages, 200 );
}


function autopress_ai_register_rest_endpoints() {
    add_filter( 'rest_post_query', 'pll_rest_filter_by_language', 10, 2 ); add_filter( 'rest_page_query', 'pll_rest_filter_by_language', 10, 2 ); add_filter( 'rest_product_query', 'pll_rest_filter_by_language', 10, 2);
    function pll_rest_filter_by_language( $args, $request ) { $lang = $request->get_param( 'lang' ); if ( $lang && function_exists( 'pll_get_language' ) ) { $lang_obj = pll_get_language( $lang ); if ( $lang_obj ) { $args['lang'] = $lang; } } return $args; }

    add_action( 'rest_api_init', function () {
        $post_types = get_post_types( [ 'public' => true ], 'names' );
        foreach ( $post_types as $type ) { if (function_exists('pll_get_post_language')) { register_rest_field( $type, 'lang', ['get_callback' => function ($p) { return pll_get_post_language($p['id'], 'slug'); }, 'schema' => null,] ); register_rest_field( $type, 'translations', ['get_callback' => function ($p) { return pll_get_post_translations($p['id']); }, 'schema' => null,] ); } else { register_rest_field( $type, 'lang', ['get_callback' => function ($p) { $lang = get_locale(); return substr($lang, 0, 2); }, 'schema' => null,] ); } }
        if (function_exists('pll_save_post_translations')) { register_rest_route( 'custom/v1', '/link-translations', ['methods' => 'POST', 'callback' => 'custom_api_link_translations', 'permission_callback' => 'autopress_ai_permission_check']); }
        register_rest_route( 'custom/v1', '/batch-trash-posts', ['methods' => 'POST', 'callback' => 'custom_api_batch_trash_posts', 'permission_callback' => 'autopress_ai_permission_check']); register_rest_route( 'custom/v1', '/batch-update-status', ['methods' => 'POST', 'callback' => 'custom_api_batch_update_status', 'permission_callback' => 'autopress_ai_permission_check']); register_rest_route( 'custom/v1', '/batch-clone-posts', ['methods'  => 'POST', 'callback' => 'custom_api_batch_clone_posts', 'permission_callback' => 'autopress_ai_permission_check']); register_rest_route( 'custom/v1', '/content-list', ['methods'  => 'GET', 'callback' => 'custom_api_get_content_list', 'permission_callback' => 'autopress_ai_permission_check']); register_rest_route( 'custom/v1', '/status', ['methods' => 'GET', 'callback' => 'custom_api_status_check', 'permission_callback' => 'autopress_ai_permission_check']); register_rest_route( 'custom/v1', '/trash-post/(?P<id>\d+)', ['methods' => 'POST', 'callback' => 'custom_api_trash_single_post', 'permission_callback' => 'autopress_ai_permission_check']); register_rest_route( 'custom/v1', '/regenerate-css/(?P<id>\d+)', ['methods' => 'POST', 'callback' => 'custom_api_regenerate_elementor_css', 'permission_callback' => 'autopress_ai_permission_check']); register_rest_route( 'custom/v1', '/menus', ['methods' => 'GET', 'callback' => 'custom_api_get_all_menus', 'permission_callback' => 'autopress_ai_permission_check']); register_rest_route( 'custom/v1', '/clone-menu', ['methods' => 'POST', 'callback' => 'custom_api_clone_menu', 'permission_callback' => 'autopress_ai_permission_check']); register_rest_route( 'custom/v1', '/get-or-create-category', ['methods' => 'POST', 'callback' => 'custom_api_get_or_create_category', 'permission_callback' => 'autopress_ai_permission_check']); register_rest_route('custom/v1', '/update-variation-images', ['methods' => 'POST', 'callback' => 'custom_api_update_variation_images', 'permission_callback' => 'autopress_ai_permission_check']);
        register_rest_route( 'custom/v1', '/get-languages', [ 'methods' => 'GET', 'callback' => 'custom_api_get_polylang_languages', 'permission_callback' => 'autopress_ai_permission_check' ]);

        register_rest_route('custom-api/v1', '/update-product-images', ['methods' => 'POST', 'callback' => 'custom_api_update_product_images', 'permission_callback' => function () { return current_user_can('edit_products'); }]);
    });
    
    function custom_api_status_check($request) { return new WP_REST_Response([ 'status' => 'ok', 'plugin_version' => autopress_ai_get_plugin_version(), 'verified' => true, 'message' => 'Plugin activo y verificado.', 'woocommerce_active' => class_exists('WooCommerce'), 'polylang_active' => function_exists('pll_get_post_language'), 'front_page_id' => (int) get_option('page_on_front', 0), ], 200); }
    function custom_api_link_translations( $request ) { if ( ! function_exists( 'pll_save_post_translations' ) ) { return new WP_Error( 'polylang_not_found', 'Polylang no está activo.', [ 'status' => 501 ] ); } $translations = $request->get_param( 'translations' ); if ( empty( $translations ) || ! is_array( $translations ) ) { return new WP_Error( 'invalid_payload', 'Se requiere un array asociativo de traducciones.', [ 'status' => 400 ] ); } $sanitized = []; foreach ( $translations as $lang => $post_id ) { $sanitized[ sanitize_key( $lang ) ] = absint( $post_id ); } pll_save_post_translations( $sanitized ); return new WP_REST_Response( ['success' => true, 'message' => 'Traducciones enlazadas.'], 200 ); }
    function custom_api_trash_single_post( $request ) { $post_id = $request->get_param('id'); $id = absint($post_id); if (!$id || $id === 0) { return new WP_Error('invalid_id', 'ID de post inválido.', ['status' => 400]); } if (!function_exists('wp_trash_post')) { return new WP_Error('trash_function_missing', 'La función wp_trash_post no está disponible.', ['status' => 500]); } if (wp_trash_post($id)) { return new WP_REST_Response(['success' => true, 'message' => "Post {$id} movido a la papelera."], 200); } else { return new WP_Error('trash_failed', "No se pudo mover el post {$id} a la papelera.", ['status' => 500]); } }
    function custom_api_batch_trash_posts( $request ) { $post_ids = $request->get_param( 'post_ids' ); if ( empty( $post_ids ) || ! is_array( $post_ids ) ) { return new WP_Error( 'invalid_payload', 'Se requiere un array de IDs de entradas.', ['status' => 400] ); } $results = [ 'success' => [], 'failed' => [] ]; foreach ( $post_ids as $post_id ) { $id = absint($post_id); if ( $id && current_user_can('delete_post', $id) && function_exists('wp_trash_post') ) { $translations = function_exists('pll_get_post_translations') ? pll_get_post_translations($id) : [$id]; foreach($translations as $trans_id) { if(is_numeric($trans_id)) { if (wp_trash_post(absint($trans_id))) { if(!in_array($id, $results['success'])) $results['success'][] = $id; } else { $results['failed'][] = ['id' => $id, 'reason' => 'Fallo en wp_trash_post para la traducción ' . $trans_id]; } } } } else { $results['failed'][] = ['id' => $id, 'reason' => 'Permiso denegado o ID inválido.']; } } return new WP_REST_Response( ['success' => true, 'data' => $results], 200 ); }
    function custom_api_batch_update_status( $request ) { $post_ids = $request->get_param( 'post_ids' ); $status = $request->get_param('status'); if ( empty( $post_ids ) || ! is_array( $post_ids ) || !in_array($status, ['publish', 'draft', 'pending', 'private'])) { return new WP_Error( 'invalid_payload', 'Se requiere un array de IDs y un estado válido.', ['status' => 400] ); } $results = [ 'success' => [], 'failed' => [] ]; foreach ( $post_ids as $post_id ) { $id = absint($post_id); if ( $id && current_user_can('edit_post', $id) ) { $translations = function_exists('pll_get_post_translations') ? pll_get_post_translations($id) : [$id]; foreach($translations as $trans_id) { if(is_numeric($trans_id)) { $updated_post = wp_update_post(['ID' => absint($trans_id), 'post_status' => $status], true); if (is_wp_error($updated_post)) { $results['failed'][] = ['id' => $id, 'reason' => $updated_post->get_error_message()]; } else { if(!in_array($id, $results['success'])) $results['success'][] = $id; } } } } else { $results['failed'][] = ['id' => $id, 'reason' => 'Permiso denegado o ID inválido.']; } } return new WP_REST_Response( ['success' => true, 'data' => $results], 200 ); }
    function custom_api_batch_clone_posts( $request ) { $post_ids = $request->get_param( 'post_ids' ); $target_lang = sanitize_key( $request->get_param( 'target_lang' ) ); if ( empty( $post_ids ) || ! is_array( $post_ids ) ) { return new WP_Error( 'invalid_payload', 'Se requiere un array de IDs de posts.', [ 'status' => 400 ] ); } if ( ! $target_lang || !function_exists('pll_set_post_language') ) { return new WP_Error( 'no_target_lang', 'Debes indicar el idioma destino y Polylang debe estar activo.', [ 'status' => 400 ] ); } $results = [ 'success' => [], 'failed' => [] ]; foreach ( $post_ids as $source_id ) { $source_id = absint( $source_id ); if ( ! $source_id || ! current_user_can( 'edit_post', $source_id ) ) { $results['failed'][] = ['id' => $source_id, 'reason' => 'Permiso denegado o ID inválido.']; continue; } $source_post = get_post( $source_id ); if ( ! $source_post ) { $results['failed'][] = ['id' => $source_id, 'reason' => 'Post no encontrado.']; continue; } $original_lang = pll_get_post_language( $source_id, 'slug' ); if ( ! $original_lang || $original_lang === $target_lang ) { $results['failed'][] = ['id' => $source_id, 'reason' => 'Idioma inválido o ya coincide.']; continue; } $new_post_args = [ 'post_author' => $source_post->post_author, 'post_content' => $source_post->post_content, 'post_title' => $source_post->post_title, 'post_excerpt' => $source_post->post_excerpt, 'post_status' => 'draft', 'post_type' => $source_post->post_type ]; $new_post_id = wp_insert_post( wp_slash( $new_post_args ), true ); if ( is_wp_error( $new_post_id ) ) { $results['failed'][] = ['id' => $source_id, 'reason' => 'Error al clonar.']; continue; } $meta_blacklist = [ '_edit_lock', '_edit_last', '_thumbnail_id', '_pll_content_id', '_post_translations', ]; $source_meta = get_post_meta( $source_id ); foreach ( $source_meta as $meta_key => $meta_values ) { if ( in_array( $meta_key, $meta_blacklist ) ) { continue; } foreach ( $meta_values as $meta_value ) { add_post_meta( $new_post_id, $meta_key, maybe_unserialize( $meta_value ) ); } } $taxonomies = get_object_taxonomies( $source_post->post_type ); foreach ( $taxonomies as $taxonomy ) { if ($taxonomy == 'language' || $taxonomy == 'post_translations') continue; $terms = wp_get_object_terms( $source_id, $taxonomy, [ 'fields' => 'ids' ] ); if ( ! is_wp_error( $terms ) ) { wp_set_object_terms( $new_post_id, $terms, $taxonomy ); } } $thumbnail_id = get_post_thumbnail_id( $source_id ); if ( $thumbnail_id ) { set_post_thumbnail( $new_post_id, $thumbnail_id ); } pll_set_post_language( $new_post_id, $target_lang ); $existing_translations = pll_get_post_translations( $source_id ); $new_translations = array_merge($existing_translations, [$target_lang => $new_post_id]); pll_save_post_translations( $new_translations ); $results['success'][] = [ 'original_id' => $source_id, 'clone_id' => $new_post_id, 'post_type' => $source_post->post_type ]; } return new WP_REST_Response( $results, 200 ); }
    function custom_api_get_content_list($request) { $page = $request->get_param('page') ? absint($request->get_param('page')) : 1; $per_page = $request->get_param('per_page') ? absint($request->get_param('per_page')) : 20; $post_types_to_query = ['post', 'page']; $post_args = [ 'post_type' => $post_types_to_query, 'posts_per_page' => $per_page, 'paged' => $page, 'post_status' => ['publish', 'draft', 'pending', 'private', 'future', 'trash'], 'lang' => '', ]; $post_query = new WP_Query($post_args); $taxonomies_to_query = ['category']; $all_terms = []; if (taxonomy_exists('category')) { $terms = get_terms(['taxonomy' => 'category', 'hide_empty' => false]); if (!is_wp_error($terms)) { $all_terms = array_merge($all_terms, $terms); } } $all_front_page_ids = []; $front_page_id = get_option('page_on_front'); if ($front_page_id) { $all_front_page_ids[] = (int)$front_page_id; if (function_exists('pll_get_post_translations')) { $translations = pll_get_post_translations($front_page_id); if (is_array($translations)) { $all_front_page_ids = array_merge($all_front_page_ids, array_values($translations)); } } $all_front_page_ids = array_unique(array_map('intval', $all_front_page_ids)); } $content_list = []; if ($post_query->have_posts()) { foreach ($post_query->posts as $post_obj) { $type_slug = get_post_type($post_obj->ID); $type_label = $type_slug === 'page' ? 'Page' : 'Post'; $is_front = in_array($post_obj->ID, $all_front_page_ids); $content_list[] = [ 'id' => $post_obj->ID, 'title' => $post_obj->post_title, 'slug' => $post_obj->post_name, 'type' => $type_label, 'link' => get_permalink($post_obj->ID), 'status' => $post_obj->post_status, 'parent' => $post_obj->post_parent, 'lang' => function_exists('pll_get_post_language') ? pll_get_post_language($post_obj->ID, 'slug') : null, 'translations' => function_exists('pll_get_post_translations') ? pll_get_post_translations($post_obj->ID) : [], 'modified' => $post_obj->post_modified, 'is_front_page' => $is_front, ]; } } foreach ($all_terms as $term) { $content_list[] = [ 'id' => $term->term_id, 'title' => $term->name, 'slug' => $term->slug, 'type' => 'Categoría de Entradas', 'link' => get_term_link($term), 'status' => 'publish', 'parent' => $term->parent, 'lang' => function_exists('pll_get_term_language') ? pll_get_term_language($term->term_id, 'slug') : null, 'translations' => function_exists('pll_get_term_translations') ? pll_get_term_translations($term->term_id) : [], 'modified' => current_time('mysql'), 'is_front_page' => false, ]; } $response = new WP_REST_Response(['content' => $content_list], 200); $response->header('X-WP-Total', $post_query->found_posts); $response->header('X-WP-TotalPages', $post_query->max_num_pages); return $response; }
    function custom_api_regenerate_elementor_css( $request ) { $post_id = $request->get_param('id'); $id = absint($post_id); if ( !$id || !class_exists( 'Elementor\\Plugin' ) ) { return new WP_Error( 'invalid_request', 'ID de post inválido o Elementor no está activo.', ['status' => 400] ); } try { \Elementor\Plugin::$instance->files_manager->clear_cache(); return new WP_REST_Response( ['success' => true, 'message' => "Caché de CSS de Elementor limpiada para el post {$id}."], 200 ); } catch ( Exception $e ) { return new WP_Error( 'regeneration_failed', 'Fallo al regenerar el CSS: ' . $e->getMessage(), ['status' => 500] ); } }
    function custom_api_get_all_menus() { $menus = get_terms('nav_menu', array('hide_empty' => false)); $formatted_menus = array(); if ($menus && !is_wp_error($menus)) { foreach ($menus as $menu) { $formatted_menus[] = array('id' => $menu->term_id, 'name' => $menu->name, 'slug' => $menu->slug); } } return new WP_REST_Response($formatted_menus, 200); }
    function custom_api_clone_menu(WP_REST_Request $request) { $menu_id = $request->get_param('menu_id'); $target_lang = $request->get_param('target_lang'); if ( !function_exists('pll_get_post') ) { return new WP_Error('polylang_not_found', 'Polylang no está activo o no se encuentra.', ['status' => 501]); } $original_menu = wp_get_nav_menu_object($menu_id); if (!$original_menu) { return new WP_Error('menu_not_found', 'El menú original no se pudo encontrar.', ['status' => 404]); } $items_originales = wp_get_nav_menu_items($original_menu->term_id); $nuevo_nombre = $original_menu->name . " ($target_lang)"; $existing_menu = wp_get_nav_menu_object($nuevo_nombre); if ($existing_menu) { return new WP_Error('menu_exists', 'Ya existe un menú con este nombre para el idioma de destino.', ['status' => 409]); } $nuevo_menu_id = wp_create_nav_menu($nuevo_nombre); pll_set_term_language($nuevo_menu_id, $target_lang); if (!$items_originales) { return new WP_REST_Response(['success' => true, 'message' => 'El menú original no tiene elementos, se ha creado un menú vacío para el nuevo idioma.'], 200); } $mapa_ids = []; foreach ($items_originales as $item) { $nuevo_object_id = null; if ($item->type === 'post_type' || $item->type === 'post_type_archive') { $nuevo_object_id = pll_get_post($item->object_id, $target_lang); } elseif ($item->type === 'taxonomy') { $nuevo_object_id = pll_get_term($item->object_id, $target_lang); } elseif ($item->type === 'custom') { $nuevo_item_id = wp_update_nav_menu_item($nuevo_menu_id, 0, ['menu-item-title' => $item->title, 'menu-item-url' => $item->url, 'menu-item-type' => 'custom', 'menu-item-parent-id' => isset($mapa_ids[$item->menu_item_parent]) ? $mapa_ids[$item->menu_item_parent] : 0, 'menu-item-status' => 'publish']); $mapa_ids[$item->ID] = $nuevo_item_id; continue; } if (!$nuevo_object_id) continue; $nuevo_item_id = wp_update_nav_menu_item($nuevo_menu_id, 0, ['menu-item-title' => $item->title, 'menu-item-object' => $item->object, 'menu-item-object-id' => $nuevo_object_id, 'menu-item-type' => $item->type, 'menu-item-parent-id' => isset($mapa_ids[$item->menu_item_parent]) ? $mapa_ids[$item->menu_item_parent] : 0, 'menu-item-status' => 'publish',]); $mapa_ids[$item->ID] = $nuevo_item_id; } return new WP_REST_Response(['success' => true, 'message' => "Menú clonado y traducido con éxito a '{$target_lang}'."], 200); }
    function custom_api_get_or_create_category(WP_REST_Request $request) { $path_string = $request->get_param('path'); $lang_slug = $request->get_param('lang'); $taxonomy = 'product_cat'; if (empty($path_string)) { return new WP_Error('invalid_path', 'Se requiere una ruta de categoría.', ['status' => 400]); } $path_parts = array_map('trim', explode('>', $path_string)); $parent_id = 0; $term_id = null; foreach ($path_parts as $part) { $args = [ 'taxonomy' => $taxonomy, 'name' => $part, 'parent' => $parent_id, 'hide_empty' => false, 'fields' => 'ids', ]; if (function_exists('pll_get_language') && $lang_slug) { $args['lang'] = $lang_slug; } $existing_terms = get_terms($args); if (!empty($existing_terms) && !is_wp_error($existing_terms)) { $term_id = $existing_terms[0]; } else { $new_term_result = wp_insert_term($part, $taxonomy, ['parent' => $parent_id]); if (is_wp_error($new_term_result)) { if ($new_term_result->get_error_code() === 'term_exists') { $term_id = $new_term_result->get_error_data('term_exists')['term_id']; } else { return new WP_Error('term_creation_failed', 'No se pudo crear la categoría: ' . $new_term_result->get_error_message(), ['status' => 500]); } } else { $term_id = $new_term_result['term_id']; } if (function_exists('pll_set_term_language') && $lang_slug) { pll_set_term_language($term_id, $lang_slug); } } $parent_id = $term_id; } if ($term_id) { return new WP_REST_Response(['success' => true, 'term_id' => $term_id], 200); } else { return new WP_Error('final_term_not_found', 'No se pudo resolver la categoría final.', ['status' => 500]); } }
    function custom_api_update_variation_images(WP_REST_Request $request) { $variation_images = $request->get_param('variation_images'); if (empty($variation_images) || !is_array($variation_images)) { return new WP_Error('invalid_payload', 'Se requiere un array de "variation_images".', ['status' => 400]); } $results = ['success' => [], 'failed' => []]; foreach ($variation_images as $item) { $variation_id = isset($item['variation_id']) ? absint($item['variation_id']) : 0; $image_id = isset($item['image_id']) ? absint($item['image_id']) : null; if (!$variation_id) { $results['failed'][] = ['id' => 'unknown', 'reason' => 'ID de variación inválido.']; continue; } if (!current_user_can('edit_post', $variation_id)) { $results['failed'][] = ['id' => $variation_id, 'reason' => 'Permiso denegado.']; continue; } if ($image_id) { update_post_meta($variation_id, '_thumbnail_id', $image_id); } else { delete_post_meta($variation_id, '_thumbnail_id'); } $results['success'][] = $variation_id; } return new WP_REST_Response(['success' => true, 'data' => $results], 200); }
}
?>
    