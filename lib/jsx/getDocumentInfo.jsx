/*global stringIDToTypeID, ActionDescriptor, executeAction, DialogModes */

var idNS = stringIDToTypeID("sendDocumentInfoToNetworkClient");
var k, desc = new ActionDescriptor();
desc.putString(stringIDToTypeID("version"), "1.0");

var flags = {
    compInfo:           true,
    imageInfo:          true,
    layerInfo:          true,
    expandSmartObjects: false,
    getTextStyles:      true,
    selectedLayers:     true,
    getCompSettings:    true
};

for (k in flags) {
    if (flags.hasOwnProperty(k)) {
        desc.putBoolean(stringIDToTypeID(k), flags[k]);
    }
}
executeAction(idNS, desc, DialogModes.NO);
