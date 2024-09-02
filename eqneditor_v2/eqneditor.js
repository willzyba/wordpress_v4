/*
 * CodeCogs equation editor plugin for TinyMCE version 6.3
 * 
 * Requirements: tinymce^6.3
 * 
 * Simply load this file into your webpage after you have loaded the TinyMCE script
 * and initialise your TinyMCE instance at any point after that, making sure to add 'eqneditor' in
 * your list of plugins.
 */

(function() {
    tinymce.create('tinymce.plugins.cc_eqneditor', {

        init: function(editor, url) {

            console.log(url);
            // http://localhost:8080/wp-content/plugins/eqneditor_v2

            var host='latex.oncodecogs.com';
            var http=('https:' == document.location.protocol ? 'https://' : 'http://');

            // Load necessary javascript for editor from CodeCogs
            var sl = new tinymce.dom.ScriptLoader();
            sl.add(http+host+'/js/eqneditor.api.min.js');
            var loaded = sl.loadQueue();

            // Load custom CSS
            tinymce.DOM.loadCSS(http+host+'/css/eqneditor_1.css');
            
            editor.addCommand('showDialog', function() {
            
                var http = ('https:' == document.location.protocol ? 'https://' : 'http://');

                win = editor.windowManager.open({
                    title: 'Equation Editor',
                    size: 'medium',
                    body: {
                        type: 'panel',
                        items: [
                            {
                                type:'htmlpanel',
                                html:'<div id="equation-editor">'+
                                        '<div id="history"></div>'+
                                        '<div id="toolbar"></div>'+
                                        '<div id="latexInput" autocorrect="off"></div>'+
                                        '<div id="equation-output">'+
                                        '<img id="output"></div></div>'
                            }
                        ]
                    },
                    buttons : [
                        {
                            type: 'cancel',
                            name: 'closeButton',
                            text: 'Cancel'
                        },
                        {
                            type: 'submit',
                            name: 'submitButton',
                            text: 'Ok',
                            buttonType: 'primary'
                        },
                        {
                            type:'custom',
                            name: 'logo',
                            text: '',
                            image: url+'/image/logo.svg',
                            align: 'start'
                        }
                    ],
                    onSubmit: function(w) {
                        tinymce.activeEditor.execCommand('mceInsertContent', false, output.exportAs('html'));
                        textarea.pushToHistory();
                        w.close();
                    },
                    onCancel: function(w) {
                        w.close();
                    },
                    onAction: function(w, dets) {
                        if (dets.name == 'logo') {
                            window.open(http+'editor.codecogs.com', '_blank').focus();
                        }
                    }
                })

                // Ensure EqnEditor js is loaded before continuing
                loaded.then(() => {
                    output = new EqEditor.Output("output");
                    textarea = EqEditor.TextArea.link("latexInput")
                                .addOutput(output)
                                .addHistoryMenu(new EqEditor.History("history"));
                    EqEditor.Toolbar.link("toolbar").addTextArea(textarea);

                    var nodes = document.getElementById('history').childNodes;
                    for(var i=0; i<nodes.length; i++) { nodes[i].style.padding = 'revert'; }

                    textarea.clear();
                    textarea.insert(inp.replace(/&space;/g, ' '), inp.length);
                });
            });
            

            editor.addButton('cc_eqneditor', {
                title: 'Equation',
                image: url+'/image/menu.svg',
                tooltip: 'Insert Equation',
                onclick: function() {
                                    // Open your custom dialog here
                    editor.windowManager.open({
                        title: 'My Custom Dialog',
                        body: [
                            {
                                type: 'textbox',
                                name: 'textbox_name',
                                label: 'Text Box Label'
                            },
                            {
                                type: 'button',
                                text: 'Custom Button',
                                onclick: function() {
                                    // Handle button click inside the dialog
                                    alert('Button clicked!');
                                }
                            }
                        ],
                        onsubmit: function(e) {
                            // Handle dialog submission
                            editor.insertContent('Content to insert: ' + e.data.textbox_name);
                        }
                    });

                }
                // stateSelector: 'img[src*="latex"]'
            });
            
           /* editor.on('dblclick', function(e) {
            	if (e.target.nodeName.toLowerCase() == "img") {
            		var sName = e.target.src.match( /(gif|svg)\.image\?(.*)/ );
            		if(sName!=null) showDialog(sName[2]);
            	}
            });*/
            
            console.log('CodeCogs Editor Loaded');

            return {
                getMetadata: () => ({
                    name: 'EqnEditor',
                    url: 'https://editor.codecogs.com/docs/3-Tiny_MCE_v4x.php'
                })
            };
        },
        getInfo : function() {
            return {
                longname  : 'CodeCogs LaTeX Equation Editor',
                author    : 'CodeCogs',
                authorurl : 'https://editor.codecogs.com',
                infourl   : 'https://wordpress.org/plugins/codecogs_equation_editor/',
                version   : '2.0'
            };
        }
    });

    console.log('Register CodeCogs Editor');

 // Register plugin
    tinymce.PluginManager.add('cc_eqneditor', tinymce.plugins.cc_eqneditor);

})();
