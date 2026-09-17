<?php
/*
Plugin Name: CodeCogs Equation Editor
Plugin URI: https://www.codecogs.com/
Description: Adds the CodeCogs equation editor to the WordPress Classic Editor's TinyMCE toolbar.
Author: CodeCogs
Version: 4.0
Author URI: https://www.codecogs.com/
*/

// This plugin's own JS (editor_plugin.js) registers a TinyMCE plugin/button - it only runs
// inside TinyMCE, so it's only useful where a TinyMCE instance exists. That's the Classic
// Editor (either the "Classic Editor" plugin's post-editing screen, or the block editor's own
// "Classic" paragraph block) - both load external mce plugins through the same
// mce_external_plugins/mce_buttons filters this hooks into.
function eqneditor_register_tinymce_plugin() {
	if ( ! current_user_can( 'edit_posts' ) && ! current_user_can( 'edit_pages' ) ) {
		return;
	}

	add_filter( 'mce_external_plugins', function ( $plugins ) {
		$plugins['eqneditor'] = plugins_url( 'editor_plugin.js', __FILE__ );
		return $plugins;
	} );

	add_filter( 'mce_buttons', function ( $buttons ) {
		$buttons[] = 'eqneditor';
		return $buttons;
	} );
}

add_action( 'init', 'eqneditor_register_tinymce_plugin' );
