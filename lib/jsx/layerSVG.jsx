/*global $, app, File, localize, params, svg */

// Expected params:
//   - layerID: ID of layer to generate SVG info for

// "File" is an ExtendScript global that does not require the use of "new".
var appFolder = { Windows: "/", Macintosh: "/Adobe Photoshop CC.app/Contents/" };
$.evalFile(app.path + appFolder[File.fs] + localize("$$$/ScriptingSupport/Required=Required") + "/ConvertSVG.jsx");

/*jshint newcap: false */
svg.generateFileByID(params.layerID);
/*jshint newcap: true */