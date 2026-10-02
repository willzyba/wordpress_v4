/*
 * CodeCogs Equation Editor plugin for WordPress's Classic Editor (TinyMCE 4).
 *
 * Adds an "fx" toolbar button and an Insert menu item that open the same maths-view-only dialog
 * as tinymce/v4 in this repo (LaTeX and Inline toggles bottom-left, "Insert as" and the dialog's
 * own Cancel/Ok bottom-right), loaded at runtime from editor.codecogs.com. WordPress has no
 * editor.getParam() config for an external plugin, so the host and URLs come from window
 * globals a wp-admin page can set before TinyMCE starts - see below, and the README for a local
 * dev setup. Double-clicking an existing equation (<img> or MathML) reopens it for editing.
 *
 * Registered as a TinyMCE external plugin by index.php, which also lets MathML through
 * WordPress's kses filter so an "Insert as MathML" equation survives saving.
 */
( function () {
	'use strict';

	var DEFAULT_HOST = 'fxtex.codecogs.com';
	var DEFAULT_RENDER_URL = 'https://latex.codecogs.com';

	// One script/CSS load per URL no matter how many TinyMCE instances are on the page (e.g.
	// quick-edit rows in the post list alongside the main editor).
	var scriptPromises = {};

	function loadScriptOnce( url ) {
		if ( scriptPromises[ url ] ) return scriptPromises[ url ];

		scriptPromises[ url ] = new Promise( function ( resolve, reject ) {
			if ( typeof window.EqEditor !== 'undefined' ) {
				resolve();
				return;
			}

			var existing = document.querySelector( 'script[src="' + url + '"]' );
			var script = existing || document.createElement( 'script' );

			script.addEventListener( 'load', function () { resolve(); } );
			script.addEventListener( 'error', function () {
				reject( new Error( 'CodeCogs Equation Editor: could not load ' + url ) );
			} );

			if ( !existing ) {
				script.src = url;
				document.head.appendChild( script );
			}
		} );

		return scriptPromises[ url ];
	}

	// EqEditor.init() switches the converter every TextArea/MathView/Toolbar construction takes
	// on to fxTeX Pro - skip it and they keep the placeholder converter for their whole
	// lifetime, even once eqneditor.api.min.js itself has loaded. Called once per page; an
	// empty licence is the normal, expected state until a real one is configured.
	var initPromise = null;

	function ensureInit( licence ) {
		if ( initPromise ) return initPromise;
		initPromise = ( typeof EqEditor.init === 'function' )
			? EqEditor.init( { licence: licence || '' } ).catch( function ( err ) {
				window.console && console.warn( 'fxTeX Pro: ' + ( err && err.message || err ) );
			} )
			: Promise.resolve();
		return initPromise;
	}

	// Presentation MathML, plus the three non-"m" elements the converter can emit.
	var MATHML_ELEMENTS = [
		'math', 'semantics', 'annotation', 'annotation-xml',
		'mrow', 'mi', 'mo', 'mn', 'ms', 'mtext', 'mspace', 'mglyph',
		'mfrac', 'msqrt', 'mroot', 'mstyle', 'merror', 'mpadded', 'mphantom', 'menclose',
		'msub', 'msup', 'msubsup', 'munder', 'mover', 'munderover',
		'mmultiscripts', 'mprescripts', 'none',
		'mtable', 'mtr', 'mtd', 'mlabeledtr', 'maction'
	];

	function decodeEquation( encoded ) {
		var latex = encoded;
		try {
			latex = decodeURIComponent( encoded );
		} catch ( e ) {
			// Not valid percent-encoding; still worth showing as it stands.
		}
		return latex.replace( /&space;/g, ' ' ).replace( /&plus;/g, '+' ).replace( /&hash;/g, '#' );
	}

	function escapeHtml( s ) {
		return String( s )
			.replace( /&/g, '&amp;' ).replace( /</g, '&lt;' )
			.replace( />/g, '&gt;' ).replace( /"/g, '&quot;' );
	}

	function isEquationSrc( src ) {
		return !!src && /(gif|svg|png)\.image\?/.test( src );
	}

	// Fixes for gaps in the shared eqneditor.css (loaded separately, asynchronously, from the
	// host configured below) this dialog needs but can't assume it will get: the old default host,
	// editor.codecogs.com (still configurable), serves an older stylesheet that predates the CCEqnEditor/
	// CCMathViewHost/CCLatexInput class names entirely (only a local dev mirror does not have
	// this gap). TinyMCE 4's dialog body also does not itself give arbitrary nested content a
	// height to lay out inside - without an explicit one on .CCEqnEditor, the maths view
	// collapsed to a few pixels tall rather than filling the dialog. Injected once, since it
	// would otherwise race eqneditor.css over which rule wins.
	// The API's own injected @font-face for "Latin Modern Math" only carries
	// local("Latin Modern Math") - no url() fallback - so it silently falls back to a generic
	// serif unless that exact font happens to be installed. A later @font-face for the same
	// family replaces the API's src list rather than merging with it, so redeclaring it here
	// with a real url() fixes every equation and symbol on the page, not just this dialog's.
	function injectStyleOverridesOnce( fontUrl ) {
		if ( document.getElementById( 'cc-eqneditor-style-overrides' ) ) return;
		var style = document.createElement( 'style' );
		style.id = 'cc-eqneditor-style-overrides';
		style.textContent =
			'@font-face { font-family: "Latin Modern Math"; font-display: swap; ' +
				'src: local("Latin Modern Math"), url("' + fontUrl.replace( /prototypes\/latinmodern-math\.otf$/, 'fonts/LatinModernMath-Regular.woff2' ) + '") format("woff2"), url("' + fontUrl + '") format("opentype"); }' +
			// Undo host resets (e.g. .cke_reset_all *) inside the toolbar icons and the maths view's MathML.
			'.CCToolbar svg:has(g[font-family]), .CCToolbar svg:has(g[font-family]) * { font: revert-layer !important; }' +
			// Icons drawn as <text>: the svg gets the API's own .cc_panel font (fxTeX Toolbar, 16px) back over host resets, and each <text> its own font-size attribute (revert-layer lets attributes win).
			'.CCToolbar svg:not(:has(g[font-family])) { font: normal normal 16px "fxTeX Toolbar" !important; }' +
			'.CCToolbar svg:not(:has(g[font-family])) * { font: revert-layer !important; }' +
			'.CCToolbar svg, .CCToolbar svg * { width: revert-layer !important; height: revert-layer !important; max-width: revert-layer !important; }' +
			'.CCToolbar svg g[font-family="fxTeX Toolbar"] { color: #000 !important; }' +
			'.CCMathView math, .CCMathView math * { font: revert-layer !important; ' +
				'width: revert-layer !important; height: revert-layer !important; padding: revert-layer !important; ' +
				'margin: revert-layer !important; text-transform: revert-layer !important; text-align: revert-layer !important; ' +
				'box-sizing: revert-layer !important; white-space: revert-layer !important; }' +
			apiMathRules() +
			'.CCEqnEditor { display: flex !important; flex-direction: column !important; ' +
				'height: 460px !important; }' +
			'.CCEqnEditor .CCEditorBar { flex: 0 0 auto; }' +
			// A flex column's children stretch to the container's full width by default - the
			// toolbar's own "fit" pass (EqEditor's Toolbar.link, run once at construction)
			// measures whatever width it is given and unwraps each button group into as many
			// columns as that width allows. Left stretched to the dialog's 850px, that is well
			// past the toolbar's natural width (~780px on the reference page, which is never
			// stretched) - so every group unwraps wider and flatter than it was designed to,
			// reading as sparse, undersized icons in a mostly empty row instead of the tighter
			// reference layout. flex-start plus width:auto (both needed - a flex-start item
			// with no width of its own still stretches otherwise) leaves it free to size to
			// its own fitted content instead.
			'.CCEqnEditor [id^="cc-eqn-wp4-toolbar-"] { align-self: flex-start; width: auto; }' +
			'.CCEqnEditor .CCMathViewHost { flex: 1 1 auto; min-height: 0; display: flex; ' +
				'align-items: center; justify-content: center; overflow: auto; }' +
			'.CCEqnEditor[data-inline="on"] .CCMathViewHost { justify-content: flex-start; }' +
			'.CCEqnEditor[data-latex="on"] .CCMathViewHost { display: none !important; }' +
			'.CCEqnEditor .CCLatexInput { flex: 1 1 auto; min-height: 0; overflow: auto; }' +
			'.CCEqnEditor[data-latex="off"] .CCLatexInput { display: none !important; }' +
			'.CCEqnEditor .CCEqnOutput-hidden { display: none !important; }' +
			// The bottom bar: toggles left, Insert-as and the dialog's buttons right, one type size. All !important - host dialog resets otherwise restyle it.
			'.cc-eqn-bar { display: flex !important; align-items: center !important; gap: 16px !important; flex: 0 0 auto !important; ' +
				'margin: 8px 0 0 !important; padding: 10px 0 0 !important; border: 0 !important; border-top: 1px solid #e2e8f0 !important; ' +
				'background: none !important; font: 13px/1.3 system-ui, -apple-system, "Segoe UI", Arial, sans-serif !important; color: #1c2530 !important; }' +
			'.cc-eqn-bar-right { display: flex !important; align-items: center !important; gap: 8px !important; margin: 0 0 0 auto !important; padding: 0 !important; font: inherit !important; color: inherit !important; }' +
			'.cc-eqn-bar .cc-switch { display: inline-flex !important; align-items: center !important; gap: 6px !important; margin: 0 !important; ' +
				'padding: 0 !important; font: inherit !important; color: #54647c !important; cursor: pointer !important; user-select: none !important; white-space: nowrap !important; }' +
			'.cc-eqn-bar .cc-switch input { position: absolute !important; width: 1px !important; height: 1px !important; margin: -1px !important; ' +
				'padding: 0 !important; border: 0 !important; overflow: hidden !important; clip: rect(0, 0, 0, 0) !important; opacity: 0 !important; }' +
			'.cc-eqn-bar .cc-switch-track { position: relative !important; display: inline-block !important; flex: 0 0 auto !important; width: 28px !important; ' +
				'height: 16px !important; margin: 0 !important; padding: 0 !important; border: 0 !important; border-radius: 8px !important; ' +
				'background: #ccc !important; transition: background .2s !important; }' +
			'.cc-eqn-bar .cc-switch-knob { position: absolute !important; display: block !important; top: 2px !important; left: 2px !important; ' +
				'width: 12px !important; height: 12px !important; margin: 0 !important; border-radius: 50% !important; background: #fff !important; transition: left .2s !important; }' +
			'.cc-eqn-bar .cc-switch input:checked + .cc-switch-track { background: #4caf50 !important; }' +
			'.cc-eqn-bar .cc-switch input:checked + .cc-switch-track .cc-switch-knob { left: 14px !important; }' +
			'.cc-eqn-bar .cc-switch input:focus-visible + .cc-switch-track { outline: 2px solid #003794 !important; outline-offset: 2px !important; }' +
			'.cc-eqn-bar .cc-switch input:disabled ~ * { opacity: .5 !important; cursor: default !important; }' +
			'.cc-eqn-bar .cc-switch-label { font: inherit !important; color: inherit !important; }' +
			'.cc-eqn-bar .cc-switch input:checked ~ .cc-switch-label { color: #003794 !important; font-weight: 600 !important; }' +
			'.cc-eqn-bar .cc-eqn-select { width: auto !important; height: 30px !important; margin: 0 !important; padding: 0 8px !important; ' +
				'border: 1px solid #cbd5e0 !important; border-radius: 4px !important; background: #fff !important; font: inherit !important; color: #1c2530 !important; cursor: pointer !important; }' +
			'.cc-eqn-bar .cc-eqn-btn { display: inline-flex !important; align-items: center !important; height: 30px !important; margin: 0 !important; ' +
				'padding: 0 16px !important; border: 1px solid #cbd5e0 !important; border-radius: 4px !important; background: #fff !important; ' +
				'font: inherit !important; color: #1c2530 !important; cursor: pointer !important; box-shadow: none !important; }' +
			'.cc-eqn-bar .cc-eqn-btn * { font: inherit !important; color: inherit !important; }' +
			'.cc-eqn-bar .cc-eqn-btn.cc-eqn-primary { background: #2c7a4b !important; border-color: #2c7a4b !important; color: #fff !important; }';
		document.head.appendChild( style );
	}

	// Re-asserts the API's own .CCMathView/.fxtex rules, which host resets and revert-layer override.
	// The `design` option (see the README): how the editor looks, set by the site rather than the
	// author. The toolbar's rows and scale go to Toolbar.link() itself; everything else is applied
	// here, once the editor is mounted - CSS scoped to this editor's root, then the starting state of
	// the LaTeX toggle and the "Insert as" menu.
	var designCount = 0;
	function applyDesign( root, design, latexToggle, insertSelect ) {
		if ( !root || !design ) return;
		if ( !root.id ) root.id = 'cc-eqn-design-' + ( ++designCount );
		var sel = '#' + root.id, css = '';
		var colour = String( design.colour || '' );
		if ( /^(#[0-9a-f]{3,8}|[a-z]+)$/i.test( colour ) ) {
			css += sel + ' { --cc-accent: ' + colour + ';' +
				' --cc-accent-soft: color-mix(in srgb, ' + colour + ' 11%, #fff);' +
				' --cc-accent-soft-ring: color-mix(in srgb, ' + colour + ' 28%, #fff);' +
				' --cc-accent-mid: color-mix(in srgb, ' + colour + ' 22%, #fff);' +
				' --cc-accent-mid-ring: color-mix(in srgb, ' + colour + ' 43%, #fff); }';
		}
		if ( Number( design.mathSize ) > 0 ) css += sel + ' .CCMathView { font-size: ' + Number( design.mathSize ) + 'px !important; }';
		if ( Number( design.latexSize ) > 0 ) css += sel + ' .CCLatexInput { font-size: ' + Number( design.latexSize ) + 'px !important; }';
		if ( design.toolbar === false ) css += sel + ' .CCToolbar { display: none !important; }';
		if ( design.history === false ) css += sel + ' .CCEditorBar { display: none !important; }';
		if ( css ) {
			var style = document.createElement( 'style' );
			style.textContent = css;
			root.appendChild( style );
		}
		// The dialog's width and height (`width`, `height`), before any scaling: the box takes the width,
		// and the editing area whatever height makes the whole dialog the height asked for - measured,
		// since everything else in it (toolbar rows, the bottom bar) varies with the design. Hosts that
		// size their dialogs themselves (TinyMCE 4, CKEditor 4) are given both when they open it instead.
		var sizedBox = root.closest( '.tox-dialog, .mce-window, .cke_dialog, .ck-balloon-panel, .cc-eqneditor-modal, .tc-drop-down' ) || root;
		if ( !sizedBox.matches( '.mce-window, .cke_dialog' ) ) {
			if ( Number( design.width ) > 0 ) sizedBox.style.setProperty( 'width', Number( design.width ) + 'px', 'important' );
			var area = root.querySelector( '.CCMathViewHost' );
			if ( Number( design.height ) > 0 && area ) {
				// Measured, then measured again as the dialog settles - the toolbar fits itself to its row
				// after the dialog first lays out, and the fonts arrive - correcting by the difference each time.
				// A box with a height of its own (Froala's and Tiptap's modals) sizes to its contents instead.
				sizedBox.style.setProperty( 'height', 'auto', 'important' );
				var sizing = document.createElement( 'style' );
				root.appendChild( sizing );
				var h = 0;
				var fit = function () {
					var shown = root.querySelector( '.CCLatexInput' ) && getComputedStyle( area ).display === 'none'
						? root.querySelector( '.CCLatexInput' ) : area;
					// Scale may already be applied (see below), and on-screen sizes include it.
					var applied = parseFloat( sizedBox.style.zoom ) || parseFloat( ( sizedBox.style.transform.match( /scale\(([\d.]+)\)/ ) || [] )[ 1 ] ) || 1;
					var now = h || shown.getBoundingClientRect().height / applied;
					h = Math.max( 120, Math.round( now + Number( design.height ) - sizedBox.getBoundingClientRect().height / applied ) );
					// Never taller than the whole dialog asked for: a host that caps its dialog (and scrolls the
					// rest) would otherwise be chased upwards on every pass.
					h = Math.min( h, Number( design.height ) );
					sizing.textContent = '#' + root.id + ' { height: auto !important; } #' + root.id + ' .CCMathViewHost, #' + root.id + ' .CCLatexInput { height: ' + h + 'px !important; min-height: ' + h + 'px !important; }';
				};
				fit();
				[ 150, 500, 1200 ].forEach( function ( t ) { setTimeout( fit, t ); } );
			}
		}
		// The whole dialog, box and contents together - see `dialogSize` in the README. Zoomed where
		// the host lays the dialog out (it grows in place); scaled where the host positions it itself
		// (CKEditor, TinyMCE 4, a TiddlyWiki drop-down), so that placement still holds.
		var size = Number( design.dialogSize );
		if ( size > 0 && size !== 1 ) {
			var box = root.closest( '.tox-dialog, .mce-window, .cke_dialog, .ck-balloon-panel, .cc-eqneditor-modal, .tc-drop-down' ) || root;
			var position = getComputedStyle( box ).position;
			if ( position === 'absolute' || position === 'fixed' ) {
				box.style.transform = 'scale(' + size + ')';
				box.style.transformOrigin = box.matches( '.ck-balloon-panel' ) ? 'top center'
					: box.matches( '.tc-drop-down' ) ? 'top left' : 'center center';
			} else {
				box.style.zoom = String( size );
				box.style.setProperty( 'max-width', 'calc(96vw / ' + size + ')', 'important' );   // still no wider than the window
			}
		}
		if ( insertSelect && design.insertAs && insertSelect.querySelector( 'option[value="' + design.insertAs + '"]' ) ) {
			insertSelect.value = design.insertAs;
		}
		if ( latexToggle && design.latex && !latexToggle.checked && !latexToggle.disabled ) {
			latexToggle.checked = true;
			latexToggle.dispatchEvent( new Event( 'change', { bubbles: true } ) );
		}
	}

	function apiMathRules() {
		var out = '';
		for ( var i = 0; i < document.styleSheets.length; i++ ) {
			var rules;
			try { rules = document.styleSheets[ i ].cssRules; } catch ( e ) { continue; }
			for ( var j = 0; j < rules.length; j++ ) {
				var r = rules[ j ], decls = '';
				if ( !r.selectorText || !/(^|,)\s*\.(fxtex|CCMathView)\b/.test( r.selectorText ) ) continue;
				for ( var k = 0; k < r.style.length; k++ ) {
					decls += r.style[ k ] + ':' + r.style.getPropertyValue( r.style[ k ] ) + ' !important;';
				}
				if ( decls ) {
					out += r.selectorText.split( ',' ).map( function ( s ) {
						s = s.trim();
						return /^\.CCMathView\b/.test( s ) ? s : '.CCMathView ' + s;
					} ).join( ',' ) + '{' + decls + '}';
				}
			}
		}
		return out;
	}

	var instanceCount = 0;

	tinymce.PluginManager.add( 'eqneditor', function ( editor, url ) {
		var n = ++instanceCount;
		var ids = {
			root: 'cc-eqn-wp4-' + n,
			history: 'cc-eqn-wp4-history-' + n,
			toolbar: 'cc-eqn-wp4-toolbar-' + n,
			mathview: 'cc-eqn-wp4-mathview-' + n,
			latexInput: 'cc-eqn-wp4-latex-' + n,
			output: 'cc-eqn-wp4-output-' + n,
			toggleInline: 'cc-eqn-wp4-toggle-inline-' + n,
			toggleLatex: 'cc-eqn-wp4-toggle-latex-' + n,
			insertMode: 'cc-eqn-wp4-insert-mode-' + n
		};

		// e.g. <script>window.eqneditorServer = 'localhost:8010';</script> in admin_head.
		var host = window.eqneditorServer || DEFAULT_HOST;
		// A bare host means https; a full origin (e.g. http://localhost:8010 for local development) is used as it is.
		var origin = /^https?:\/\//.test( host ) ? host.replace( /\/+$/, '' ) : 'https://' + host;
		var renderUrl = window.eqneditorRenderUrl || DEFAULT_RENDER_URL;
		var licence = window.eqneditorLicence || '';
		var design = window.eqneditorDesign || {};
		var scriptUrl = window.eqneditorScriptUrl || ( origin + '/eqneditor.api.min.js' );
		var cssUrl = window.eqneditorCssUrl || ( origin + '/eqneditor.css' );
		var mathmlCssUrl = window.eqneditorMathmlCssUrl || ( origin + '/fxtex.css' );

		var apiReady = loadScriptOnce( scriptUrl );
		tinymce.DOM.loadCSS( cssUrl );
		tinymce.DOM.loadCSS( mathmlCssUrl );

		var eqOutput = null, eqTextArea = null, eqMathView = null, eqToolbar = null;

		// The dialog body's height: the design's `height` is the whole dialog's, title bar and
		// buttons (about 90px) included, like every other plugin's.
		function dialogHeight() {
			return Number( design.height ) > 0 ? Math.max( 300, Number( design.height ) - 90 ) : 500;
		}

		function panelHtml() {
			// The height is also an inline style here, not just in the injected stylesheet
			// (see injectStyleOverridesOnce): TinyMCE 4's dialog body uses an "absolute
			// layout" engine that measures and fixes each panel's size once, against the DOM
			// as it exists the moment this HTML string is inserted - which is before the
			// injected stylesheet exists (that only happens once the Equation Editor API has
			// finished loading, asynchronously). An inline style is there from the first
			// layout pass, so the panel is measured at its real height from the start instead
			// of a tiny unstyled one, with everything past it clipped by an ancestor's
			// overflow:hidden.
			return '' +
				'<div id="' + ids.root + '" class="CCEqnEditor" data-latex="off" data-inline="off" ' +
					'style="display:flex;flex-direction:column;height:' + ( dialogHeight() - 40 ) + 'px">' +
					'<div class="CCEditorBar"><div id="' + ids.history + '" class="CCHistory"></div></div>' +
					'<div id="' + ids.toolbar + '"></div>' +
					'<div id="' + ids.mathview + '" class="CCMathViewHost"></div>' +
					'<div id="' + ids.latexInput + '" class="CCLatexInput" autocorrect="off" ' +
						'placeholder="Write LaTeX here..."></div>' +
					// No rendered-equation preview in the dialog any more - MathView is the
					// whole editing surface. eqOutput still needs a DOM element to bind to (it
					// builds the SVG URL for the "Image (SVG)" insert mode), so the element
					// stays, just not visible.
					'<img id="' + ids.output + '" class="CCEqnOutput-hidden" alt="">' +
					'<div class="cc-eqneditor-bottombar cc-eqn-bar">' +
						'<label class="cc-switch" title="Left-align the equation instead of centring it">' +
							'<input type="checkbox" id="' + ids.toggleInline + '">' +
							'<span class="cc-switch-track"><span class="cc-switch-knob"></span></span>' +
							'<span class="cc-switch-label">Inline</span>' +
						'</label>' +
						'<label class="cc-switch" title="Show or hide the LaTeX markup">' +
							'<input type="checkbox" id="' + ids.toggleLatex + '">' +
							'<span class="cc-switch-track"><span class="cc-switch-knob"></span></span>' +
							'<span class="cc-switch-label">LaTeX markup</span>' +
						'</label>' +
						'<div class="cc-eqn-bar-right">' +
							'<select class="cc-eqn-select" id="' + ids.insertMode + '" title="How to insert the equation">' +
								'<option value="mathml" selected>Insert as MathML</option>' +
								'<option value="svg">Insert as image (SVG)</option>' +
							'</select>' +
						'</div>' +
					'</div>' +
				'</div>';
		}

		function applyLatexVisible( visible ) {
			var root = document.getElementById( ids.root );
			if ( root ) root.setAttribute( 'data-latex', visible ? 'on' : 'off' );
			if ( eqToolbar ) eqToolbar.setActiveTextArea( visible ? eqTextArea : ( eqMathView || eqTextArea ) );
		}

		function applyInline( inline ) {
			var root = document.getElementById( ids.root );
			if ( root ) root.setAttribute( 'data-inline', inline ? 'on' : 'off' );
			if ( eqMathView ) eqMathView.setInline( inline );
			if ( eqOutput ) eqOutput.setInline( inline );
		}

		function mount() {
			eqOutput = new EqEditor.Output( ids.output );
			eqOutput.setRenderURL( renderUrl );

			eqTextArea = EqEditor.TextArea.link( ids.latexInput )
				.addOutput( eqOutput )
				.addHistoryMenu( new EqEditor.History( ids.history ) );

			eqToolbar = EqEditor.Toolbar.link( ids.toolbar, design.toolbar || 'default', design.toolbarScale || 1 ).addTextArea( eqTextArea );

			var latexToggle = document.getElementById( ids.toggleLatex );

			if ( typeof EqEditor.MathView !== 'undefined' ) {
				eqMathView = EqEditor.MathView.link( ids.mathview ).addTextArea( eqTextArea );
				eqToolbar.addMathView( eqMathView );
			} else {
				// Without a maths view the markup is the only thing to edit in - force it
				// visible and lock the toggle so it cannot be switched to an empty pane.
				applyLatexVisible( true );
				latexToggle.checked = true;
				latexToggle.disabled = true;
			}

			latexToggle.addEventListener( 'change', function ( e ) { applyLatexVisible( e.target.checked ); } );
			document.getElementById( ids.toggleInline ).addEventListener( 'change', function ( e ) {
				applyInline( e.target.checked );
			} );

			applyDesign( document.getElementById( ids.root ), design, latexToggle, document.getElementById( ids.insertMode ) );
		}

		function buildInsert( latex, mode ) {
			if ( mode === 'svg' ) {
				// referrerpolicy explicitly, rather than leaving it to the page's own
				// Referrer-Policy: latex.codecogs.com identifies the calling site by referer,
				// and a page with a stricter policy (or none at all, on some browsers'
				// defaults) would otherwise send none at all.
				return '<img src="' + escapeHtml( eqOutput.exportAs( 'url' ) ) + '" ' +
					'alt="' + escapeHtml( latex ) + '" referrerpolicy="origin">';
			}
			return eqOutput.exportAs( 'mathml' );
		}

		function showDialog( latex ) {
			latex = latex || '';

			var dialog = editor.windowManager.open( {
				title: 'Equation Editor',
				width: Number( design.width ) > 0 ? Number( design.width ) : 850,
				// The 460px panel plus the dialog body's own 20px padding above and below.
				height: dialogHeight(),
				body: [ { type: 'container', html: panelHtml() } ],
				buttons: [
					{ text: 'Cancel', onclick: 'close' },
					{
						text: 'Ok',
						subtype: 'primary',
						onclick: function () {
							var current = eqTextArea ? eqTextArea.getTextArea().textContent.trim() : '';
							if ( current ) {
								var mode = document.getElementById( ids.insertMode ).value;
								editor.execCommand( 'mceInsertContent', false, buildInsert( current, mode ) );
								eqTextArea.pushToHistory();
							}
							dialog.close();
						}
					}
				],
				onClose: function () {
					if ( eqTextArea ) eqTextArea.close();
				}
			} );

			apiReady.then( function () { return ensureInit( licence ); } ).then( function () {
				injectStyleOverridesOnce( cssUrl.slice( 0, cssUrl.lastIndexOf( '/' ) + 1 ) + 'prototypes/latinmodern-math.otf' );
				mount();
				eqTextArea.clear();
				if ( latex ) eqTextArea.insert( latex, latex.length );
				eqTextArea.notifyOutputs();

				// TinyMCE 4's dialog body uses an "absolute layout" engine that measures and
				// fixes each panel's size once, when the (still unstyled, tiny) HTML string is
				// first inserted - the style overrides above that give .CCEqnEditor its real
				// height take effect too late for that measurement, and everything past the
				// panel's original few-pixel-tall box was clipped by an ancestor's
				// overflow:hidden rather than shown. reflow() re-measures against the DOM as it
				// now actually is.
				dialog.reflow();
			} ).catch( function ( err ) {
				console.error( err );
				dialog.close();
			} );
		}

		editor.addButton( 'eqneditor', {
			image: url + '/img/eqneditor.png',
			tooltip: 'Insert Equation',
			onclick: function () { showDialog(); }
		} );

		editor.addMenuItem( 'eqneditor', {
			text: 'Equation...',
			image: url + '/img/eqneditor.png',
			context: 'insert',
			onclick: function () { showDialog(); }
		} );

		// Registers the MathML elements with TinyMCE 4's own schema so an "Insert as MathML"
		// equation survives mceInsertContent() rather than being silently stripped - TinyMCE's
		// default schema does not know <math>. TinyMCE 4's schema API takes a callback rather
		// than TinyMCE 6's addValidElements() (see tinymce/v6/eqneditor.js for the pitfall that
		// method has there - extending an *existing* element's attribute list the wrong way
		// wipes the rest of it. TinyMCE 4's editor.schema.addValidElements() has the same
		// replace-not-merge behaviour for an element schema already knows, but every MathML
		// element name here is new to the schema, so there is nothing to accidentally wipe).
		editor.on( 'init', function () {
			editor.schema.addValidElements(
				MATHML_ELEMENTS.map( function ( name ) { return name + '[*]'; } ).join( ',' ) );

			// img's default rule has no referrerpolicy, so the sanitiser strips it from every
			// equation image. Mutated in place: addValidElements('img[...]') would replace the
			// rule and drop src/alt from every image (see tinymce/v6/eqneditor.js).
			var imgRule = editor.schema.getElementRule( 'img' );
			if ( imgRule && imgRule.attributes && !imgRule.attributes.referrerpolicy ) {
				imgRule.attributes.referrerpolicy = {};
				imgRule.attributesOrder.push( 'referrerpolicy' );
			}
		} );

		// Double-click an equation to edit it again.
		editor.on( 'DblClick', function ( e ) {
			var target = e.target;
			if ( !target ) return;

			if ( target.nodeName.toLowerCase() === 'img' && isEquationSrc( target.src ) ) {
				var match = target.src.match( /(gif|svg|png)\.image\?(.*)/ );
				if ( match ) showDialog( decodeEquation( match[ 2 ] ) );
				return;
			}

			var mathEl = target.closest ? target.closest( 'math[title]' ) : null;
			if ( mathEl ) {
				var latex = mathEl.getAttribute( 'title' ).trim();
				if ( latex ) showDialog( latex );
			}
		} );
	} );
}() );
