<?php
/*
Plugin Name: AutoPress AI Helper
Description: Añade endpoints a la REST API para gestionar traducciones y otras funciones personalizadas para AutoPress AI.
Version: 1.69
Author: intelvisual@intelvisual.es
Requires at least: 5.8
Requires PHP: 7.4
*/

if (!defined('ABSPATH')) exit;

class AutoPress_AI_Helper {

    public function __construct() {
        add_action('plugins_loaded', [$this, 'initialize_plugin'], 100);
    }

    public function initialize_plugin() {
        add_action('rest_api_init', [$this, 'register_routes'], 100);
        add_action('admin_menu', [$this, 'add_admin_menu']);
    }

    public function add_admin_menu() {
        add_menu_page(
            'AutoPress AI',
            'AutoPress AI',
            'manage_options',
            'autopress-ai-settings',
            [$this, 'create_settings_page'],
            'dashicons-superhero',
            81
        );
    }

    public function create_settings_page() {
        // Check user capabilities
        if (!current_user_can('manage_options')) {
            return;
        }

        // Handle form submission
        if (isset($_POST['autopress_secret_key_nonce']) && wp_verify_nonce($_POST['autopress_secret_key_nonce'], 'autopress_save_secret_key')) {
            $secret_key = sanitize_text_field($_POST['autopress_secret_key']);
            update_option('autopress_ai_secret_key', $secret_key);
            echo '<div class="notice notice-success is-dismissible"><p>Clave secreta guardada con éxito.</p></div>';
        }
        
        $current_key = get_option('autopress_ai_secret_key', '');
        ?>
        <div class="wrap">
            <h1><?php echo esc_html(get_admin_page_title()); ?></h1>
            <p>Configuración para el plugin de ayuda de AutoPress AI.</p>
            <form method="post" action="">
                <?php wp_nonce_field('autopress_save_secret_key', 'autopress_secret_key_nonce'); ?>
                <table class="form-table" role="presentation">
                    <tbody>
                        <tr>
                            <th scope="row">
                                <label for="autopress_secret_key">Clave Secreta del Plugin</label>
                            </th>
                            <td>
                                <input type="password" id="autopress_secret_key" name="autopress_secret_key" value="<?php echo esc_attr($current_key); ?>" class="regular-text" />
                                <p class="description">
                                    Introduce aquí la misma clave secreta que has configurado en los Ajustes de Conexión de la aplicación AutoPress AI. Esta clave se usa como método de autenticación alternativo.
                                </p>
                            </td>
                        </tr>
                    </tbody>
                </table>
                <?php submit_button('Guardar Clave Secreta'); ?>
            </form>
        </div>
        <?php
    }


    public function register_routes() {
        register_rest_route('custom/v1', '/status', [
            'methods' => 'GET',
            'callback' => [$this, 'status_check'],
            'permission_callback' => '__return_true'
        ]);

        register_rest_route('custom/v1', '/get-languages', [
            'methods' => 'GET',
            'callback' => [$this, 'get_polylang_languages'],
            'permission_callback' => [$this, 'permission_check_v2']
        ]);
        
        register_rest_route('custom/v1', '/link-translations', [
            'methods' => 'POST',
            'callback' => [$this, 'custom_api_link_translations'],
            'permission_callback' => [$this, 'permission_check_v2']
        ]);

        register_rest_route('custom/v1', '/trash-post/(?P<id>\d+)', [
            'methods' => 'POST',
            'callback' => [$this, 'custom_api_trash_single_post'],
            'permission_callback' => [$this, 'permission_check_v2']
        ]);

        register_rest_route('custom/v1', '/batch-trash-posts', [
            'methods' => 'POST',
            'callback' => [$this, 'custom_api_batch_trash_posts'],
            'permission_callback' => [$this, 'permission_check_v2']
        ]);

        register_rest_route('custom/v1', '/batch-update-status', [
            'methods' => 'POST',
            'callback' => [$this, 'custom_api_batch_update_status'],
            'permission_callback' => [$this, 'permission_check_v2']
        ]);
        
        register_rest_route('custom/v1', '/regenerate-css/(?P<id>\d+)', [
            'methods' => 'POST',
            'callback' => [$this, 'custom_api_regenerate_elementor_css'],
            'permission_callback' => [$this, 'permission_check_v2']
        ]);

        register_rest_route('custom/v1', '/menus', [
            'methods' => 'GET',
            'callback' => [$this, 'custom_api_get_all_menus'],
            'permission_callback' => [$this, 'permission_check_v2']
        ]);

        register_rest_route('custom/v1', '/clone-menu', [
            'methods' => 'POST',
            'callback' => [$this, 'custom_api_clone_menu'],
            'permission_callback' => [$this, 'permission_check_v2']
        ]);

        register_rest_route('custom-api/v1', '/update-product-images', [
            'methods' => 'POST',
            'callback' => [$this, 'custom_api_update_product_images'],
            'permission_callback' => [$this, 'permission_check_v2']
        ]);
    }

