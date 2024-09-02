<?php
/**
 * Plugin Name: Codecogs Equation Editor
 * Plugin URI: http://editor.codecogs.com
 * Description: Adds the Codecogs WYSIWYG LaTex equation popup editor to Wordpress TinyMCE editor.
 * Author: CodeCogs
 * Version: 2
*/

if (!defined('ABSPATH')) {
    exit; // Exit if accessed directly
}


function cc_add_eqneditor($plugin_array)
{
    $plugin_array['cc_eqneditor'] = plugin_dir_url( __FILE__ ).'eqneditor.js';
    return $plugin_array;
}


function cc_add_eqneditor_button($buttons)
{
    array_push($buttons, "cc_eqneditor");
    return $buttons;
}


function cc_setup_eqneditor_plugin($hook) {

    // Check if the logged in WordPress User can edit Posts or Pages
    // If not, don't register our TinyMCE plugin
      
    /*   
    if ( ! current_user_can( 'edit_posts' ) && ! current_user_can( 'edit_pages' ) ) {
       return;
    }
     
    // Check if the logged in WordPress User has the Visual Editor enabled
    // If not, don't register our TinyMCE plugin
    if ( get_user_option( 'rich_editing' ) !== 'true' ) {
        return;
    }
    */

    // Only load in post editor
    if ('post.php' != $hook && 'post-new.php' != $hook) {
        return;
    }

    add_filter('mce_external_plugins', "cc_add_eqneditor");
    add_filter('mce_buttons', 'cc_add_eqneditor_button');
}

add_action('admin_enqueue_scripts', 'cc_setup_eqneditor_plugin');



