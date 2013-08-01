/*global stringIDToTypeID, ActionDescriptor, executeAction, DialogModes, params */
// Required params:
//   - flags: An object with flags as keys and boolean values
//     Sample: {
//         compInfo:           true,
//         imageInfo:          true,
//         layerInfo:          true,
//         expandSmartObjects: false,
//         getTextStyles:      true,
//         selectedLayers:     true,
//         getCompSettings:    true
//     }
// Optional params:
//   - documentId: The ID of the document requested (leave null for current document)

var idNS = stringIDToTypeID("sendDocumentInfoToNetworkClient");
var k, desc = new ActionDescriptor();
desc.putString(stringIDToTypeID("version"), "1.0");

var flags = params.flags;

for (k in flags) {
    if (flags.hasOwnProperty(k)) {
        desc.putBoolean(stringIDToTypeID(k), flags[k]);
    }
}

if (params.documentId) {
    desc.putInteger(stringIDToTypeID("documentID"), params.documentId);
}
executeAction(idNS, desc, DialogModes.NO);
