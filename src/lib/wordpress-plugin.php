<?php
/*
Plugin Name: AutoPress AI Helper
Description: Añade endpoints a la REST API para gestionar traducciones, stock y otras funciones personalizadas para AutoPress AI.
Version: 1.63
Author: intelvisual@intelvisual.es
Requires at least: 5.8
Requires PHP: 7.4
*/

if ( ! defined( 'ABSPATH' ) ) exit;

// == HELPERS ==

function autopress_ai_get_plugin_version() {
    if (!function_exists('get_plugin_data')) {
        require_once(ABSPATH . 'wp-admin/includes/plugin.php');
    }
    $plugin_data = get_plugin_data(__FILE__);
    return $plugin_data['Version'];
}

function autopress_ai_permission_check() {
    // This is the standard permission check for application passwords.
    // It ensures that only authenticated requests from a user with editing capabilities can proceed.
    if ( ! current_user_can( 'edit_posts' ) ) {
        error_log('[AUTOPRESS AI DEBUG] Permission check failed for user.');
        return false;
    }
    return true;
}

function custom_media_sideload_image($file_url, $post_id) {
    if (!function_exists('media_handle_sideload')) { require_once ABSPATH . 'wp-admin/includes/file.php'; require_once ABSPATH . 'wp-admin/includes/media.php'; require_once ABSPATH . 'wp-admin/includes/image.php'; }
    $tmp = download_url($file_url, 15);
    if (is_wp_error($tmp)) { error_log('[AUTOPRESS AI DEBUG] Sideload Error (download_url): ' . $tmp->get_error_message()); return $tmp; }
    $file_array = ['name' => basename(wp_parse_url($file_url, PHP_URL_PATH)), 'tmp_name' => $tmp];
    $id = media_handle_sideload($file_array, $post_id);
    if (is_wp_error($id)) { @unlink($file_array['tmp_name']); error_log('[AUTOPRESS AI DEBUG] Sideload Error (media_handle_sideload): ' . $id->get_error_message()); }
    return $id;
}

// == API CALLBACK FUNCTIONS ==

function custom_api_status_check($request) {
    error_log('[AUTOPRESS AI DEBUG] Endpoint /status hit.');
    return new WP_REST_Response([
        'status' => 'ok',
        'plugin_version' => autopress_ai_get_plugin_version(),
        'verified' => true,
        'message' => 'Plugin activo y verificado.',
        'woocommerce_active' => class_exists('WooCommerce'),
        'polylang_active' => function_exists('pll_get_post_language'),
        'front_page_id' => (int) get_option('page_on_front', 0),
    ], 200);
}

function custom_api_get_polylang_languages() {
    error_log('[AUTOPRESS AI DEBUG] Endpoint /get-languages hit.');
    
    $pll_list_exists = function_exists('pll_languages_list');
    $pll_get_exists = function_exists('pll_get_language');
    
    error_log('[AUTOPRESS AI DEBUG] Checking for Polylang functions...');
    error_log('[AUTOPRESS AI DEBUG] function_exists("pll_languages_list"): ' . ($pll_list_exists ? 'true' : 'false'));
    error_log('[AUTOPRESS AI DEBUG] function_exists("pll_get_language"): ' . ($pll_get_exists ? 'true' : 'false'));

    if (!$pll_list_exists || !$pll_get_exists) {
        error_log('[AUTOPRESS AI DEBUG] One or more Polylang functions do not exist. Returning error.');
        return new WP_Error('polylang_not_found', 'Polylang no está activo o sus funciones no están disponibles en el hook rest_api_init.', ['status' => 501]);
    }
    
    $language_slugs = pll_languages_list();
    error_log('[AUTOPRESS AI DEBUG] pll_languages_list() returned: ' . print_r($language_slugs, true));
    
    if (empty($language_slugs)) {
        error_log('[AUTOPRESS AI DEBUG] No languages found in Polylang. Returning empty array.');
        return new WP_REST_Response([], 200);
    }

    $formatted_languages = [];
    foreach ($language_slugs as $slug) {
        $details = pll_get_language($slug);
        if ($details) {
            $formatted_languages[] = [
                'code' => $details->slug,
                'name' => $details->name,
                'is_rtl' => (bool)$details->is_rtl,
            ];
        } else {
             error_log('[AUTOPRESS AI DEBUG] pll_get_language() returned null for slug: ' . $slug);
        }
    }
    
    error_log('[AUTOPRESS AI DEBUG] Final formatted languages being sent: ' . print_r($formatted_languages, true));
    return new WP_REST_Response($formatted_languages, 200);
}


