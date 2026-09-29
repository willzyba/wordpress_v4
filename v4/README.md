# WordPress EqnEditor plugin

Adds the CodeCogs equation editor to the WordPress Classic Editor's TinyMCE toolbar - an "fx"
button that opens the same dialog as `tinymce/v4/plugins/eqneditor`: toolbar and maths view on
top, then a bottom bar with the *Inline* and *LaTeX markup* toggles on the left and *Insert as*
(MathML or SVG image) on the right, above the dialog's Cancel/Ok. Double-clicking an existing
equation (image or MathML) reopens the dialog with its LaTeX.

`index.php` also hooks `wp_kses_allowed_html` so MathML (and the image's
`referrerpolicy="origin"`) survive saving for users without `unfiltered_html`; without it
WordPress strips `<math>` from Authors' and Contributors' posts.

`index.php` and `editor_plugin.js` were rewritten from scratch against WordPress 7.1 (current
latest, confirmed via `docker pull wordpress:latest`), which still bundles TinyMCE 4.9.11 -
confirmed by grepping the pulled image (`wp-includes/js/tinymce/tinymce.min.js`), so this plugin
targets the same TinyMCE 4 API as `tinymce/v4/plugins/eqneditor` in this repo (and is close to it
in structure - see that adapter's README for anything not specific to WordPress). The previous
version (see CHANGES below) loaded `eqneditor.api.min.js`/`eqneditor_1.css` from paths that don't
exist any more and had no maths view at all.

## Verification

The 4.1 redesign (dialog layout, MathML insert, kses filter) was checked in a TinyMCE 4
harness loading `editor_plugin.js` against the local dev server - toolbar icons match the
reference editor exactly, SVG and MathML inserts and double-click editing work - and the kses
filter with the PHP CLI and stubbed WordPress functions. It has not yet been clicked through
on a live WordPress install; the notes below are from the 4.0 rewrite.

### Verified against a real WordPress 7.1 install (4.0)

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
production by setting these globals before TinyMCE initialises (`window.eqneditorServer`,
`eqneditorRenderUrl` and `eqneditorLicence` are also read) (e.g. from an `admin_head` hook
in a must-use plugin - see this exact pattern used for verification, removed before committing):

```php
add_action( 'admin_head', function () {
	echo '<script>window.eqneditorScriptUrl="http://localhost:8010/eqneditor.api.min.js";'
		. 'window.eqneditorCssUrl="http://localhost:8010/eqneditor.css";'
		. 'window.eqneditorMathmlCssUrl="http://localhost:8010/fxtex.css";</script>';
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
