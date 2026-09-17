/*
 * CodeCogs Equation Editor plugin for WordPress's Classic Editor (TinyMCE 4).
 *
 * Adds an "fx" toolbar button and an Insert menu item that open a dialog embedding the shared
 * EqEditor UI (maths view by default, with a toggle to LaTeX markup) every adapter in
 * eqneditor-v5-plugins uses, loaded at runtime from editor.codecogs.com - see the
 * window.eqneditorServer/eqneditorScriptUrl/etc. globals below for how to override that for a
 * local dev WordPress. Double-clicking an existing equation image reopens the dialog with its
 * LaTeX decoded back out of the image's own src.
 *
 * Registered as a TinyMCE external plugin by index.php - see that file for the WordPress side
 * of this (mce_external_plugins/mce_buttons filters).
 */
( function () {
	'use strict';

	var DEFAULT_HOST = 'editor.codecogs.com';
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

	// Remembers which view (maths or LaTeX markup) the author last chose, across dialog opens
	// and page loads - a cookie rather than localStorage because it is one line to read without
	// a helper, and every editor instance on the page shares the one preference. Every adapter
	// in eqneditor-v5-plugins uses this exact cookie name, so the choice carries across editors
	// too, not just across opens of this one.
	var LATEX_COOKIE = 'cc_eqneditor_show_latex';

	function getShowLatexPreference( fallback ) {
		var match = document.cookie.match( /(?:^|; )cc_eqneditor_show_latex=([^;]*)/ );
		return match ? match[ 1 ] === '1' : fallback;
	}

	function setShowLatexPreference( visible ) {
		document.cookie = LATEX_COOKIE + '=' + ( visible ? '1' : '0' ) + '; path=/; max-age=31536000; SameSite=Lax';
	}

	// Fixes for gaps in the shared eqneditor.css (loaded separately, asynchronously, from the
	// host configured below) that this plugin needs but can't assume it will get: the default
	// host, editor.codecogs.com, currently serves an older stylesheet that predates the
	// CCEqnEditor/CCMathViewHost/CCLatexInput class names entirely (only a local dev mirror
	// does not have this gap) - so the toggle switching views is written defensively here rather
	// than left to eqneditor.css, not merely made taller/its "off" case duplicated for safety:
	//  - hide whichever view data-latex says is not current, in both directions, since
	//    eqneditor.css may supply neither rule, either rule, or both depending on which host is
	//    configured;
	//  - the min-height below is roughly 50% taller than eqneditor.css's own default (on hosts
	//    where it has one) for either view, so the maths view in particular reads as the main
	//    event rather than a strip above the toolbar.
	// !important throughout, and injected once here rather than relying on load order against
	// eqneditor.css: which stylesheet's rule wins would otherwise depend on which finishes
	// loading last.
	function injectStyleOverridesOnce() {
		if ( document.getElementById( 'cc-eqneditor-style-overrides' ) ) return;
		var style = document.createElement( 'style' );
		style.id = 'cc-eqneditor-style-overrides';
		style.textContent =
			'.CCMathViewHost, .CCLatexInput { min-height: 220px !important; }' +
			'.CCEqnEditor[data-latex="on"] .CCMathViewHost { display: none !important; }' +
			'.CCEqnEditor[data-latex="off"] .CCLatexInput { display: none !important; }';
		document.head.appendChild( style );
	}

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

	var instanceCount = 0;

	tinymce.PluginManager.add( 'eqneditor', function ( editor, url ) {
		var n = ++instanceCount;
		var ids = {
			root: 'cc-eqn-wp4-' + n,
			history: 'cc-eqn-wp4-history-' + n,
			toolbar: 'cc-eqn-wp4-toolbar-' + n,
			mathview: 'cc-eqn-wp4-mathview-' + n,
			latexInput: 'cc-eqn-wp4-latex-' + n,
			preview: 'cc-eqn-wp4-preview-' + n,
			output: 'cc-eqn-wp4-output-' + n,
			toggle: 'cc-eqn-wp4-toggle-' + n
		};

		// WordPress itself has no equivalent to the other adapters' editor.getParam() config -
		// these read from window globals a wp-admin page (or a local dev build) can set before
		// TinyMCE initialises, e.g. <script>window.eqneditorServer = 'localhost:8010';</script>.
		var host = window.eqneditorServer || DEFAULT_HOST;
		var renderUrl = window.eqneditorRenderUrl || DEFAULT_RENDER_URL;
		var scriptUrl = window.eqneditorScriptUrl || ( 'https://' + host + '/eqneditor.api.min.js' );
		var cssUrl = window.eqneditorCssUrl || ( 'https://' + host + '/eqneditor.css' );

		// The maths view is the default and, by far, the more common thing to want on screen -
		// the LaTeX markup view is the opt-in. A returning author's last choice (the cookie)
		// wins over false.
		var showLatex = getShowLatexPreference( false );

		var apiReady = loadScriptOnce( scriptUrl );
		tinymce.DOM.loadCSS( cssUrl );

		var eqOutput = null, eqTextArea = null, eqMathView = null, eqToolbar = null;

		function panelHtml() {
			return '' +
				'<div id="' + ids.root + '" class="CCEqnEditor" data-latex="' + ( showLatex ? 'on' : 'off' ) + '">' +
					'<div class="CCEditorBar"><div id="' + ids.history + '" class="CCHistory"></div></div>' +
					'<div id="' + ids.toolbar + '"></div>' +
					'<div id="' + ids.latexInput + '" class="CCLatexInput" autocorrect="off" ' +
						'placeholder="Write LaTeX here..."></div>' +
					'<div id="' + ids.mathview + '" class="CCMathViewHost"></div>' +
					'<div id="' + ids.toggle + '" class="CCViewToggle">' +
						'<label class="cc-switch" title="Show or hide the LaTeX markup above the equation">' +
							'<input type="checkbox" data-latex-toggle' + ( showLatex ? ' checked' : '' ) + '>' +
							'<span class="cc-switch-track"><span class="cc-switch-knob"></span></span>' +
							'<span class="cc-switch-label">LaTeX markup</span>' +
						'</label>' +
					'</div>' +
					'<div id="' + ids.preview + '" class="CCEqnOutput">' +
						'<img id="' + ids.output + '" alt=""></div>' +
				'</div>';
		}

		function applyLatexVisible( visible ) {
			showLatex = visible;
			setShowLatexPreference( visible );

			var root = document.getElementById( ids.root );
			if ( root ) root.setAttribute( 'data-latex', visible ? 'on' : 'off' );

			var box = document.querySelector( '#' + ids.toggle + ' input[data-latex-toggle]' );
			if ( box ) box.checked = visible;

			if ( eqToolbar && !visible ) eqToolbar.setActiveTextArea( eqMathView || eqTextArea );
		}

		function mount() {
			eqOutput = new EqEditor.Output( ids.output );
			eqOutput.setRenderURL( renderUrl );

			eqTextArea = EqEditor.TextArea.link( ids.latexInput )
				.addOutput( eqOutput )
				.addHistoryMenu( new EqEditor.History( ids.history ) );

			eqToolbar = EqEditor.Toolbar.link( ids.toolbar, 'default', 1.4 ).addTextArea( eqTextArea );

			if ( typeof EqEditor.MathView !== 'undefined' ) {
				eqMathView = EqEditor.MathView.link( ids.mathview ).addTextArea( eqTextArea );
				eqToolbar.addMathView( eqMathView );
			} else {
				showLatex = true;
			}

			applyLatexVisible( showLatex );

			var toggle = document.getElementById( ids.toggle );
			if ( toggle ) {
				toggle.addEventListener( 'change', function ( e ) {
					if ( e.target.matches( 'input[data-latex-toggle]' ) ) {
						applyLatexVisible( e.target.checked );
					}
				} );
			}
		}

		function showDialog( latex ) {
			latex = latex || '';

			var dialog = editor.windowManager.open( {
				title: 'Equation Editor',
				width: 660,
				height: 720,
				body: [ { type: 'container', html: panelHtml() } ],
				buttons: [
					{ text: 'Cancel', onclick: 'close' },
					{
						text: 'Ok',
						subtype: 'primary',
						onclick: function () {
							var current = eqTextArea ? eqTextArea.getTextArea().textContent.trim() : '';
							if ( current ) {
								editor.execCommand( 'mceInsertContent', false,
									'<img src="' + escapeHtml( eqOutput.exportAs( 'url' ) ) + '" ' +
									'alt="' + escapeHtml( current ) + '">' );
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

			apiReady.then( function () {
				injectStyleOverridesOnce();
				mount();
				eqTextArea.clear();
				if ( latex ) eqTextArea.insert( latex, latex.length );
				eqTextArea.notifyOutputs();
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

		editor.on( 'DblClick', function ( e ) {
			var target = e.target;
			if ( !target || target.nodeName.toLowerCase() !== 'img' || !isEquationSrc( target.src ) ) return;

			var match = target.src.match( /(gif|svg|png)\.image\?(.*)/ );
			if ( match ) showDialog( decodeEquation( match[ 2 ] ) );
		} );
	} );
}() );