function custom_api_link_translations( $request ) { 
    if ( ! function_exists( 'pll_save_post_translations' ) ) { 
        return new WP_Error( 'polylang_not_found', 'Polylang no está activo.', [ 'status' => 501 ] ); 
    } 
    $translations = $request->get_param( 'translations' ); 
    if ( empty( $translations ) || ! is_array( $translations ) ) { 
        return new WP_Error( 'invalid_payload', 'Se requiere un array asociativo de traducciones.', [ 'status' => 400 ] ); 
    } 
    $sanitized = []; 
    foreach ( $translations as $lang => $post_id ) { 
        $sanitized[ sanitize_key( $lang ) ] = absint( $post_id ); 
    } 
    pll_save_post_translations( $sanitized ); 
    return new WP_REST_Response( ['success' => true, 'message' => 'Traducciones enlazadas.'], 200 ); 
}

function custom_api_trash_single_post($request) {
    $post_id = $request->get_param('id');
    $id = absint($post_id);
    if (!$id) {
        return new WP_Error('invalid_id', 'ID de post inválido.', ['status' => 400]);
    }
    if (!current_user_can('delete_post', $id)) {
        return new WP_Error('permission_denied', 'No tienes permiso para eliminar este post.', ['status' => 403]);
    }
    if (wp_trash_post($id)) {
        return new WP_REST_Response(['success' => true, 'message' => "Post {$id} movido a la papelera."], 200);
    } else {
        return new WP_Error('trash_failed', "No se pudo mover el post {$id} a la papelera.", ['status' => 500]);
    }
}

