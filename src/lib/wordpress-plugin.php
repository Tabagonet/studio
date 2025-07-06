<?php
/*
Plugin Name: AutoPress AI Helper
Description: Añade endpoints a la REST API para gestionar traducciones, stock y otras funciones personalizadas para AutoPress AI.
Version: 1.17
Author: intelvisual@intelvisual.es
*/

if ( ! defined( 'ABSPATH' ) ) exit;

// === Admin Menu and Settings Page ===
add_action('admin_menu', 'autopress_ai_add_admin_menu');
add_action('wp_ajax_autopress_ai_verify_key', 'autopress_ai_ajax_verify_key');

function autopress_ai_add_admin_menu() {
    // Changed capability from 'manage_options' to 'edit_posts' to allow more roles.
    add_options_page('AutoPress AI Helper', 'AutoPress AI', 'edit_posts', 'autopress-ai', 'autopress_ai_options_page');
}

function autopress_ai_options_page() {
    ?>
    <div class="wrap">
        <h1><?php echo esc_html(get_admin_page_title()); ?></h1>
        <div id="autopress-notice" class="notice" style="display:none; margin-top: 1rem;"></div>
        <form id="autopress-ai-form">
            <?php wp_nonce_field('autopress_ai_verify_nonce', 'autopress_ai_nonce'); ?>
            <table class="form-table">
                <tbody>
                    <tr>
                        <th scope="row">
                            <label for="autopress_ai_api_key_field"><?php _e('API Key', 'autopress-ai'); ?></label>
                        </th>
                        <td>
                            <input type="password" name="autopress_ai_api_key" id="autopress_ai_api_key_field" value="<?php echo esc_attr(get_option('autopress_ai_api_key')); ?>" class="regular-text">
                            <p class="description"><?php _e('Copia y pega la API Key desde la página de Ajustes de tu cuenta en AutoPress AI.', 'autopress-ai'); ?></p>
                        </td>
                    </tr>
                     <tr>
                        <th scope="row"><?php _e('Estado de la Conexión', 'autopress-ai'); ?></th>
                        <td>
                            <?php 
                            $is_active = get_option('autopress_ai_is_active') === 'true';
                            if ($is_active) {
                                echo '<span style="color: #22c55e; font-weight: bold;">✔ Activo</span>';
                            } else {
                                echo '<span style="color: #ef4444; font-weight: bold;">✖ Inactivo</span><p class="description">Guarda una API Key válida para activar el plugin.</p>';
                            }
                            ?>
                        </td>
                    </tr>
                </tbody>
            </table>
            <?php submit_button('Guardar y Verificar Clave'); ?>
        </form>
    </div>
    <script type="text/javascript">
        jQuery(document).ready(function($) {
            $('#autopress-ai-form').on('submit', function(e) {
                e.preventDefault();
                var apiKey = $('#autopress_ai_api_key_field').val();
                var nonce = $('#autopress_ai_nonce').val();
                var noticeEl = $('#autopress-notice');
                var submitButton = $(this).find('input[type="submit"]');
                var originalButtonText = submitButton.val();

                submitButton.val('Verificando...').prop('disabled', true);
                noticeEl.hide();

                $.post(ajaxurl, {
                    action: 'autopress_ai_verify_key',
                    api_key: apiKey,
                    nonce: nonce
                }, function(response) {
                    if (response.success) {
                        noticeEl.removeClass('notice-error').addClass('notice-success is-dismissible').html('<p>' + response.data.message + '</p>').show();
                        setTimeout(function(){ location.reload(); }, 1500);
                    } else {
                        noticeEl.removeClass('notice-success').addClass('notice-error is-dismissible').html('<p>' + response.data.message + '</p>').show();
                    }
                }).fail(function(jqXHR) {
                    var errorMessage = 'Error de comunicación con el servidor. Revisa la consola del navegador.';
                    if (jqXHR.responseJSON && jqXHR.responseJSON.data && jqXHR.responseJSON.data.message) {
                        errorMessage = jqXHR.responseJSON.data.message;
                    }
                     noticeEl.removeClass('notice-success').addClass('notice-error is-dismissible').html('<p>' + errorMessage + '</p>').show();
                }).always(function() {
                    submitButton.val(originalButtonText).prop('disabled', false);
                });
            });
        });
    </script>
    <?php
}

