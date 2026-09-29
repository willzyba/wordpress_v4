=== CodeCogs Equation Editor ===
Contributors: CodeCogs
Donate link: https://www.codecogs.com/
Tags: latex, equation, math, TinyMCE, classic editor
Requires at least: 5.0
Tested up to: 7.1
Stable tag: 4.1
License: GPLv2 or later

Adds the CodeCogs WYSIWYG LaTeX equation editor to the WordPress Classic Editor's TinyMCE toolbar.

== Description ==

A TinyMCE plugin that makes writing equations fast: a maths view you can type or click symbols
into, with visual confirmation of the evolving equation, plus a toggle to work directly in LaTeX
markup instead.

The plugin adds an "fx" button to the Classic Editor's TinyMCE toolbar. Clicking it opens a
dialog containing the equation editor; click "Ok" to insert the equation into the post. An
inserted equation can be double-clicked to reopen the dialog and adjust it.

Requires the Classic Editor (either the official Classic Editor plugin, or a Classic block in
the block editor) - `mce_external_plugins` only reaches an actual TinyMCE instance, which the
block editor's own blocks don't provide.

== Installation ==

1. Upload to the `/wp-content/plugins/` directory (or upload the zip via Plugins → Add New →
   Upload Plugin).
2. Activate the plugin through the 'Plugins' menu in WordPress.
3. If the block editor is active, install and activate the official Classic Editor plugin.
4. Find the "fx" button on the Classic Editor's toolbar.

== Frequently Asked Questions ==

= The fx button doesn't appear =

The block editor has no TinyMCE instance for this plugin to attach to - install the Classic
Editor plugin (or use a Classic block).

== Screenshots ==

1. This screen shot description corresponds to screenshot-1.(png|jpg|jpeg|gif). Note that the screenshot is taken from
the directory of the stable readme.txt, so in this case, `/tags/4.3/screenshot-1.png` (or jpg, jpeg, gif)
2. This is the second screen shot

== Changelog ==

= 4.1 =
* The dialog is now maths-view only, like CodeCogs' other editor plugins: LaTeX markup and
  Inline are toggles in a bottom bar, and "Insert as" chooses MathML or an SVG image.
* MathML equations and the image's referrerpolicy now survive saving for Authors and
  Contributors (added to WordPress's allowed post HTML).

= 4.0 =
* Rewritten against the current EqEditor API (editor.codecogs.com) and WordPress 7.1/TinyMCE
  4.9.11 - the previous version's eqneditor.api.min.js/eqneditor_1.css paths no longer exist,
  which broke every equation insert.
* Added a maths view (shown by default) alongside the existing LaTeX markup view, with a toggle
  between them remembered across dialog opens.

= 1.0.3 =
* fix the tinymce button
  add a way to only copy LaTex code to work with plugins like QuickLatex, see Installation.

= 1.0.2 =
* fix a conflict with another tinymce button.

= 1.0.1 =
* fix the directory error.

= 2.0.0 =
* first offical version from the CodeCogs team
