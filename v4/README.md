# WordPress EqnEditor plugin

Adds the CodeCogs equation editor to the WordPress Classic Editor's TinyMCE toolbar - an "fx"
button that opens a dialog embedding the shared EqEditor UI (maths view by default, with a
toggle to LaTeX markup) every adapter in `eqneditor-v5-plugins` uses. Double-clicking an
existing equation image reopens the dialog with its LaTeX decoded back out of the image's src.

`index.php` and `editor_plugin.js` were rewritten from scratch against WordPress 7.1 (current
latest, confirmed via `docker pull wordpress:latest`), which still bundles TinyMCE 4.9.11 -
confirmed by grepping the pulled image (`wp-includes/js/tinymce/tinymce.min.js`), so this plugin
targets the same TinyMCE 4 API as `tinymce/v4/plugins/eqneditor` in this repo (and is close to it
in structure - see that adapter's README for anything not specific to WordPress). The previous
version (see CHANGES below) loaded `eqneditor.api.min.js`/`eqneditor_1.css` from paths that don't
exist any more and had no maths view at all.

## Verified against a real WordPress 7.1 install

Via `docker-compose.yml` in this folder (`docker compose up`, then `http://localhost:8081`) plus
the official Classic Editor plugin (WordPress 7.1 defaults to the block editor, which has no
TinyMCE instance for `mce_external_plugins` to attach to):

- Plugin installs and activates cleanly; the toolbar button and dialog appear as expected.
- The maths-view/LaTeX-markup toggle correctly replaces one view with the other in both
  directions, equations render live, Insert adds the `<img>` at the cursor, and double-clicking
  an inserted equation reopens the dialog with its LaTeX decoded back out.

**One thing this surfaced that's worth knowing:** `editor.codecogs.com` (this plugin's, and
every other adapter's, default host) is currently serving an older `eqneditor.api.min.js`/
`eqneditor.css` that predates `EqEditor.MathView` and the `CCEqnEditor`/`CCMathViewHost`/
`CCLatexInput` class names entirely - only the `eqneditor-v5-www` dev server has the current
bundle. Against production as configured by default, this plugin falls back to LaTeX-only
markup (the code already handles a missing `EqEditor.MathView` this way), and
`injectStyleOverridesOnce()` in `editor_plugin.js` supplies the maths-view/LaTeX-view toggle CSS
itself rather than assuming `eqneditor.css` will, since production's copy doesn't. This is a gap
in what's deployed at `editor.codecogs.com`, not something to fix in this plugin - flagging it
here since it affects every adapter in this repo that points at the default host, not just
WordPress.

For local development, point this plugin at a local `eqneditor-v5-www` dev server instead of
production by setting these globals before TinyMCE initialises (e.g. from an `admin_head` hook
in a must-use plugin - see this exact pattern used for verification, removed before committing):

```php
add_action( 'admin_head', function () {
	echo '<script>window.eqneditorScriptUrl="http://localhost:8010/eqneditor.api.min.js";'
		. 'window.eqneditorCssUrl="http://localhost:8010/eqneditor.css";</script>';
} );
```

## Installation

1. Upload the `v4` folder to `/wp-content/plugins/` (or upload `wordpress/v4.zip` via Plugins →
   Add New → Upload Plugin).
2. Activate **CodeCogs Equation Editor** under Plugins.
3. If the block editor is active, install and activate the official **Classic Editor** plugin
   (or use a Classic block) - `mce_external_plugins`/`mce_buttons` only reach an actual TinyMCE
   instance, which the block editor's own blocks don't provide.
4. Open a post; the **fx** button appears in the Classic Editor's toolbar.

See `readme.txt`'s Changelog section for the version history this rewrite replaces. (The older
`v1`/`v2`/client-fork versions this folder was originally reconstructed from have been removed -
superseded, not needed to develop against the current API.)