function autopress_ai_ajax_verify_key() {
    if (!check_ajax_referer('autopress_ai_verify_nonce', 'nonce', false)) {
        wp_send_json_error(['message' => 'Fallo de seguridad.'], 403);
        return;
    }
    // Changed capability from 'manage_options' to 'edit_posts' to allow more roles.
    if (!current_user_can('edit_posts')) {
        wp_send_json_error(['message' => 'No tienes permisos.'], 403);
        return;
    }
    
    $api_key = isset($_POST['api_key']) ? sanitize_text_field($_POST['api_key']) : '';

    if (empty($api_key)) {
        update_option('autopress_ai_api_key', '');
        update_option('autopress_ai_is_active', 'false');
        wp_send_json_error(['message' => 'La API Key no puede estar vacía.'], 400);
        return;
    }
    
    // The application URL is now hardcoded as it is in a production environment
    $verify_url_base = 'https://autopress.intelvisual.es/api/license/verify-plugin';
    $args = array(
        'apiKey'  => $api_key,
        'siteUrl' => get_site_url(),
    );
    $verify_url = add_query_arg($args, $verify_url_base);

    $response = wp_remote_get($verify_url, [ 'timeout'   => 20, ]);

    if (is_wp_error($response)) {
        wp_send_json_error(['message' => 'Error de red al conectar con el servidor de AutoPress AI: ' . $response->get_error_message()], 500);
        return;
    }

    $response_code = wp_remote_retrieve_response_code($response);
    $body = wp_remote_retrieve_body($response);
    $data = json_decode($body, true);

    if ($data === null) {
        wp_send_json_error(['message' => 'Respuesta inesperada del servidor de AutoPress AI. No es un JSON válido. Código: ' . $response_code . ' Cuerpo: ' . esc_html($body)], 500);
        return;
    }
    
    if (isset($data['status']) && $data['status'] === 'active') {
        update_option('autopress_ai_api_key', $api_key);
        update_option('autopress_ai_is_active', 'true');
        wp_send_json_success(['message' => '¡Verificación exitosa! El plugin está activo.']);
    } else {
        update_option('autopress_ai_is_active', 'false');
        $error_message = isset($data['message']) ? $data['message'] : 'La API Key no es válida o la cuenta no tiene permisos para este sitio.';
        wp_send_json_error(['message' => 'Verificación fallida: ' . $error_message], 400);
    }
}


// === REST API Endpoints ===
if (get_option('autopress_ai_is_active') === 'true') {
    add_action('init', 'custom_api_register_yoast_meta_fields');
    add_action('plugins_loaded', 'autopress_ai_register_rest_endpoints');
}

function custom_api_register_yoast_meta_fields() {
    $post_types = get_post_types( [ 'public' => true ], 'names' );
    $yoast_meta_keys = ['_yoast_wpseo_title', '_yoast_wpseo_metadesc', '_yoast_wpseo_focuskw'];
    foreach ( $post_types as $post_type ) {
        foreach ( $yoast_meta_keys as $meta_key ) {
            register_post_meta( $post_type, $meta_key, ['show_in_rest' => true, 'single' => true, 'type' => 'string', 'auth_callback' => function() { return current_user_can( 'edit_posts' ); }]);
        }
    }
}

