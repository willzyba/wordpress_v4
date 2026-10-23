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
	// lifetime, even once fxeditor.api.min.js itself has loaded. Called once per page; an
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

	// Fixes for gaps in the shared fxeditor.css (loaded separately, asynchronously, from the
	// host configured below) this dialog needs but can't assume it will get: the old default host,
	// editor.codecogs.com (still configurable), serves an older stylesheet that predates the CCEqnEditor/
	// CCMathViewHost/CCLatexInput class names entirely (only a local dev mirror does not have
	// this gap). TinyMCE 4's dialog body also does not itself give arbitrary nested content a
	// height to lay out inside - without an explicit one on .CCEqnEditor, the maths view
	// collapsed to a few pixels tall rather than filling the dialog. Injected once, since it
	// would otherwise race fxeditor.css over which rule wins.
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
			// The toolbar as wide as the dialog, no wider: sized to its own content instead (width: auto)
			// it kept the toolbar's whole row and ran past a narrow dialog (`design.width`); at 100% the
			// toolbar scrolls.
			'.CCEqnEditor [id^="cc-eqn-wp4-toolbar-"] { align-self: flex-start; width: 100%; }' +
			'.CCEqnEditor .CCMathViewHost { flex: 1 1 auto; min-height: 0; display: flex; ' +
				'align-items: center; justify-content: center; overflow: auto; }' +
			'.CCEqnEditor[data-inline="on"] .CCMathViewHost { justify-content: flex-start; }' +
			'.CCEqnEditor[data-latex="on"] .CCMathViewHost { display: none !important; }' +
			'.CCEqnEditor .CCLatexInput { flex: 1 1 auto; min-height: 0; overflow: auto; }' +
			'.CCEqnEditor[data-latex="off"] .CCLatexInput { display: none !important; }' +
			'.CCEqnEditor .CCEqnOutput-hidden { display: none !important; }' +
			// The bottom bar: toggles left, Insert-as and the dialog's buttons right, one type size. All !important - host dialog resets otherwise restyle it.
			'.cc-eqn-bar { display: flex !important; flex-wrap: wrap !important; align-items: center !important; gap: 16px !important; flex: 0 0 auto !important; ' +
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
	// The dialog's size when the design does not set one: about 700 by 450 pixels.
	var DEFAULT_WIDTH = 700, DEFAULT_HEIGHT = 450;
	function designWidth( design ) { return Number( design && design.width ) > 0 ? Number( design.width ) : DEFAULT_WIDTH; }
	function designHeight( design ) { return Number( design && design.height ) > 0 ? Number( design.height ) : DEFAULT_HEIGHT; }
	// Gives an inserted image its size in em once the API has read it (Output.imageSize()): set on
	// the image after it goes in, since waiting before inserting it would lose the host's selection.
	// Marked with data-cc-size until then; an API without imageSize() leaves the image as it was.
	var sizingCount = 0;
	function sizeImage( output, apply ) {
		if ( !output || typeof output.imageSize !== 'function' ) return '';
		var mark = 'cc-size-' + ( ++sizingCount ) + '-' + Date.now();
		output.imageSize().then( function ( size ) { apply( mark, size ); } );
		return ' data-cc-size="' + mark + '"';
	}
	// An equation's own size, against a normal one (Output.setScale()): normal is whatever
	// the site's .fxtex rule makes it, and this scales one equation on top. Chosen in the dialog's
	// Size control when the design shows it (design.sizeControl); otherwise an equation being edited
	// keeps the size it had.
	var SIZES = [ 50, 75, 100, 125, 150, 200, 300 ];
	function sizeOptions() {
		return SIZES.map( function ( pct ) {
			return '<option value="' + pct + '"' + ( pct === 100 ? ' selected' : '' ) + '>' + pct + '%</option>';
		} ).join( '' );
	}
	function showSize( select, scale ) {
		if ( !select ) return;
		var pct = String( Math.round( scale * 100 ) );
		if ( !select.querySelector( 'option[value="' + pct + '"]' ) ) {
			var option = document.createElement( 'option' );
			option.value = pct;
			option.textContent = pct + '%';
			select.appendChild( option );
		}
		select.value = pct;
	}
	// The size an equation on the page was inserted at - read once the API has loaded, which may
	// be after the double-click that asked for it. 1 without one.
	function sizeOf( el ) {
		return el && window.EqEditor && EqEditor.Output && ( EqEditor.Output.scaleOf || EqEditor.Output.equationSizeOf )
			? ( EqEditor.Output.scaleOf || EqEditor.Output.equationSizeOf ).call( EqEditor.Output, el ) : 1;
	}

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
			sizedBox.style.setProperty( 'width', designWidth( design ) + 'px', 'important' );
			var area = root.querySelector( '.CCMathViewHost' );
			if ( area ) {
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
					h = Math.max( 120, Math.round( now + designHeight( design ) - sizedBox.getBoundingClientRect().height / applied ) );
					// Never taller than the whole dialog asked for: a host that caps its dialog (and scrolls the
					// rest) would otherwise be chased upwards on every pass.
					h = Math.min( h, designHeight( design ) );
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
				// A cap on the box's width (CKEditor 5's balloon: 96vw) holds before the scale - divided by it,
				// as for zoom below, or a scaled-down box is squeezed narrower than its own contents.
				box.style.removeProperty( 'max-width' );   // a host that reuses the box (CKEditor 5) would otherwise divide it again
				var cap = getComputedStyle( box ).maxWidth;
				if ( cap !== 'none' ) box.style.setProperty( 'max-width', 'calc(' + cap + ' / ' + size + ')', 'important' );
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

	// Ready to type into, with its cursor showing: the MathView (or the LaTeX pane, when that is the
	// one showing) takes focus as the dialog opens - otherwise focus stays on whatever opened it.
	// The API draws the MathView's caret where the cursor is at that moment and only redraws it on an
	// edit or on focus, but a dialog goes on settling after it opens (fonts arrive, the toolbar fits
	// itself to its row) and moves the equation out from under it. Its focus handler only redraws
	// (the cursor stays where it is), so it is fired again whenever the editing area changes size.
	// The equation as an image URL ('url') or as MathML ('mathml'). fxeditor-api replaced Output.exportAs()
	// with getEquationURL() and setFormat()/setWrapper()/getCode() (its 9630657); exportAs() still serves an
	// API from before that. The format is set each time: the same Output gives both.
	function outputCode( output, kind ) {
		if ( typeof output.exportAs === 'function' ) return output.exportAs( kind );
		if ( kind === 'mathml' ) return output.setFormat( 'mathml' ).setWrapper( 'html' ).getCode();
		return output.setFormat( 'svg' ).getEquationURL();
	}

	// The editor's own controls, as the Google Docs sidebar has them: the toolbar's size (50-120%) at the
	// right of the undo/redo bar; Inline, LaTeX and Predictor switches together - Inline added where a
	// host has none, Predictor beside LaTeX; and LaTeX shown above the maths view rather than in its place
	// (see stackPanes()). The size, Inline, LaTeX, Predictor and the markup's height are remembered here;
	// the predictor starts as design.predictor says until the author has chosen. `parts` carries the
	// editor's textArea, mathView and output, and the latexToggle and inlineToggle checkboxes.
	var EDITOR_PREFS_KEY = 'cc-eqn-editor';
	function addEditorControls( root, design, parts ) {
		if ( !root || !parts ) return;
		design = design || {};
		injectPredictorStylesOnce();
		var prefs = {};
		try { prefs = JSON.parse( localStorage.getItem( EDITOR_PREFS_KEY ) ) || {}; } catch ( e ) {}
		var save = function () {
			try { localStorage.setItem( EDITOR_PREFS_KEY, JSON.stringify( prefs ) ); } catch ( e ) {}
		};
		var latexLabel = parts.latexToggle && parts.latexToggle.closest( 'label' );
		// Another switch drawn exactly as the LaTeX one is - whatever markup and styling this host gives it.
		var makeSwitch = function ( text, title ) {
			var label = latexLabel.cloneNode( true );
			var input = label.querySelector( 'input' );
			input.removeAttribute( 'id' );
			input.className = '';
			for ( var i = input.attributes.length - 1; i >= 0; i-- ) {
				if ( /^data-/.test( input.attributes[ i ].name ) ) input.removeAttribute( input.attributes[ i ].name );
			}
			input.checked = false;
			input.disabled = false;
			label.removeAttribute( 'for' );
			label.title = title;
			var name = label.querySelector( '.cc-switch-label' );
			if ( name ) name.textContent = text;
			return label;
		};

		// The toolbar's size. zoom scales it as it stands, so nothing is rebuilt: it keeps which pane it
		// types into, and any panel that is open.
		var toolbar = root.querySelector( '.CCToolbar' ), bar = root.querySelector( '.CCEditorBar' );
		if ( toolbar && bar && design.toolbar !== false && !bar.querySelector( '.cc-toolbar-size' ) ) {
			var size = document.createElement( 'label' );
			size.className = 'cc-toolbar-size';
			size.title = 'The toolbar’s size';
			size.innerHTML = '<input type="range" min="50" max="120" step="5" aria-label="Toolbar size"><output></output>';
			bar.appendChild( size );
			var range = size.querySelector( 'input' ), shown = size.querySelector( 'output' );
			var setSize = function ( pct ) {
				pct = Math.min( 120, Math.max( 50, Math.round( Number( pct ) / 5 ) * 5 || 100 ) );
				prefs.toolbarSize = pct;
				toolbar.style.zoom = String( pct / 100 );
				range.value = pct;
				shown.textContent = pct + '%';
			};
			setSize( prefs.toolbarSize || 100 );
			range.addEventListener( 'input', function () { setSize( range.value ); } );
			range.addEventListener( 'change', save );
		}

		// Inline: the host's own switch, or one added before LaTeX where it has none.
		var inline = parts.inlineToggle;
		if ( !inline && latexLabel ) {
			var inlineLabel = makeSwitch( 'Inline', 'An inline equation, set to sit in a line of text' );
			latexLabel.parentNode.insertBefore( inlineLabel, latexLabel );
			inline = inlineLabel.querySelector( 'input' );
			inline.addEventListener( 'change', function () {
				root.setAttribute( 'data-inline', inline.checked ? 'on' : 'off' );
				if ( parts.mathView && parts.mathView.setInline ) parts.mathView.setInline( inline.checked );
				if ( parts.output && parts.output.setInline ) parts.output.setInline( inline.checked );
			} );
		}
		if ( inline ) {
			if ( typeof prefs.inline === 'boolean' && inline.checked !== prefs.inline && !inline.disabled ) {
				inline.checked = prefs.inline;
				inline.dispatchEvent( new Event( 'change', { bubbles: true } ) );
			}
			inline.addEventListener( 'change', function () { prefs.inline = inline.checked; save(); } );
		}

		// LaTeX: remembered with the rest (a host that keeps its own record is overruled by this one).
		var latex = parts.latexToggle;
		if ( latex ) {
			if ( typeof prefs.latex === 'boolean' && latex.checked !== prefs.latex && !latex.disabled ) {
				latex.checked = prefs.latex;
				latex.dispatchEvent( new Event( 'change', { bubbles: true } ) );
			}
			latex.addEventListener( 'change', function () { prefs.latex = latex.checked; save(); } );
		}

		stackPanes( root, prefs, save );

		// The predictor, switched on and off beside LaTeX.
		if ( latexLabel ) {
			var predictorBox = null;
			var predictor = addPredictor( root, design, parts.textArea, parts.mathView, function () {
				predictorBox.checked = false;
				prefs.predictor = false;
				save();
			} );
			if ( predictor ) {
				var predictorLabel = makeSwitch( 'Predictor', 'Suggested equations, as you write' );
				latexLabel.parentNode.insertBefore( predictorLabel, latexLabel.nextSibling );
				predictorBox = predictorLabel.querySelector( 'input' );
				predictorBox.checked = typeof prefs.predictor === 'boolean' ? prefs.predictor : !!design.predictor;
				predictor.setOn( predictorBox.checked );
				predictorBox.addEventListener( 'change', function () {
					predictor.setOn( predictorBox.checked );
					prefs.predictor = predictorBox.checked;
					save();
				} );
			}
		}
	}

	// The LaTeX markup above the maths view while LaTeX is on, rather than in its place, with a bar
	// between them that drags (or arrow-keys) the markup taller or shorter - its height remembered as
	// prefs.latexHeight. Follows the editor root's data-latex, which every host's LaTeX switch sets, and
	// overrides the host's own rule hiding the maths view meanwhile (inline and !important, as that is).
	var LATEX_HEIGHT = 90, LATEX_MIN = 40;
	function stackPanes( root, prefs, save ) {
		var host = root.querySelector( '.CCMathViewHost' ), markup = root.querySelector( '.CCLatexInput' );
		if ( !host || !markup || root.querySelector( '.cc-eqn-panes' ) ) return;
		var panes = document.createElement( 'div' );
		panes.className = 'cc-eqn-panes';
		var first = ( markup.compareDocumentPosition( host ) & 4 ) ? markup : host;   // 4: host follows markup
		first.parentNode.insertBefore( panes, first );
		var grip = document.createElement( 'div' );
		grip.className = 'cc-eqn-panes-split';
		grip.tabIndex = 0;
		grip.setAttribute( 'role', 'separator' );
		grip.setAttribute( 'aria-orientation', 'horizontal' );
		grip.setAttribute( 'aria-label', 'Resize the LaTeX markup' );
		grip.title = 'Drag to share the space between the LaTeX and the equation';
		panes.appendChild( markup );
		panes.appendChild( grip );
		panes.appendChild( host );

		var height = Number( prefs.latexHeight ) >= LATEX_MIN ? Number( prefs.latexHeight ) : LATEX_HEIGHT;
		var set = function ( el, prop, value ) { el.style.setProperty( prop, value, 'important' ); };
		// A host that shows one pane at a time gives the editing area's height to whichever is showing:
		// with both showing, that area is shared - the markup's height, then the bar, then the equation
		// whatever is left. A host that shows both anyway sizes them itself; the markup's height is set.
		var apply = function () {
			var both = root.getAttribute( 'data-latex' ) === 'on';
			panes.classList.toggle( 'cc-eqn-both', both );
			[ 'height', 'min-height', 'flex', 'display' ].forEach( function ( p ) {
				markup.style.removeProperty( p );
				host.style.removeProperty( p );
			} );
			if ( !both ) return;
			set( markup, 'min-height', '0' );
			set( markup, 'flex', '0 0 auto' );
			if ( getComputedStyle( host ).display !== 'none' ) {
				set( markup, 'height', height + 'px' );
				return;
			}
			var area = markup.offsetHeight;   // what the host gives the markup alone: the whole area
			if ( !area ) return;			  // not laid out yet - the ResizeObserver below comes back
			var bar = grip.offsetHeight + 2;
			var h = Math.min( height, Math.max( LATEX_MIN, area - bar - 60 ) );
			set( markup, 'height', h + 'px' );
			set( host, 'display', 'flex' );
			set( host, 'height', Math.max( 0, area - bar - h ) + 'px' );
			set( host, 'min-height', '0' );
			set( host, 'flex', '0 0 auto' );
		};
		var setHeight = function ( h ) {
			height = Math.round( Math.max( LATEX_MIN, h ) );
			apply();
		};
		apply();
		new MutationObserver( apply ).observe( root, { attributes: true, attributeFilter: [ 'data-latex' ] } );
		// The dialog lays out, or is resized, after this has run (TinyMCE 4's and WordPress's settle their
		// sizes a moment later): share the area it then has. The editor's root, not the panes, is watched -
		// the panes take the heights set here, so would not change to say so - and measured again as the
		// dialog settles, as applyDesign() measures its height.
		var again = function () { if ( panes.classList.contains( 'cc-eqn-both' ) ) apply(); };
		if ( typeof ResizeObserver !== 'undefined' ) new ResizeObserver( again ).observe( root );
		[ 150, 500, 1200 ].forEach( function ( t ) { setTimeout( again, t ); } );

		grip.addEventListener( 'keydown', function ( e ) {
			if ( e.key !== 'ArrowUp' && e.key !== 'ArrowDown' ) return;
			e.preventDefault();
			setHeight( height + ( e.key === 'ArrowDown' ? 20 : -20 ) );
			prefs.latexHeight = height;
			save();
		} );
		grip.addEventListener( 'pointerdown', function ( e ) {
			if ( e.button !== 0 ) return;
			e.preventDefault();
			var scale = panes.getBoundingClientRect().height / ( panes.offsetHeight || 1 ) || 1;
			var startY = e.clientY, startH = height;
			grip.setPointerCapture( e.pointerId );
			grip.classList.add( 'is-dragging' );
			var move = function ( ev ) { setHeight( startH + ( ev.clientY - startY ) / scale ); };
			var up = function () {
				grip.removeEventListener( 'pointermove', move );
				grip.removeEventListener( 'pointerup', up );
				grip.removeEventListener( 'pointercancel', up );
				grip.classList.remove( 'is-dragging' );
				prefs.latexHeight = height;
				save();
			};
			grip.addEventListener( 'pointermove', move );
			grip.addEventListener( 'pointerup', up );
			grip.addEventListener( 'pointercancel', up );
		} );
	}

	// The predictor: whole equations that start the way this one does - the API's PredictorView - in a
	// panel beside the editing area. The maths view and the markup pane share one row with it, so it sits
	// beside whichever is showing - or, when that row is too narrow to share (a narrow dialog), below it.
	// The bar between them drags to resize the panel (arrow keys too); its button, or Enter, switches the
	// predictor off, as the Predictor switch does (`onOff`). Its width beside and its height below are
	// remembered in this browser. Returns { setOn }, or null for an API without a PredictorView.
	var PREDICTOR_WIDTH = 220, PREDICTOR_MIN = 140, PREDICTOR_HEIGHT = 170, PREDICTOR_MIN_HEIGHT = 90;
	var PREDICTOR_STACK_BELOW = 480, PREDICTOR_KEY = 'cc-eqn-predictor';
	function addPredictor( root, design, textArea, mathView, onOff ) {
		if ( !root || typeof EqEditor === 'undefined' || !EqEditor.PredictorView ) return null;
		var host = root.querySelector( '.CCMathViewHost' ), markup = root.querySelector( '.CCLatexInput' );
		var panes = root.querySelector( '.cc-eqn-panes' );   // stackPanes()'s, where it has run
		var first = panes || host || markup;
		if ( !first || root.querySelector( '.cc-eqn-work' ) ) return null;
		injectPredictorStylesOnce();

		var saved = {};
		try { saved = JSON.parse( localStorage.getItem( PREDICTOR_KEY ) ) || {}; } catch ( e ) {}
		var width = Number( saved.width ) >= PREDICTOR_MIN ? Number( saved.width ) : PREDICTOR_WIDTH;
		var height = Number( saved.height ) >= PREDICTOR_MIN_HEIGHT ? Number( saved.height ) : PREDICTOR_HEIGHT;

		var work = document.createElement( 'div' );
		work.className = 'cc-eqn-work cc-eqn-predictor-off';
		first.parentNode.insertBefore( work, first );
		if ( !panes ) {
			panes = document.createElement( 'div' );
			panes.className = 'cc-eqn-panes';
			if ( markup ) panes.appendChild( markup );
			if ( host ) panes.appendChild( host );
		}

		var bar = document.createElement( 'div' );
		bar.className = 'cc-eqn-split';
		bar.tabIndex = 0;
		bar.setAttribute( 'role', 'separator' );
		bar.setAttribute( 'aria-label', 'Resize the suggested equations' );
		var fold = document.createElement( 'button' );
		fold.type = 'button';
		fold.className = 'cc-eqn-split-fold';
		fold.title = 'Hide suggested equations';
		bar.appendChild( fold );

		var side = document.createElement( 'aside' );
		side.className = 'cc-eqn-predictor';
		side.id = root.id + '-predictor';
		side.setAttribute( 'aria-label', 'Suggested equations' );

		work.appendChild( panes );
		work.appendChild( bar );
		work.appendChild( side );

		function stacked() { return work.classList.contains( 'cc-eqn-stacked' ); }
		function remember() {
			try { localStorage.setItem( PREDICTOR_KEY, JSON.stringify( { width: width, height: height } ) ); } catch ( e ) {}
		}
		function setWidth( w ) {
			// Never so wide that the editing area beside it has nothing left.
			var room = work.clientWidth - bar.offsetWidth - 160;
			width = Math.round( Math.max( PREDICTOR_MIN, room > PREDICTOR_MIN ? Math.min( w, room ) : w ) );
			side.style.width = width + 'px';
		}
		function setHeight( h ) {
			height = Math.round( Math.min( 600, Math.max( PREDICTOR_MIN_HEIGHT, h ) ) );
			side.style.height = height + 'px';
		}
		// Beside the editing area, or below it once the row is too narrow for both: measured rather than
		// decided per host, so a dialog made narrow gets the right one. The button points the way the
		// panel goes to hide.
		function layout() {
			var below = work.clientWidth > 0 && work.clientWidth < PREDICTOR_STACK_BELOW;
			work.classList.toggle( 'cc-eqn-stacked', below );
			side.style.width = below ? '' : width + 'px';
			side.style.height = below ? height + 'px' : '';
			fold.textContent = below ? '▾' : '›';
			bar.setAttribute( 'aria-orientation', below ? 'horizontal' : 'vertical' );
		}
		layout();
		if ( typeof ResizeObserver !== 'undefined' ) new ResizeObserver( function () {
			if ( stacked() !== ( work.clientWidth > 0 && work.clientWidth < PREDICTOR_STACK_BELOW ) ) layout();
		} ).observe( work );

		function off() {
			setOn( false );
			if ( onOff ) onOff();
		}
		fold.addEventListener( 'click', off );
		bar.addEventListener( 'keydown', function ( e ) {
			if ( e.target !== bar ) return;
			if ( e.key === 'Enter' || e.key === ' ' ) {
				e.preventDefault(); off();
			} else if ( !stacked() && ( e.key === 'ArrowLeft' || e.key === 'ArrowRight' ) ) {
				e.preventDefault(); setWidth( width + ( e.key === 'ArrowLeft' ? 20 : -20 ) ); remember();
			} else if ( stacked() && ( e.key === 'ArrowUp' || e.key === 'ArrowDown' ) ) {
				e.preventDefault(); setHeight( height + ( e.key === 'ArrowUp' ? 20 : -20 ) ); remember();
			}
		} );
		// Dragged from anywhere on the bar but its button: left and right beside the editing area, up
		// and down below it. Pointer movement is in screen pixels, which a scaled dialog
		// (design.dialogSize) does not share with the panel's own size - hence the ratio.
		bar.addEventListener( 'pointerdown', function ( e ) {
			if ( e.target === fold || e.button !== 0 ) return;
			e.preventDefault();
			var below = stacked();
			var scale = work.getBoundingClientRect().width / ( work.offsetWidth || 1 ) || 1;
			var start = below ? e.clientY : e.clientX;
			var size = below ? height : width;
			bar.setPointerCapture( e.pointerId );
			work.classList.add( 'cc-eqn-dragging' );
			function move( ev ) {
				if ( below ) setHeight( size + ( start - ev.clientY ) / scale );
				else setWidth( size + ( start - ev.clientX ) / scale );
			}
			function up() {
				bar.removeEventListener( 'pointermove', move );
				bar.removeEventListener( 'pointerup', up );
				bar.removeEventListener( 'pointercancel', up );
				work.classList.remove( 'cc-eqn-dragging' );
				remember();
			}
			bar.addEventListener( 'pointermove', move );
			bar.addEventListener( 'pointerup', up );
			bar.addEventListener( 'pointercancel', up );
		} );

		// Built the first time it is switched on, so nothing is asked of the suggestion service while
		// the predictor is off.
		var view = null;
		function setOn( on ) {
			work.classList.toggle( 'cc-eqn-predictor-off', !on );
			if ( !on ) return;
			layout();
			if ( !view ) {
				var show = design && ( design.predictorShow === 'latex' || design.predictorShow === 'both' ) ? design.predictorShow : 'mathml';
				view = EqEditor.PredictorView.link( side.id, { limit: 6, show: show } ).addTextArea( textArea );
				if ( mathView ) view.addMathView( mathView );
			}
		}
		return { setOn: setOn };
	}

	// !important throughout: hosts reset their dialogs' contents (TinyMCE's .tox, CKEditor's
	// .ck-reset_all) more specifically than a plain class rule reaches.
	function injectPredictorStylesOnce() {
		if ( document.getElementById( 'cc-eqn-predictor-css' ) ) return;
		var style = document.createElement( 'style' );
		style.id = 'cc-eqn-predictor-css';
		style.textContent =
			// The toolbar's size, at the right of the undo/redo bar - on one line with it however narrow.
			'.CCEditorBar:has(.cc-toolbar-size), .CCEditorBar:has(.cc-toolbar-size) .CCHistory { flex-wrap: nowrap !important; }' +
			'.cc-toolbar-size { display: inline-flex !important; align-items: center !important; gap: 4px !important; margin: 0 0 0 auto !important; ' +
				'min-width: 0 !important; flex: 0 1 auto !important; font: 11px/1 sans-serif !important; color: #54647c !important; cursor: pointer !important; }' +
			'.cc-toolbar-size input { width: 72px !important; min-width: 36px !important; flex: 0 1 72px !important; margin: 0 !important; padding: 0 !important; ' +
				'accent-color: var(--cc-accent, #003794) !important; }' +
			'.cc-toolbar-size output { min-width: 3em !important; text-align: right !important; }' +
			// The bar between the LaTeX markup and the maths view, while both show (stackPanes()).
			'.cc-eqn-panes-split { display: none !important; }' +
			'.cc-eqn-both > .cc-eqn-panes-split { display: block !important; flex: 0 0 auto !important; height: 9px !important; margin: 1px 0 !important; ' +
				'position: relative !important; cursor: row-resize !important; touch-action: none !important; outline: none !important; background: transparent !important; }' +
			'.cc-eqn-both > .cc-eqn-panes-split::before { content: "" !important; position: absolute !important; top: 3px !important; left: 42% !important; right: 42% !important; ' +
				'height: 3px !important; border-radius: 2px !important; background: #cbd5e0 !important; }' +
			'.cc-eqn-both > .cc-eqn-panes-split:hover::before, .cc-eqn-both > .cc-eqn-panes-split:focus-visible::before, .cc-eqn-panes-split.is-dragging::before { ' +
				'left: 0 !important; right: 0 !important; background: var(--cc-accent, #003794) !important; }' +
			'.cc-eqn-work { display: flex !important; flex: 1 1 auto !important; min-height: 0 !important; min-width: 0 !important; align-items: stretch !important; }' +
			'.cc-eqn-panes { display: flex !important; flex-direction: column !important; flex: 1 1 auto !important; min-width: 0 !important; min-height: 0 !important; }' +
			'.cc-eqn-predictor-off .cc-eqn-split, .cc-eqn-predictor-off .cc-eqn-predictor { display: none !important; }' +
			'.cc-eqn-split { flex: 0 0 auto !important; width: 9px !important; margin: 0 2px !important; cursor: col-resize !important; ' +
				'display: flex !important; align-items: center !important; justify-content: center !important; position: relative !important; ' +
				'background: transparent !important; touch-action: none !important; user-select: none !important; outline: none !important; }' +
			'.cc-eqn-split::before { content: "" !important; position: absolute !important; top: 0 !important; bottom: 0 !important; left: 4px !important; ' +
				'width: 1px !important; background: #d5dbe3 !important; }' +
			'.cc-eqn-split:hover::before, .cc-eqn-split:focus-visible::before, .cc-eqn-dragging .cc-eqn-split::before { left: 3px !important; width: 3px !important; background: var(--cc-accent, #003794) !important; }' +
			'.cc-eqn-split-fold { flex: 0 0 auto !important; position: relative !important; z-index: 1 !important; width: 16px !important; height: 34px !important; margin: 0 !important; padding: 0 !important; ' +
				'border: 1px solid #cbd5e0 !important; border-radius: 8px !important; background: #fff !important; color: #52606d !important; ' +
				'font: 14px/1 sans-serif !important; cursor: pointer !important; box-shadow: none !important; display: flex !important; align-items: center !important; justify-content: center !important; }' +
			'.cc-eqn-split-fold:hover { color: var(--cc-accent, #003794) !important; border-color: var(--cc-accent, #003794) !important; }' +
			// contain: size - the list's length is no reason for the dialog to grow; the panel takes the
			// editing area's height (stretched, as a flex item) and scrolls within it. layout, as the API
			// has it, keeps its search box anchored to the panel.
			'.cc-eqn-predictor { flex: 0 0 auto !important; min-width: 0 !important; min-height: 0 !important; overflow: auto !important; box-sizing: border-box !important; contain: size layout !important; }' +
			'.cc-eqn-dragging, .cc-eqn-dragging * { cursor: col-resize !important; user-select: none !important; }' +
			// Below the editing area (cc-eqn-stacked): the same parts turned through a right angle.
			'.cc-eqn-stacked { flex-direction: column !important; }' +
			'.cc-eqn-stacked .cc-eqn-split { width: auto !important; height: 9px !important; margin: 2px 0 !important; cursor: row-resize !important; }' +
			'.cc-eqn-stacked .cc-eqn-split::before { top: 4px !important; bottom: auto !important; left: 0 !important; right: 0 !important; width: auto !important; height: 1px !important; }' +
			'.cc-eqn-stacked .cc-eqn-split:hover::before, .cc-eqn-stacked .cc-eqn-split:focus-visible::before, .cc-eqn-stacked.cc-eqn-dragging .cc-eqn-split::before { top: 3px !important; left: 0 !important; width: auto !important; height: 3px !important; }' +
			'.cc-eqn-stacked .cc-eqn-split-fold { width: 34px !important; height: 16px !important; }' +
			'.cc-eqn-stacked .cc-eqn-predictor { width: auto !important; }' +
			'.cc-eqn-stacked.cc-eqn-dragging, .cc-eqn-stacked.cc-eqn-dragging * { cursor: row-resize !important; }' +
			// The suggestions' maths set as the maths view's is: a host's reset (TinyMCE's .tox
			// :not(svg) { font-family: inherit; font-style: inherit }) outranks the API's .fxtex rules,
			// which left it in the dialog's sans-serif with its letters upright (the browser italicises
			// them through text-transform, which the reset takes too). Reverted to the browser's own
			// maths styling, as the maths view is, then the API's .fxtex rules re-asserted for the panel.
			'.cc-eqn-predictor math, .cc-eqn-predictor math * { font: revert-layer !important; text-transform: revert-layer !important; ' +
				'width: revert-layer !important; height: revert-layer !important; padding: revert-layer !important; margin: revert-layer !important; ' +
				'text-align: revert-layer !important; box-sizing: revert-layer !important; white-space: revert-layer !important; }';
		for ( var i = 0; i < document.styleSheets.length; i++ ) {
			var rules;
			try { rules = document.styleSheets[ i ].cssRules; } catch ( e ) { continue; }
			for ( var j = 0; j < rules.length; j++ ) {
				var r = rules[ j ], decls = '';
				var sel = r.selectorText && r.selectorText.replace( /:where\(\.fxEditor\)\s*/g, '' ).trim();
				if ( !sel || !/^\.fxtex\b/.test( sel ) || sel.indexOf( ',' ) > -1 ) continue;
				for ( var k = 0; k < r.style.length; k++ ) {
					decls += r.style[ k ] + ':' + r.style.getPropertyValue( r.style[ k ] ) + ' !important;';
				}
				if ( decls ) style.textContent += '.cc-eqn-predictor ' + sel + '{' + decls + '}';
			}
		}
		document.head.appendChild( style );
	}

	function focusEditor( root ) {
		if ( !root ) return;
		var pane = root.querySelector( root.getAttribute( 'data-latex' ) === 'on' ? '.CCLatexInput' : '.CCMathView' );
		if ( pane ) pane.focus( { preventScroll: true } );
		var view = root.querySelector( '.CCMathView' ), host = view && view.parentElement;
		if ( host && !host.ccCaretWatch && typeof ResizeObserver !== 'undefined' ) {
			host.ccCaretWatch = new ResizeObserver( function () {
				var mv = host.querySelector( '.CCMathView' );
				if ( mv && document.activeElement === mv ) mv.dispatchEvent( new FocusEvent( 'focus' ) );
			} );
			host.ccCaretWatch.observe( host );
		}
	}

	function apiMathRules() {
		var out = '';
		for ( var i = 0; i < document.styleSheets.length; i++ ) {
			var rules;
			try { rules = document.styleSheets[ i ].cssRules; } catch ( e ) { continue; }
			for ( var j = 0; j < rules.length; j++ ) {
				var r = rules[ j ], decls = '';
				if ( !r.selectorText || !/(^|,)\s*(:where\(\.fxEditor\)\s*)?\.(fxtex|CCMathView)\b/.test( r.selectorText ) ) continue;
				for ( var k = 0; k < r.style.length; k++ ) {
					decls += r.style[ k ] + ':' + r.style.getPropertyValue( r.style[ k ] ) + ' !important;';
				}
				if ( decls ) {
					out += r.selectorText.replace( /:where\(\.fxEditor\)\s*/g, '' ).split( ',' ).map( function ( s ) {
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
			insertMode: 'cc-eqn-wp4-insert-mode-' + n,
			size: 'cc-eqn-wp4-size-' + n
		};

		// e.g. <script>window.eqneditorServer = 'localhost:8010';</script> in admin_head.
		var host = window.eqneditorServer || DEFAULT_HOST;
		// A bare host means https; a full origin (e.g. http://localhost:8010 for local development) is used as it is.
		var origin = /^https?:\/\//.test( host ) ? host.replace( /\/+$/, '' ) : 'https://' + host;
		var renderUrl = window.eqneditorRenderUrl || DEFAULT_RENDER_URL;
		var licence = window.eqneditorLicence || '';
		var design = window.eqneditorDesign || {};
		var scriptUrl = window.eqneditorScriptUrl || ( origin + '/fxeditor.api.min.js' );
		var cssUrl = window.eqneditorCssUrl || ( origin + '/fxeditor.css' );
		var mathmlCssUrl = window.eqneditorMathmlCssUrl || ( origin + '/fxtex.css' );

		var apiReady = loadScriptOnce( scriptUrl );
		tinymce.DOM.loadCSS( cssUrl );
		tinymce.DOM.loadCSS( mathmlCssUrl );

		var eqOutput = null, eqTextArea = null, eqMathView = null, eqToolbar = null;

		// The dialog body's height: the design's `height` is the whole dialog's, title bar and
		// buttons (about 90px) included, like every other plugin's.
		function dialogHeight() {
			return Math.max( 300, designHeight( design ) - 90 );
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
							'<span class="cc-switch-label">LaTeX</span>' +
						'</label>' +
						'<div class="cc-eqn-bar-right">' +
							( design.sizeControl
							    ? '<select class="cc-eqn-select" id="' + ids.size + '" title="This equation\'s size, against a normal one">' + sizeOptions() + '</select>'
							    : '' ) +
							'<select class="cc-eqn-select" id="' + ids.insertMode + '" title="How to insert the equation">' +
								'<option value="mathml" selected>Insert MathML</option>' +
								'<option value="svg">Insert SVG</option>' +
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

			addEditorControls( document.getElementById( ids.root ), design, { textArea: eqTextArea, mathView: eqMathView, output: eqOutput,
				latexToggle: document.getElementById( ids.toggleLatex ), inlineToggle: document.getElementById( ids.toggleInline ) } );
			applyDesign( document.getElementById( ids.root ), design, latexToggle, document.getElementById( ids.insertMode ) );
		}

		function buildInsert( latex, mode ) {
			if ( mode === 'svg' ) {
				// referrerpolicy explicitly, rather than leaving it to the page's own
				// Referrer-Policy: latex.codecogs.com identifies the calling site by referer,
				// and a page with a stricter policy (or none at all, on some browsers'
				// defaults) would otherwise send none at all.
				return '<img class="fxtex" src="' + escapeHtml( outputCode( eqOutput, 'url' ) ) + '" ' +
					'alt="' + escapeHtml( latex ) + '" referrerpolicy="origin"' + sizeImage( eqOutput, function ( mark, size ) {
						var img = editor.dom.select( 'img[data-cc-size="' + mark + '"]' )[ 0 ];
						if ( !img ) return;
						if ( size ) editor.dom.setStyles( img, { width: size.width, height: size.height } );
						editor.dom.setAttrib( img, 'data-cc-size', null );
					} ) + '>';
			}
			return outputCode( eqOutput, 'mathml' );
		}

		// `el`, when editing: the equation on the page, whose size the dialog starts from.
		function showDialog( latex, el ) {
			latex = latex || '';
			var startSize = 1;

			var dialog = editor.windowManager.open( {
				title: 'Equation Editor',
				width: designWidth( design ),
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
								if ( eqOutput.setScale || eqOutput.setEquationSize ) {
									var sizeSelect = document.getElementById( ids.size );
									( eqOutput.setScale || eqOutput.setEquationSize ).call( eqOutput, sizeSelect ? Number( sizeSelect.value ) / 100 : startSize );
								}
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
				startSize = sizeOf( el );
				showSize( document.getElementById( ids.size ), startSize );
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
				focusEditor( document.getElementById( ids.root ) );
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
				if ( match ) showDialog( decodeEquation( match[ 2 ] ), target );
				return;
			}

			var mathEl = target.closest ? target.closest( 'math[title]' ) : null;
			if ( mathEl ) {
				var latex = mathEl.getAttribute( 'title' ).trim();
				if ( latex ) showDialog( latex, mathEl );
			}
		} );
	} );
}() );
