<?php
/*
Plugin Name: CodeCogs Equation Editor
Plugin URI: https://www.codecogs.com/
Description: Adds the CodeCogs equation editor to the WordPress Classic Editor's TinyMCE toolbar.
Author: CodeCogs
Version: 4.1
Author URI: https://www.codecogs.com/
License: GPLv2 or later
License URI: https://www.gnu.org/licenses/old-licenses/gpl-2.0.html
*/

// Copyright (c) 2026 CodeCogs, Zyba Ltd. Released under the GNU General Public License, version 2
// or later - see LICENSE in the repository root.

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

// "Insert as MathML" puts <math> into the post, and the image insert sets referrerpolicy so
// the rendering service can see which site is asking. Users without unfiltered_html (Authors,
// Contributors) have their content passed through kses on save, which drops any tag or
// attribute it doesn't know - so both need adding to what it allows in post content.
function eqneditor_allow_mathml( $tags, $context ) {
	if ( 'post' !== $context ) {
		return $tags;
	}

	$attributes = array_fill_keys( array(
		'class', 'id', 'title', 'dir', 'xmlns', 'display', 'alttext', 'role', 'aria-label', 'aria-hidden', 'data-*',
		'mathvariant', 'mathcolor', 'mathbackground', 'mathsize', 'displaystyle', 'scriptlevel',
		'accent', 'accentunder', 'fence', 'form', 'largeop', 'lspace', 'rspace', 'maxsize', 'minsize',
		'movablelimits', 'separator', 'stretchy', 'symmetric', 'linethickness', 'numalign', 'denomalign',
		'width', 'height', 'depth', 'voffset', 'notation', 'encoding', 'definitionurl', 'lquote', 'rquote',
		'align', 'columnalign', 'rowalign', 'columnlines', 'rowlines', 'columnspacing', 'rowspacing',
		'columnspan', 'rowspan', 'frame', 'framespacing', 'equalrows', 'equalcolumns', 'actiontype', 'selection',
	), true );

	foreach ( array(
		'math', 'semantics', 'annotation', 'annotation-xml', 'mrow', 'mi', 'mo', 'mn', 'ms', 'mtext',
		'mspace', 'mglyph', 'mfrac', 'msqrt', 'mroot', 'mstyle', 'merror', 'mpadded', 'mphantom',
		'menclose', 'msub', 'msup', 'msubsup', 'munder', 'mover', 'munderover', 'mmultiscripts',
		'mprescripts', 'none', 'mtable', 'mtr', 'mtd', 'mlabeledtr', 'maction',
	) as $element ) {
		$tags[ $element ] = $attributes;
	}

	if ( isset( $tags['img'] ) ) {
		$tags['img']['referrerpolicy'] = true;
	}

	return $tags;
}

add_filter( 'wp_kses_allowed_html', 'eqneditor_allow_mathml', 10, 2 );