function autopress_ai_register_rest_endpoints() {
    if ( ! function_exists( 'pll_get_post_language' ) ) return;

    add_filter( 'rest_post_query', 'pll_rest_filter_by_language', 10, 2 );
    add_filter( 'rest_page_query', 'pll_rest_filter_by_language', 10, 2 );

    function pll_rest_filter_by_language( $args, $request ) { $lang = $request->get_param( 'lang' ); if ( $lang && function_exists( 'pll_get_language' ) ) { $lang_obj = pll_get_language( $lang ); if ( $lang_obj ) { $args['lang'] = $lang; } } return $args; }

    add_action( 'rest_api_init', function () {
        $post_types = get_post_types( [ 'public' => true ], 'names' );
        foreach ( $post_types as $type ) {
            register_rest_field( $type, 'lang', ['get_callback' => function ($p) { return pll_get_post_language($p['id'], 'slug'); }, 'schema' => null,] );
            register_rest_field( $type, 'translations', ['get_callback' => function ($p) { return pll_get_post_translations($p['id']); }, 'schema' => null,] );
        }
        register_rest_route( 'custom/v1', '/link-translations', ['methods' => 'POST', 'callback' => 'custom_api_link_translations', 'permission_callback' => function () { return current_user_can( 'edit_posts' ); }]);
        register_rest_route( 'custom/v1', '/batch-trash-posts', ['methods' => 'POST', 'callback' => 'custom_api_batch_trash_posts', 'permission_callback' => function () { return current_user_can( 'edit_posts' ); }]);
        register_rest_route( 'custom/v1', '/batch-clone-posts', ['methods'  => 'POST', 'callback' => 'custom_api_batch_clone_posts', 'permission_callback' => function () { return current_user_can( 'edit_posts' ); }]);
        register_rest_route( 'custom/v1', '/content-list', ['methods'  => 'GET', 'callback' => 'custom_api_get_content_list', 'permission_callback' => function () { return current_user_can( 'edit_posts' ); }]);
    });

    function custom_api_link_translations( $request ) { if ( ! function_exists( 'pll_save_post_translations' ) ) { return new WP_Error( 'polylang_not_found', 'Polylang no está activo.', [ 'status' => 501 ] ); } $translations = $request->get_param( 'translations' ); if ( empty( $translations ) || ! is_array( $translations ) ) { return new WP_Error( 'invalid_payload', 'Se requiere un array asociativo de traducciones.', [ 'status' => 400 ] ); } $sanitized = []; foreach ( $translations as $lang => $post_id ) { $sanitized[ sanitize_key( $lang ) ] = absint( $post_id ); } pll_save_post_translations( $sanitized ); return new WP_REST_Response( ['success' => true, 'message' => 'Traducciones enlazadas.'], 200 ); }
    function custom_api_batch_trash_posts( $request ) { $post_ids = $request->get_param( 'post_ids' ); if ( empty( $post_ids ) || ! is_array( $post_ids ) ) { return new WP_Error( 'invalid_payload', 'Se requiere un array de IDs de entradas.', ['status' => 400] ); } $results = [ 'success' => [], 'failed' => [] ]; foreach ( $post_ids as $post_id ) { $id = absint($post_id); if ( $id && current_user_can('delete_post', $id) && function_exists('wp_trash_post') ) { if ( wp_trash_post( $id ) ) { $results['success'][] = $id; } else { $results['failed'][] = ['id' => $id, 'reason' => 'Fallo en wp_trash_post.']; } } else { $results['failed'][] = ['id' => $id, 'reason' => 'Permiso denegado o ID inválido.']; } } return new WP_REST_Response( ['success' => true, 'data' => $results], 200 ); }
    function custom_api_batch_clone_posts( $request ) { $post_ids = $request->get_param( 'post_ids' ); $target_lang = sanitize_key( $request->get_param( 'target_lang' ) ); if ( empty( $post_ids ) || ! is_array( $post_ids ) ) { return new WP_Error( 'invalid_payload', 'Se requiere un array de IDs de posts.', [ 'status' => 400 ] ); } if ( ! $target_lang ) { return new WP_Error( 'no_target_lang', 'Debes indicar el idioma destino.', [ 'status' => 400 ] ); } $results = [ 'success' => [], 'failed' => [] ]; foreach ( $post_ids as $source_id ) { $source_id = absint( $source_id ); if ( ! $source_id || ! current_user_can( 'edit_post', $source_id ) ) { $results['failed'][] = ['id' => $source_id, 'reason' => 'Permiso denegado o ID inválido.']; continue; } $source_post = get_post( $source_id ); if ( ! $source_post ) { $results['failed'][] = ['id' => $source_id, 'reason' => 'Post no encontrado.']; continue; } $original_lang = pll_get_post_language( $source_id, 'slug' ); if ( ! $original_lang || $original_lang === $target_lang ) { $results['failed'][] = ['id' => $source_id, 'reason' => 'Idioma inválido o ya coincide.']; continue; } $new_post_args = [ 'post_author' => $source_post->post_author, 'post_content' => $source_post->post_content, 'post_title' => $source_post->post_title, 'post_excerpt' => $source_post->post_excerpt, 'post_status' => 'draft', 'post_type' => $source_post->post_type ]; $new_post_id = wp_insert_post( wp_slash( $new_post_args ), true ); if ( is_wp_error( $new_post_id ) ) { $results['failed'][] = ['id' => $source_id, 'reason' => 'Error al clonar.']; continue; } $meta_blacklist = [ '_edit_lock', '_edit_last', '_thumbnail_id', '_pll_content_id', '_post_translations', ]; $source_meta = get_post_meta( $source_id ); foreach ( $source_meta as $meta_key => $meta_values ) { if ( in_array( $meta_key, $meta_blacklist ) ) { continue; } foreach ( $meta_values as $meta_value ) { add_post_meta( $new_post_id, $meta_key, maybe_unserialize( $meta_value ) ); } } $taxonomies = get_object_taxonomies( $source_post->post_type ); foreach ( $taxonomies as $taxonomy ) { if ($taxonomy == 'language' || $taxonomy == 'post_translations') continue; $terms = wp_get_object_terms( $source_id, $taxonomy, [ 'fields' => 'ids' ] ); if ( ! is_wp_error( $terms ) ) { wp_set_object_terms( $new_post_id, $terms, $taxonomy ); } } $thumbnail_id = get_post_thumbnail_id( $source_id ); if ( $thumbnail_id ) { set_post_thumbnail( $new_post_id, $thumbnail_id ); } pll_set_post_language( $new_post_id, $target_lang ); $existing_translations = pll_get_post_translations( $source_id ); $new_translations = array_merge($existing_translations, [$target_lang => $new_post_id]); pll_save_post_translations( $new_translations ); $results['success'][] = [ 'original_id' => $source_id, 'clone_id' => $new_post_id, 'post_type' => $source_post->post_type ]; } return new WP_REST_Response( $results, 200 ); }
    function custom_api_get_content_list($request) { 
        $post_types = get_post_types(['public' => true], 'names');
        // Exclude specific post types that are not standard content
        unset($post_types['elementor_library']);
        unset($post_types['e-landing-page']);

        $args = [ 
            'post_type' => array_values($post_types), // Ensure it's a non-associative array
            'posts_per_page' => -1, 
            'post_status' => ['publish', 'draft', 'pending', 'private', 'future'], 
            'fields' => 'ids', 
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
}