function custom_api_batch_trash_posts( $request ) { 
    $post_ids = $request->get_param( 'post_ids' ); 
    if ( empty( $post_ids ) || ! is_array( $post_ids ) ) { 
        return new WP_Error( 'invalid_payload', 'Se requiere un array de IDs de entradas.', ['status' => 400] ); 
    } 
    $results = [ 'success' => [], 'failed' => [] ]; 
    foreach ( $post_ids as $post_id ) { 
        $id = absint($post_id); 
        if ( $id && current_user_can('delete_post', $id) && function_exists('wp_trash_post') ) { 
            $translations = function_exists('pll_get_post_translations') ? pll_get_post_translations($id) : [$id]; 
            foreach($translations as $trans_id) { 
                if(is_numeric($trans_id)) { 
                    if (wp_trash_post(absint($trans_id))) { 
                        if(!in_array($id, $results['success'])) $results['success'][] = $id; 
                    } else { 
                        $results['failed'][] = ['id' => $id, 'reason' => 'Fallo en wp_trash_post para la traducción ' . $trans_id]; 
                    } 
                } 
            } 
        } else { 
            $results['failed'][] = ['id' => $id, 'reason' => 'Permiso denegado o ID inválido.']; 
        } 
    } 
    return new WP_REST_Response( ['success' => true, 'data' => $results], 200 ); 
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

function custom_api_get_all_menus() {
    $menus = get_terms('nav_menu', ['hide_empty' => false]);
    $formatted_menus = [];
    if ($menus && !is_wp_error($menus)) {
        foreach ($menus as $menu) {
            $formatted_menus[] = ['id' => $menu->term_id, 'name' => $menu->name, 'slug' => $menu->slug];
        }
    }
    return new WP_REST_Response($formatted_menus, 200);
}

function custom_api_clone_menu(WP_REST_Request $request) {
    $menu_id = $request->get_param('menu_id');
    $target_lang_slug = $request->get_param('target_lang');
    if (!function_exists('pll_get_post')) {
        return new WP_Error('polylang_not_found', 'Polylang no está activo.', ['status' => 501]);
    }
    $original_menu = wp_get_nav_menu_object($menu_id);
    if (!$original_menu) {
        return new WP_Error('menu_not_found', 'Menú original no encontrado.', ['status' => 404]);
    }
    $new_menu_name = $original_menu->name . " ($target_lang_slug)";
    if (wp_get_nav_menu_object($new_menu_name)) {
        return new WP_Error('menu_exists', 'Ya existe un menú con este nombre para el idioma de destino.', ['status' => 409]);
    }
    $new_menu_id = wp_create_nav_menu($new_menu_name);
    if (function_exists('pll_set_term_language')) {
        pll_set_term_language($new_menu_id, $target_lang_slug);
    }
    $original_items = wp_get_nav_menu_items($menu_id);
    if (empty($original_items)) {
        return new WP_REST_Response(['success' => true, 'message' => 'Menú clonado (vacío).'], 200);
    }
    $id_map = [];
    foreach ($original_items as $item) {
        $new_item_data = ['menu-item-type' => $item->type, 'menu-item-status' => 'publish', 'menu-item-parent-id' => isset($id_map[$item->menu_item_parent]) ? $id_map[$item->menu_item_parent] : 0, 'menu-item-title' => $item->title];
        if ($item->type === 'post_type' || $item->type === 'post_type_archive') {
            $translated_id = pll_get_post($item->object_id, $target_lang_slug);
            if ($translated_id) {
                $new_item_data['menu-item-object-id'] = $translated_id;
                $new_item_data['menu-item-object'] = $item->object;
            } else {
                continue;
            }
        } elseif ($item->type === 'taxonomy') {
            $translated_id = pll_get_term($item->object_id, $target_lang_slug);
            if ($translated_id) {
                $new_item_data['menu-item-object-id'] = $translated_id;
                $new_item_data['menu-item-object'] = $item->object;
            } else {
                continue;
            }
        } else {
            $new_item_data['menu-item-url'] = $item->url;
        }
        $new_item_id = wp_update_nav_menu_item($new_menu_id, 0, $new_item_data);
        if (is_numeric($new_item_id)) {
            $id_map[$item->ID] = $new_item_id;
        }
    }
    return new WP_REST_Response(['success' => true, 'message' => "Menú clonado y traducido con éxito a '{$target_lang_slug}'."], 200);
}

function custom_api_update_product_images(WP_REST_Request $request) {
    $product_id = intval($request->get_param('product_id')); $mode = sanitize_text_field($request->get_param('mode')); $image_urls = $request->get_param('images'); if (!$product_id) { return new WP_Error('no_id', 'Falta el ID del producto', ['status' => 400]); } $product = wc_get_product($product_id); if (!$product) { return new WP_Error('not_found', 'Producto no encontrado', ['status' => 404]); } $current_ids = $product->get_gallery_image_ids(); if ($product->get_image_id()) { array_unshift($current_ids, $product->get_image_id()); } $new_ids = []; if (is_array($image_urls)) { foreach ($image_urls as $img) { if (is_numeric($img)) { $new_ids[] = intval($img); } else if (filter_var($img, FILTER_VALIDATE_URL)) { $id = custom_media_sideload_image($img, $product_id); if (is_numeric($id)) $new_ids[] = $id; } } } $final_ids = []; if ($mode === 'replace') { $final_ids = $new_ids; } else if ($mode === 'add') { $final_ids = array_unique(array_merge($current_ids, $new_ids)); } else if ($mode === 'remove') { $final_ids = array_diff($current_ids, $new_ids); } else if ($mode === 'clear') { $final_ids = []; } else { $final_ids = $new_ids; } $main_id = array_shift($final_ids); $product->set_image_id($main_id ?: 0); $product->set_gallery_image_ids($final_ids); $product->save(); return new WP_REST_Response(['status' => 'success', 'product_id' => $product_id, 'images' => $product->get_gallery_image_ids()], 200);
}


// Unify all registrations into a single function hooked to rest_api_init
function autopress_ai_register_rest_endpoints() {
    error_log('[AUTOPRESS AI DEBUG] rest_api_init hook fired. Registering endpoints...');
    // Register meta fields
    $post_types = get_post_types(['public' => true], 'names');
    foreach ($post_types as $type) {
        if (function_exists('pll_get_post_language')) {
            register_rest_field($type, 'lang', ['get_callback' => function ($p) { return pll_get_post_language($p['id'], 'slug'); }, 'schema' => null]);
            register_rest_field($type, 'translations', ['get_callback' => function ($p) { return pll_get_post_translations($p['id']); }, 'schema' => null]);
        }
    }
    $yoast_meta_keys = ['_yoast_wpseo_title', '_yoast_wpseo_metadesc', '_yoast_wpseo_focuskw'];
    foreach ($post_types as $post_type) {
        foreach ($yoast_meta_keys as $meta_key) {
            register_post_meta($post_type, $meta_key, ['show_in_rest' => true, 'single' => true, 'type' => 'string', 'auth_callback' => 'autopress_ai_permission_check']);
        }
    }

    // Register custom routes
    register_rest_route('custom/v1', '/status', ['methods' => 'GET', 'callback' => 'custom_api_status_check', 'permission_callback' => '__return_true']);
    register_rest_route('custom/v1', '/get-languages', ['methods' => 'GET', 'callback' => 'custom_api_get_polylang_languages', 'permission_callback' => 'autopress_ai_permission_check']);
    register_rest_route('custom/v1', '/link-translations', ['methods' => 'POST', 'callback' => 'custom_api_link_translations', 'permission_callback' => 'autopress_ai_permission_check']);
    register_rest_route('custom/v1', '/trash-post/(?P<id>\d+)', ['methods' => 'POST', 'callback' => 'custom_api_trash_single_post', 'permission_callback' => 'autopress_ai_permission_check']);
    register_rest_route('custom/v1', '/batch-trash-posts', ['methods' => 'POST', 'callback' => 'custom_api_batch_trash_posts', 'permission_callback' => 'autopress_ai_permission_check']);
    register_rest_route('custom/v1', '/regenerate-css/(?P<id>\d+)', ['methods' => 'POST', 'callback' => 'custom_api_regenerate_elementor_css', 'permission_callback' => 'autopress_ai_permission_check']);
    register_rest_route('custom/v1', '/menus', ['methods' => 'GET', 'callback' => 'custom_api_get_all_menus', 'permission_callback' => 'autopress_ai_permission_check']);
    register_rest_route('custom/v1', '/clone-menu', ['methods' => 'POST', 'callback' => 'custom_api_clone_menu', 'permission_callback' => 'autopress_ai_permission_check']);
    register_rest_route('custom-api/v1', '/update-product-images', ['methods' => 'POST', 'callback' => 'custom_api_update_product_images', 'permission_callback' => 'autopress_ai_permission_check']);
    error_log('[AUTOPRESS AI DEBUG] All endpoints registered.');
}

// Hook the main registration function to the correct action
add_action('rest_api_init', 'autopress_ai_register_rest_endpoints');

// Add filters for Polylang language parameter
add_filter('rest_post_query', function($args, $request) { $lang = $request->get_param('lang'); if ($lang && function_exists('pll_get_language')) { $args['lang'] = $lang; } return $args; }, 10, 2);
add_filter('rest_page_query', function($args, $request) { $lang = $request->get_param('lang'); if ($lang && function_exists('pll_get_language')) { $args['lang'] = $lang; } return $args; }, 10, 2);
add_filter('rest_product_query', function($args, $request) { $lang = $request->get_param('lang'); if ($lang && function_exists('pll_get_language')) { $args['lang'] = $lang; } return $args; }, 10, 2);

// Add filter for checking product image existence
add_action('woocommerce_rest_product_query', function($args, $request) { 
    $has_image = $request->get_param('has_image');
    if ($has_image !== null) {
        $args['meta_query'][] = array(
            'key' => '_thumbnail_id',
            'compare' => ($has_image === '1' || $has_image === 'yes') ? 'EXISTS' : 'NOT EXISTS',
        );
    }
    return $args;
}, 10, 2);

?>