    public function permission_check_v2(WP_REST_Request $request) {
        // Priority 1: Check for the custom secret key header
        $secret_key_header = $request->get_header('X-Autopress-Secret');
        if ($secret_key_header) {
            $saved_secret = get_option('autopress_ai_secret_key');
            if ($saved_secret && hash_equals($saved_secret, $secret_key_header)) {
                return true;
            }
            // If secret key is provided but doesn't match, fail immediately for security.
             return new WP_Error('invalid_secret_key', 'La clave secreta del plugin no es correcta.', ['status' => 403]);
        }

        // Priority 2: Fallback to the nonce check for backward compatibility
        $nonce = $request->get_header('X-WP-Nonce');
        if (!$nonce) {
            return new WP_Error('no_nonce', 'Falta el encabezado de nonce.', ['status' => 401]);
        }
        if (!wp_verify_nonce($nonce, 'wp_rest')) {
            return new WP_Error('invalid_nonce', 'Nonce inválido o expirado.', ['status' => 403]);
        }
        if (!current_user_can('edit_posts')) {
            return new WP_Error('insufficient_permissions', 'Usuario sin permisos para editar entradas.', ['status' => 403]);
        }

        return true;
    }
    
    private function get_plugin_version() {
        if (!function_exists('get_plugin_data')) { require_once ABSPATH . 'wp-admin/includes/plugin.php'; }
        return get_plugin_data(__FILE__)['Version'];
    }

    public function status_check() {
        include_once ABSPATH . 'wp-admin/includes/plugin.php';
        $is_polylang_active = function_exists('pll_languages_list');
        return new WP_REST_Response([
            'status' => 'ok',
            'plugin_version' => $this->get_plugin_version(),
            'verified' => true,
            'message' => 'Plugin activo y verificado.',
            'woocommerce_active' => class_exists('WooCommerce'),
            'polylang_active' => $is_polylang_active,
        ], 200);
    }

    public function get_polylang_languages() {
        if (!function_exists('pll_languages_list')) {
            return new WP_Error('polylang_not_found', 'La función pll_languages_list no existe. Asegúrate de que Polylang está activo.', ['status' => 501]);
        }
        $language_slugs = pll_languages_list(['hide_empty' => false]);
        if (!is_array($language_slugs) || empty($language_slugs)) { return new WP_REST_Response([], 200); }
        $formatted_languages = [];
        foreach ($language_slugs as $slug) {
            $details = pll_get_language($slug);
            if ($details && is_object($details)) {
                $formatted_languages[] = [ 'code' => $details->slug, 'name' => $details->name, 'is_rtl' => (bool)$details->is_rtl ];
            }
        }
        return new WP_REST_Response($formatted_languages, 200);
    }
    
