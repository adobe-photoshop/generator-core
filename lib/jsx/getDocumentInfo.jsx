/*global params, stringIDToTypeID, ActionDescriptor, executeAction, DialogModes */

// Expected params:
//   - flags: {compInfo:bool, imageInfo:bool, layerInfo:bool, 
//             expandSmartObjects:bool, getTextStyles:bool, 
//             selectedLayers:bool, getCompSettings:bool}


var idNS = stringIDToTypeID("sendDocumentInfoToNetworkClient");
var k, desc = new ActionDescriptor();
desc.putString(stringIDToTypeID("version"), "1.0");
//these default to true if none specified
for (k in params.flags) {
    if (params.flags.hasOwnProperty(k)) {
        desc.putBoolean(stringIDToTypeID(k), params.flags[k]);
    }
}
executeAction(idNS, desc, DialogModes.NO);
