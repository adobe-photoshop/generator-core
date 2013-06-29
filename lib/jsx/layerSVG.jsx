/*global $, app, localize, params, svg */

// Expected params:
//   - layerID: ID of layer to generate SVG info for


$.evalFile(app.path + "/" + localize("$$$/ScriptingSupport/Required=Required") + "/ConvertSVG.jsx");

// "File" is an ExtendScript global that does not require the use of "new".
/*jshint newcap: false */
svg.generateFileByID(params.layerID);
/*jshint newcap: true */