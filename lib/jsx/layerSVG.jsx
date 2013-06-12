//
// Params: layerID, path
//

$.evalFile( app.path + "/" + localize("$$$/ScriptingSupport/Required=Required") + "/ConvertSVG.jsx" );
svg.createSVGfile( File( params.path ), [PSLayerInfo.layerIDToIndex( params.layerID )] );
