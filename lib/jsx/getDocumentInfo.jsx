/*global stringIDToTypeID, ActionDescriptor, executeAction, DialogModes, params */
// Required params:
//   - flags: An object with flags as keys and boolean values
//     Sample: {
//         compInfo:             true,
//         imageInfo:            true,
//         layerInfo:            true,
//         expandSmartObjects:   false,
//         getTextStyles:        true,
//         getFullTextStyles:    false,
//         selectedLayers:       true,  // Whether to only return information about the selected layers
//         getCompLayerSettings: true,   // Whether to return layer comp settings for each layer
//         getDefaultLayerFX:    false,
//         getPathData:          false
//     }
// Optional params:
//   - documentId: The ID of the document requested (leave null for current document)

var idNS = stringIDToTypeID("sendDocumentInfoToNetworkClient");
var desc = new ActionDescriptor();
desc.putString(stringIDToTypeID("version"), "1.0.1");

var flags = params.flags;

var k;
for (k in flags) {
    if (flags.hasOwnProperty(k)) {
        desc.putBoolean(stringIDToTypeID(k), flags[k]);
    }
}

if (params.documentId) {
    desc.putInteger(stringIDToTypeID("documentID"), params.documentId);
}
executeAction(idNS, desc, DialogModes.NO);