    public function custom_api_link_translations(WP_REST_Request $request) { if (!function_exists('pll_save_post_translations')) { return new WP_Error('polylang_not_found', 'Polylang no está activo.', ['status' => 501]); } $translations = $request->get_param('translations'); if (empty($translations) || !is_array($translations)) { return new WP_Error('invalid_payload', 'Se requiere un array asociativo de traducciones.', ['status' => 400]); } $sanitized = []; foreach ($translations as $lang => $post_id) { $sanitized[sanitize_key($lang)] = absint($post_id); } pll_save_post_translations($sanitized); return new WP_REST_Response(['success' => true, 'message' => 'Traducciones enlazadas.'], 200); }
    public function custom_api_trash_single_post(WP_REST_Request $request) { $post_id = $request->get_param('id'); $id = absint($post_id); if (!$id || !current_user_can('delete_post', $id)) { return new WP_Error('permission_denied', 'No tienes permiso para eliminar este post.', ['status' => 403]); } if (wp_trash_post($id)) { return new WP_REST_Response(['success' => true, 'message' => "Post {$id} movido a la papelera."], 200); } return new WP_Error('trash_failed', "No se pudo mover el post {$id} a la papelera.", ['status' => 500]); }
    public function custom_api_batch_trash_posts(WP_REST_Request $request) { $post_ids = $request->get_param('post_ids'); if (empty($post_ids) || !is_array($post_ids)) { return new WP_Error('invalid_payload', 'Se requiere un array de IDs de entradas.', ['status' => 400]); } $results = ['success' => [], 'failed' => []]; foreach ($post_ids as $post_id) { $id = absint($post_id); if ($id && current_user_can('delete_post', $id) && function_exists('wp_trash_post')) { if (wp_trash_post($id)) { $results['success'][] = $id; } else { $results['failed'][] = ['id' => $id, 'reason' => 'Fallo en wp_trash_post']; } } else { $results['failed'][] = ['id' => $id, 'reason' => 'Permiso denegado o ID inválido.']; } } return new WP_REST_Response(['success' => true, 'data' => $results], 200); }
    public function custom_api_regenerate_elementor_css(WP_REST_Request $request) { if (class_exists('Elementor\Plugin')) { \Elementor\Plugin::$instance->files_manager->clear_cache(); } return new WP_REST_Response(['success' => true, 'message' => "Caché de CSS de Elementor limpiada."], 200); }
    public function custom_api_get_all_menus() { $menus = wp_get_nav_menus(); $formatted_menus = []; if ($menus && !is_wp_error($menus)) { foreach ($menus as $menu) { $formatted_menus[] = ['id' => $menu->term_id, 'name' => $menu->name, 'slug' => $menu->slug]; } } return new WP_REST_Response($formatted_menus, 200); }
    public function custom_api_clone_menu(WP_REST_Request $request) { $menu_id = $request->get_param('menu_id'); $target_lang_slug = $request->get_param('target_lang'); if (!function_exists('pll_get_post')) { return new WP_Error('polylang_not_found', 'Polylang no está activo.', ['status' => 501]); } $original_menu = wp_get_nav_menu_object($menu_id); if (!$original_menu) { return new WP_Error('menu_not_found', 'Menú original no encontrado.', ['status' => 404]); } $new_menu_name = $original_menu->name . " ($target_lang_slug)"; if (wp_get_nav_menu_object($new_menu_name)) { return new WP_Error('menu_exists', 'Ya existe un menú con este nombre para el idioma de destino.', ['status' => 409]); } $new_menu_id = wp_create_nav_menu($new_menu_name); if (function_exists('pll_set_term_language')) { pll_set_term_language($new_menu_id, $target_lang_slug); } $original_items = wp_get_nav_menu_items($menu_id); if (empty($original_items)) { return new WP_REST_Response(['success' => true, 'message' => 'Menú clonado (vacío).'], 200); } $id_map = []; foreach ($original_items as $item) { $new_item_data = ['menu-item-type' => $item->type, 'menu-item-status' => 'publish', 'menu-item-parent-id' => isset($id_map[$item->menu_item_parent]) ? $id_map[$item->menu_item_parent] : 0, 'menu-item-title' => $item->title]; if ($item->type === 'post_type' || $item->type === 'post_type_archive') { $translated_id = pll_get_post($item->object_id, $target_lang_slug); if ($translated_id) { $new_item_data['menu-item-object-id'] = $translated_id; $new_item_data['menu-item-object'] = $item->object; } else { continue; } } elseif ($item->type === 'taxonomy') { $translated_id = pll_get_term($item->object_id, $target_lang_slug); if ($translated_id) { $new_item_data['menu-item-object-id'] = $translated_id; $new_item_data['menu-item-object'] = $item->object; } else { continue; } } else { $new_item_data['menu-item-url'] = $item->url; } $new_item_id = wp_update_nav_menu_item($new_menu_id, 0, $new_item_data); if (is_numeric($new_item_id)) { $id_map[$item->ID] = $new_item_id; } } return new WP_REST_Response(['success' => true, 'message' => "Menú clonado y traducido con éxito a '{$target_lang_slug}'."], 200); }
    public function custom_api_update_product_images(WP_REST_Request $request) { $product_id = intval($request->get_param('product_id')); $mode = sanitize_text_field($request->get_param('mode')); $image_urls = $request->get_param('images'); if (!$product_id) { return new WP_Error('no_id', 'Falta el ID del producto', ['status' => 400]); } $product = wc_get_product($product_id); if (!$product) { return new WP_Error('not_found', 'Producto no encontrado', ['status' => 404]); } $current_ids = $product->get_gallery_image_ids(); if ($product->get_image_id()) { array_unshift($current_ids, $product->get_image_id()); } $new_ids = []; if (is_array($image_urls)) { foreach ($image_urls as $img) { if (is_numeric($img)) { $new_ids[] = intval($img); } elseif (filter_var($img, FILTER_VALIDATE_URL)) { $id = $this->sideload_image($img, $product_id); if (is_numeric($id)) $new_ids[] = $id; } } } $final_ids = []; if ($mode === 'replace') { $final_ids = $new_ids; } elseif ($mode === 'add') { $final_ids = array_unique(array_merge($current_ids, $new_ids)); } elseif ($mode === 'remove') { $final_ids = array_diff($current_ids, $new_ids); } elseif ($mode === 'clear') { $final_ids = []; } else { $final_ids = $new_ids; } $main_id = array_shift($final_ids); $product->set_image_id($main_id ?: 0); $product->set_gallery_image_ids($final_ids); $product->save(); return new WP_REST_Response(['status' => 'success', 'product_id' => $product_id, 'images' => $product->get_gallery_image_ids()], 200); }
    private function sideload_image($file_url, $post_id) { if (!function_exists('media_handle_sideload')) { require_once ABSPATH . 'wp-admin/includes/file.php'; require_once ABSPATH . 'wp-admin/includes/media.php'; require_once ABSPATH . 'wp-admin/includes/image.php'; } $tmp = download_url($file_url, 15); if (is_wp_error($tmp)) { error_log('[AUTOPRESS AI DEBUG] Sideload Error (download_url): ' . $tmp->get_error_message()); return $tmp; } $file_array = ['name' => basename(wp_parse_url($file_url, PHP_URL_PATH)), 'tmp_name' => $tmp]; $id = media_handle_sideload($file_array, $post_id); if (is_wp_error($id)) { @unlink($file_array['tmp_name']); error_log('[AUTOPRESS AI DEBUG] Sideload Error (media_handle_sideload): ' . $id->get_error_message()); } return $id; }
    public function custom_api_batch_update_status(WP_REST_Request $request) { $post_ids = $request->get_param('post_ids'); $status = $request->get_param('status'); if (empty($post_ids) || !is_array($post_ids) || !in_array($status, ['publish', 'draft', 'pending', 'private'])) { return new WP_Error('invalid_payload', 'Se requiere un array de IDs y un estado válido.', ['status' => 400]); } $results = ['success' => [], 'failed' => []]; foreach ($post_ids as $post_id) { $id = absint($post_id); if ($id && current_user_can('edit_post', $id)) { $post_data = ['ID' => $id, 'post_status' => $status]; $result = wp_update_post($post_data, true); if (is_wp_error($result)) { $results['failed'][] = ['id' => $id, 'reason' => $result->get_error_message()]; } else { $results['success'][] = $id; } } else { $results['failed'][] = ['id' => $id, 'reason' => 'Permiso denegado o ID inválido.']; } } return new WP_REST_Response(['success' => true, 'data' => $results], 200); }
}

// Initialize the plugin
new AutoPress_AI_Helper();
